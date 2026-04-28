import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withAIOperator } from '../../auth/middleware.js';
import {
  callOpenRouter,
  type OpenRouterCallInput,
  type OpenRouterCallResult,
} from '../../openrouter.js';
import { createRunBudget } from '../../lib/generation-budget.js';
import {
  buildPromptRefLookup,
  substitutePromptRefs,
} from '../../lib/prompt-refs.js';
import { renderTemplate } from '../../lib/render-template.js';

// TODO(strict-mode): Remove these Extract<> assertions when tsconfig
// enables `strict: true` (or at least `strictNullChecks: true`). With
// strictness off, TS collapses `number | null` to `number` and the
// discriminated-union narrowing on `if (result.ok)` doesn't survive
// across the async Promise.allSettled callback boundary — the branches
// see the full union rather than the narrowed variant. See the running
// thread on narrowing through closures:
//   https://github.com/microsoft/TypeScript/issues/9998
// Once strict mode is on, `result.kind` / `result.output` should narrow
// automatically and these `as` casts can come out.
type OkVariant = Extract<OpenRouterCallResult, { ok: true }>;
type ErrorVariant = Extract<OpenRouterCallResult, { ok: false }>;
import { createSSEStream, sseHeaders } from '../../sse.js';

/**
 * POST /api/campaigns/:id/generate
 *
 * SSE-streams generation progress for every (prompt × campaign_model)
 * slot in the campaign. Fans out with Promise.allSettled so one model
 * timing out doesn't kill the batch.
 *
 * Events (all JSON):
 *   - event: start  — { total }
 *   - event: slot   — { promptId, campaignModelId, status: 'ok',
 *                       tokensIn, tokensOut, latencyMs, costUsd, output }
 *                   | { promptId, campaignModelId, status: 'error',
 *                       kind, message, latencyMs }
 *   - event: done   — { succeeded, failed, total }
 *
 * Persistence: each slot is UPSERTED into generations (unique on
 * (prompt_id, campaign_model_id)), so retries overwrite. Errors are
 * stored too — `output` stays null, `error` is populated.
 *
 * Retry semantics: calling this endpoint again runs the full fan-out
 * again. Pass `?only=failed` to re-run just the slots whose prior
 * attempt recorded an error (leaving successes untouched).
 *
 * Campaign state: only allowed when status='draft'. Generating against
 * an active campaign is rejected — it would mutate the outputs that
 * participants are already voting on.
 */
