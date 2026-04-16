import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../src/server/db/client';
import * as schema from '../../../src/server/db/schema';
import { withOperator } from '../../../src/server/auth/middleware';
import {
  callOpenRouter,
  type OpenRouterCallResult,
} from '../../../src/server/openrouter';

type OkVariant = Extract<OpenRouterCallResult, { ok: true }>;
type ErrorVariant = Extract<OpenRouterCallResult, { ok: false }>;
import { createSSEStream, sseHeaders } from '../../../src/server/sse';

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
 * again. An idempotent "only retry failed slots" path is deferred —
 * the operator can re-click Generate and let all slots re-run, which
 * is fine at the campaign sizes we care about.
 *
 * Campaign state: only allowed when status='draft'. Generating against
 * an active campaign is rejected — it would mutate the outputs that
 * participants are already voting on.
 */
export default withOperator(async (request: Request) => {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const campaignId = extractCampaignId(new URL(request.url));
  if (!campaignId) {
    return json({ error: 'missing campaign id in URL' }, 400);
  }

  const db = getDb();

  const campaign = (
    await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1)
  )[0];
  if (!campaign) return json({ error: 'campaign not found' }, 404);
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
  const slots = prompts
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .flatMap((p) =>
      campaignModels.map((m) => ({ prompt: p, model: m })),
    );

  const stream = createSSEStream(async (send, signal) => {
    send('start', { total: slots.length });

    let succeeded = 0;
    let failed = 0;

    // Concurrency cap: fan out all at once. OpenRouter's rate limits are
    // per-provider; this is fine for <50 slots (our realistic campaign
    // size). If we ever need to throttle, a simple semaphore goes here.
    const results = await Promise.allSettled(
      slots.map(async ({ prompt, model }) => {
        const result = await callOpenRouter({
          providerModelId: model.providerModelId,
          prompt: prompt.text,
          context: prompt.context,
          params:
            (model.params as Record<string, unknown> | null) ?? undefined,
          signal,
        });

        // tsconfig has `strict: false`, so TS's narrowing of
        // discriminated unions via `result.ok` doesn't carry through
        // async callbacks reliably. Use explicit Extract assertions so
        // the code is unambiguous regardless of strictness.
        if (!result.ok) {
          const err = result as ErrorVariant;
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

    send('done', { succeeded, failed, total: slots.length });
  });

  return new Response(stream, { status: 200, headers: sseHeaders() });
});

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
