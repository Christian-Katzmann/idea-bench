/**
 * POST /api/personas/:id/test
 *
 * Authoring aid — runs a single judge call against an operator-
 * provided sample prompt + output using this persona's system prompt,
 * then returns the raw judge reply. No database writes, no ratings
 * impact. Designed for the persona library's "Test" button: type a
 * prompt and a sample response, see what the persona would say.
 *
 * Cost is one judge call (a few cents at most on the cheap tier). The
 * endpoint uses the same cross-family exclusion + openrouter plumbing
 * as a real run, so quirks surfaced here are quirks the real runs will
 * see too.
 *
 * Only qualitative mode is supported in Phase 3 polish — it's the most
 * authoring-useful mode because the raw free-text reply reveals the
 * persona's personality. Other modes (slider / multi-axis) can be
 * added later; they follow the same shape.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withAIOperator } from '../../auth/middleware.js';
import { judgeQualitative } from '../../simulated-runs/judge-calls.js';
import {
  defaultGenericMix,
  isJudgeAllowed,
} from '../../simulated-runs/index.js';
import { isKnownModel, lookupModel } from '../../../lib/models.js';

interface TestRequest {
  promptText: string;
  output: string;
  /**
   * Which provider model to use as the judge. Falls back to the
   * cheapest default from the generic mix (`anthropic/claude-haiku-4-5`
   * by convention) when omitted. Cross-family exclusion still applies.
   */
  judgeModelId?: string;
  /** Optional — only used when the prompt being evaluated came from a
   *  real campaign. Lets the test mimic realistic judging conditions. */
  targetModelId?: string;
  /**
   * Overrides the saved persona's system prompt for this one call.
   * Lets the authoring form preview unsaved edits without forcing a
   * save-first loop. When omitted the saved prompt is used.
   */
  systemPromptOverride?: string;
}

const MAX_TEXT_LENGTH = 4000;

export const testPersonaWebHandler = withAIOperator(async (request) => {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  const url = new URL(request.url);
  const personaId = extractPersonaId(url);
  if (!personaId) return json({ error: 'missing persona id' }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const parsed = parseTestRequest(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  // `__draft` is a sentinel personaId used by the authoring UI to
  // preview a persona that hasn't been saved yet. It requires the
  // caller to supply `systemPromptOverride` in the body — there's no
  // saved prompt to fall back to.
  const isDraft = personaId === '__draft';
  let persona: schema.Persona | null = null;
  if (!isDraft) {
    const db = getDb();
    [persona] = await db
      .select()
      .from(schema.personas)
      .where(eq(schema.personas.id, personaId))
      .limit(1);
    if (!persona) return json({ error: 'persona not found' }, 404);
  } else if (!parsed.systemPromptOverride?.trim()) {
    return json(
      { error: 'systemPromptOverride is required when previewing an unsaved draft' },
      400,
    );
  }

  // Cheapest default: first entry of the generic mix. Operator can
  // override via judgeModelId to preview how a different family
  // interprets the persona prompt.
  const judgeModelId =
    parsed.judgeModelId ?? defaultGenericMix()[0].providerModelId;
  if (!isKnownModel(judgeModelId)) {
    return json({ error: `unknown judgeModelId: ${judgeModelId}` }, 400);
  }

  // Cross-family exclusion — same rule as a real run. If the operator
  // picked a same-family judge as the target, fail fast with a
  // specific explanation so it doesn't look like a silent no-op.
  if (parsed.targetModelId) {
    if (!isKnownModel(parsed.targetModelId)) {
      return json(
        { error: `unknown targetModelId: ${parsed.targetModelId}` },
        400,
      );
    }
    if (!isJudgeAllowed(judgeModelId, [parsed.targetModelId])) {
      return json(
        {
          error: `judge ${judgeModelId} shares a family with ${parsed.targetModelId} — pick a different judge to avoid self-preference bias`,
        },
        400,
      );
    }
  }

  const effectiveSystemPrompt =
    parsed.systemPromptOverride?.trim() || persona?.systemPrompt || '';

  const outcome = await judgeQualitative({
    seat: {
      judgeModelId,
      personaSystemPrompt: effectiveSystemPrompt,
    },
    prompt: {
      promptText: parsed.promptText,
      promptContext: null,
    },
    output: parsed.output,
    // Defensive: any string works since we're not writing the result.
    targetProviderModelId: parsed.targetModelId ?? 'test/sentinel',
  });

  if (outcome.kind === 'skipped') {
    return json(
      {
        ok: false,
        reason: 'skipped',
        message: outcome.message,
      },
      200,
    );
  }
  if (outcome.kind === 'failed') {
    return json(
      {
        ok: false,
        reason: outcome.reason,
        message: outcome.message,
        latencyMs: outcome.latencyMs,
      },
      200,
    );
  }

  return json(
    {
      ok: true,
      reply: outcome.payload,
      judgeModelId,
      judgeDisplayName: lookupModel(judgeModelId)?.displayName ?? judgeModelId,
      costUsd: outcome.costUsd,
      latencyMs: outcome.latencyMs,
      persona: persona
        ? { id: persona.id, name: persona.name }
        : { id: '__draft', name: 'Draft' },
    },
    200,
  );
});

function parseTestRequest(input: unknown): TestRequest | { error: string } {
  if (typeof input !== 'object' || input === null)
    return { error: 'body must be an object' };
  const o = input as Record<string, unknown>;
  const promptText = typeof o.promptText === 'string' ? o.promptText.trim() : '';
  const output = typeof o.output === 'string' ? o.output.trim() : '';
  if (!promptText) return { error: 'promptText is required' };
  if (!output) return { error: 'output is required' };
  if (promptText.length > MAX_TEXT_LENGTH)
    return { error: `promptText must be ≤ ${MAX_TEXT_LENGTH} characters` };
  if (output.length > MAX_TEXT_LENGTH)
    return { error: `output must be ≤ ${MAX_TEXT_LENGTH} characters` };
  const systemPromptOverride =
    typeof o.systemPromptOverride === 'string'
      ? o.systemPromptOverride
      : undefined;
  if (systemPromptOverride && systemPromptOverride.length > MAX_TEXT_LENGTH) {
    return {
      error: `systemPromptOverride must be ≤ ${MAX_TEXT_LENGTH} characters`,
    };
  }
  return {
    promptText,
    output,
    judgeModelId:
      typeof o.judgeModelId === 'string' ? o.judgeModelId : undefined,
    targetModelId:
      typeof o.targetModelId === 'string' ? o.targetModelId : undefined,
    systemPromptOverride,
  };
}

function extractPersonaId(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  // /api/personas/:id (the ?action=test query is read by the dispatcher)
  if (parts[0] === 'api' && parts[1] === 'personas' && parts[2]) {
    return parts[2];
  }
  return null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