export const generateCampaignWebHandler = withAIOperator(async (request: Request) => {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const url = new URL(request.url);
  const campaignId = extractCampaignId(url);
  if (!campaignId) {
    return json({ error: 'missing campaign id in URL' }, 400);
  }
  const onlyFailed = url.searchParams.get('only') === 'failed';

  // Optional budget cap (USD) for this run. Operator sets per-run; not
  // persisted on the campaign. Accept from either body (preferred) or
  // query string. Invalid / non-positive values silently disable
  // enforcement.
  let budgetUsd: number | null = null;
  const queryBudget = url.searchParams.get('budgetUsd');
  if (queryBudget !== null) {
    const parsed = Number.parseFloat(queryBudget);
    if (Number.isFinite(parsed) && parsed > 0) budgetUsd = parsed;
  }
  if (budgetUsd === null && request.headers.get('content-type')?.includes('application/json')) {
    try {
      const body = (await request.clone().json()) as { budgetUsd?: unknown };
      if (typeof body.budgetUsd === 'number' && Number.isFinite(body.budgetUsd) && body.budgetUsd > 0) {
        budgetUsd = body.budgetUsd;
      }
    } catch {
      /* ignore body parse errors — body is optional */
    }
  }

  const db = getDb();

  const campaign = (
    await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1)
  )[0];
  if (!campaign || campaign.deletedAt)
    return json({ error: 'campaign not found' }, 404);
  if (campaign.status !== 'draft') {
    return json(
      {
        error: `generation only allowed on draft campaigns; this one is ${campaign.status}`,
      },
      409,
    );
  }

  const [prompts, campaignModels] = await Promise.all([
    db
      .select()
      .from(schema.prompts)
      .where(eq(schema.prompts.campaignId, campaignId)),
    db
      .select()
      .from(schema.campaignModels)
      .where(eq(schema.campaignModels.campaignId, campaignId)),
  ]);

  if (prompts.length === 0 || campaignModels.length === 0) {
    return json(
      { error: 'campaign has no prompts or no models' },
      400,
    );
  }

  // One slot per (prompt, campaign_model). Ordered so the UI progress
  // feels deterministic even though the calls fan out concurrently.
  let slots = prompts
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .flatMap((p) =>
      campaignModels.map((m) => ({ prompt: p, model: m })),
    );

  if (onlyFailed) {
    const promptIds = prompts.map((p) => p.id);
    const modelIds = campaignModels.map((m) => m.id);
    const failedRows =
      promptIds.length === 0 || modelIds.length === 0
        ? []
        : await db
            .select({
              promptId: schema.generations.promptId,
              campaignModelId: schema.generations.campaignModelId,
            })
            .from(schema.generations)
            .where(
              and(
                inArray(schema.generations.promptId, promptIds),
                inArray(schema.generations.campaignModelId, modelIds),
                isNotNull(schema.generations.error),
              ),
            );
    const failedSet = new Set(
      failedRows.map((r) => `${r.promptId}:${r.campaignModelId}`),
    );
    slots = slots.filter((s) =>
      failedSet.has(`${s.prompt.id}:${s.model.id}`),
    );
  }

  const runBudget = createRunBudget({
    runId: `gen:${campaignId}:${Date.now()}`,
    capUsd: budgetUsd,
  });

  // Build the prompt-ref lookup once per run. Referenced prompts are
  // substituted into the final text sent to OpenRouter — @p1 → the first
  // prompt's text, etc. Unresolved refs pass through literally. This
  // stays independent of the `onlyFailed` filter: a retried slot still
  // sees the same substituted prompt.
  const refLookup = buildPromptRefLookup(
    prompts.map((p) => ({ orderIndex: p.orderIndex, text: p.text })),
  );

  const stream = createSSEStream(async (send, signal) => {
    send('start', {
      total: slots.length,
      budgetUsd: runBudget.capUsd,
    });
    if (slots.length === 0) {
      send('done', { succeeded: 0, failed: 0, total: 0 });
      return;
    }

    let succeeded = 0;
    let failed = 0;
    let skippedForBudget = 0;

    // Concurrency cap: fan out all at once. OpenRouter's rate limits are
    // per-provider; this is fine for <50 slots (our realistic campaign
    // size). If we ever need to throttle, a simple semaphore goes here.
    const results = await Promise.allSettled(
      slots.map(async ({ prompt, model }) => {
        // Substitute @pN prompt-refs before the model sees the prompt.
        // Budget preflight uses the resolved text so cost estimates
        // reflect what'll actually be sent. @pN substitution applies
        // only to the test-case text (kind='model' uses it directly;
        // kind='prompt' feeds it through `{{input}}` substitution
        // inside the variant template via assembleCall).
        const resolvedPromptText = substitutePromptRefs(prompt.text, refLookup);

        // Plan 04 — per-kind call assembly. For kind='model' this
        // produces the same shape the legacy code did; for prompt /
        // system_prompt arenas the contestant's `variantText` drives
        // the variable axis and the campaign's pinned model is held
        // constant.
        const callInput = assembleCall({
          campaign,
          contestant: model,
          testCase: { text: resolvedPromptText, context: prompt.context },
        });

        const slotBudgetInput = {
          providerModelId: callInput.providerModelId,
          promptText: `${callInput.context ?? ''}\n${callInput.prompt}`,
        };
        const pre = runBudget.preflight(slotBudgetInput);
        if (!pre.allow) {
          // Non-strict tsconfig loses narrowing across async callbacks.
          const denied = pre as {
            allow: false;
            reason: string;
            estimatedUsd: number;
          };
          skippedForBudget++;
          send('budget_exceeded', {
            promptId: prompt.id,
            campaignModelId: model.id,
            modelDisplayName: model.displayName,
            reason: denied.reason,
            estimatedUsd: denied.estimatedUsd,
            spentUsd: runBudget.spentUsd(),
            capUsd: runBudget.capUsd,
          });
          return;
        }
        const allowed = pre as { allow: true; reservedUsd: number };

        const result = await callOpenRouter({
          providerModelId: callInput.providerModelId,
          prompt: callInput.prompt,
          context: callInput.context,
          params: callInput.params,
          signal,
        });

        // tsconfig has `strict: false`, so TS's narrowing of
        // discriminated unions via `result.ok` doesn't carry through
        // async callbacks reliably. Use explicit Extract assertions so
        // the code is unambiguous regardless of strictness.
        if (!result.ok) {
          const err = result as ErrorVariant;
          // Reconcile the reservation even on failure so the ledger
          // doesn't leak committed-but-unspent dollars.
          runBudget.commit(slotBudgetInput, allowed.reservedUsd, {
            tokensIn: 0,
            tokensOut: 0,
            usd: 0,
          });
          await upsertGenerationError(db, prompt, model, err);
          failed++;
          send('slot', {
            promptId: prompt.id,
            campaignModelId: model.id,
            modelDisplayName: model.displayName,
            status: 'error',
            kind: err.kind,
            message: err.message,
            latencyMs: err.latencyMs,
          });
          return;
        }

        const ok = result as OkVariant;
        runBudget.commit(slotBudgetInput, allowed.reservedUsd, {
          tokensIn: ok.tokensIn ?? 0,
          tokensOut: ok.tokensOut ?? 0,
          usd: ok.costUsd ?? 0,
        });
        await upsertGeneration(db, prompt, model, ok);
        succeeded++;
        send('slot', {
          promptId: prompt.id,
          campaignModelId: model.id,
          modelDisplayName: model.displayName,
          status: 'ok',
          tokensIn: ok.tokensIn,
          tokensOut: ok.tokensOut,
          latencyMs: ok.latencyMs,
          costUsd: ok.costUsd,
          output: ok.output,
        });
      }),
    );

    // Promise.allSettled only rejects if `upsertGeneration` itself throws
    // (i.e. DB failure). Surface those as additional slot errors.
    for (const r of results) {
      if (r.status === 'rejected') {
        send('error', {
          message:
            r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }

    send('done', {
      succeeded,
      failed,
      skippedForBudget,
      total: slots.length,
      spentUsd: runBudget.spentUsd(),
    });
  });

  return new Response(stream, { status: 200, headers: sseHeaders() });
});

/**
 * Plan 04 — per-kind generation call assembly. Pure function: given a
 * campaign, a contestant row (`campaign_models`, polymorphic since
 * Plan 04), and a test-case prompt, returns the `OpenRouterCallInput`
 * the runtime should send.
 *
 * Kind semantics (PRD → "Generation router"):
 *   - `model`         → contestant supplies the provider model id and
 *                       params; the test case supplies the user prompt
 *                       and the system context.
 *   - `prompt`        → campaign supplies the pinned model. The variant
 *                       template gets `{{input}}` substituted with the
 *                       test case text. The system message is the
 *                       campaign's `pinnedSystemPrompt` if set, else
 *                       the per-test-case `context`.
 *   - `system_prompt` → campaign supplies the pinned model. The variant
 *                       text becomes the system message; the test case
 *                       text becomes the user prompt.
 *
 * No DB access, no I/O. Caller is responsible for pre-substituting
 * `@pN` references on the test case text (existing prompt-refs path),
 * and for the standalone-variants flag (Plan 05 wires it).
 */
export interface AssembleCallInput {
  campaign: Pick<
    schema.Campaign,
    'kind' | 'pinnedProviderModelId' | 'pinnedSystemPrompt'
  >;
  contestant: Pick<
    schema.CampaignModel,
    'providerModelId' | 'variantText' | 'params'
  >;
  testCase: { text: string; context: string | null } | null;
}

export function assembleCall(input: AssembleCallInput): OpenRouterCallInput {
  const { campaign, contestant, testCase } = input;

  switch (campaign.kind) {
    case 'model':
      // Legacy path. `providerModelId` is enforced NOT NULL by CHECK
      // when kind='model'; the `!` reflects the schema invariant.
      return {
        providerModelId: contestant.providerModelId!,
        context: testCase?.context ?? null,
        prompt: testCase?.text ?? '',
        params:
          (contestant.params as Record<string, unknown> | null) ?? undefined,
      };

    case 'prompt':
      // Pinned model is required by CHECK constraint when kind != 'model'.
      // Variant text is required by CHECK when kind != 'model'.
      // Held-constant system message: pinnedSystemPrompt wins, else the
      // test-case's per-row context, else null.
      return {
        providerModelId: campaign.pinnedProviderModelId!,
        context:
          campaign.pinnedSystemPrompt ?? testCase?.context ?? null,
        prompt: renderTemplate(contestant.variantText!, testCase?.text ?? ''),
      };

    case 'system_prompt':
      // The variant IS the system message; the test case is the user prompt.
      return {
        providerModelId: campaign.pinnedProviderModelId!,
        context: contestant.variantText!,
        prompt: testCase?.text ?? '',
      };
  }
}

/**
 * Split helpers so each caller passes a narrowed variant. Calling a
 * helper that takes the full union loses narrowing back at the call
 * site; two focused helpers keep it intact.
 */

interface OkResult {
  output: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number;
  costUsd: number | null;
  providerResponseId: string | null;
}

interface ErrorResult {
  kind: string;
  message: string;
  latencyMs: number;
}

async function upsertGeneration(
  db: ReturnType<typeof getDb>,
  prompt: schema.Prompt,
  model: schema.CampaignModel,
  result: OkResult,
): Promise<void> {
  const now = new Date();
  await db
    .insert(schema.generations)
    .values({
      promptId: prompt.id,
      campaignModelId: model.id,
      output: result.output,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: result.latencyMs,
      costUsd: result.costUsd != null ? result.costUsd.toString() : null,
      providerResponseId: result.providerResponseId,
      error: null,
      completedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.generations.promptId, schema.generations.campaignModelId],
      set: {
        output: result.output,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        latencyMs: result.latencyMs,
        costUsd: result.costUsd != null ? result.costUsd.toString() : null,
        providerResponseId: result.providerResponseId,
        error: null,
        completedAt: now,
      },
    });
}

async function upsertGenerationError(
  db: ReturnType<typeof getDb>,
  prompt: schema.Prompt,
  model: schema.CampaignModel,
  result: ErrorResult,
): Promise<void> {
  const now = new Date();
  const errText = `${result.kind}: ${result.message}`.slice(0, 1000);
  await db
    .insert(schema.generations)
    .values({
      promptId: prompt.id,
      campaignModelId: model.id,
      output: null,
      latencyMs: result.latencyMs,
      error: errText,
      completedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.generations.promptId, schema.generations.campaignModelId],
      set: {
        output: null,
        tokensIn: null,
        tokensOut: null,
        costUsd: null,
        providerResponseId: null,
        latencyMs: result.latencyMs,
        error: errText,
        completedAt: now,
      },
    });
}

function extractCampaignId(url: URL): string | null {
  // /api/campaigns/:id/generate → id is the 3rd segment after /api
  const parts = url.pathname.split('/').filter(Boolean);
  // ['api', 'campaigns', ':id', 'generate']
  if (parts[0] === 'api' && parts[1] === 'campaigns' && parts[3] === 'generate') {
    return parts[2] || null;
  }
  return null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
