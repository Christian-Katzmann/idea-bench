import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withParticipant } from '../../auth/middleware.js';
import { recomputeCampaignRatings } from '../../ratings.js';

/**
 * POST /api/vote/:slug/submit-multi-axis
 * Body: {
 *   promptId: uuid,
 *   campaignModelId: uuid,
 *   generationId: uuid,
 *   scores: { [dimensionKey]: integer }
 * }
 *
 * Writes a row into multi_axis_responses. Validates that:
 *   - The prompt is mode='multi_axis' with a defined dimensions config
 *   - Every declared dimension key has a numeric score
 *   - Each score falls within that dimension's min/max
 *   - Generation matches the (prompt, model) pair
 *
 * Unique (participant, prompt, model) index makes dupes idempotent.
 */
export const voteSubmitMultiAxisWebHandler = withParticipant(
  async (request, ctx) => {
    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }

    const slug = extractSlug(new URL(request.url));
    if (!slug) return json({ error: 'missing slug' }, 400);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid JSON' }, 400);
    }
    const parsed = parseMultiAxisSubmit(body);
    if ('error' in parsed) return json({ error: parsed.error }, 400);

    const db = getDb();
    const [campaign] = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.shareSlug, slug))
      .limit(1);
    if (!campaign) return json({ error: 'campaign not found' }, 404);
    if (campaign.status !== 'active') {
      return json({ error: `campaign is ${campaign.status}` }, 410);
    }

    const [participant] = await db
      .select()
      .from(schema.participants)
      .where(
        and(
          eq(schema.participants.cookieId, ctx.participantCookieId),
          eq(schema.participants.campaignId, campaign.id),
        ),
      )
      .limit(1);
    if (!participant) return json({ error: 'participant not started' }, 409);

    const [prompt] = await db
      .select()
      .from(schema.prompts)
      .where(eq(schema.prompts.id, parsed.promptId))
      .limit(1);
    if (!prompt || prompt.campaignId !== campaign.id) {
      return json({ error: 'prompt not found for this campaign' }, 404);
    }
    if (prompt.mode !== 'multi_axis') {
      return json(
        { error: `prompt mode is ${prompt.mode}, not multi_axis` },
        409,
      );
    }

    // Validate scores against dimensions config. Falls back to "no
    // dimensions defined" → reject; multi_axis is meaningless without them.
    const cfg = prompt.modeConfig as
      | { dimensions?: Array<{ key: string; label: string; min: number; max: number }> }
      | null;
    if (!cfg || !Array.isArray(cfg.dimensions) || cfg.dimensions.length === 0) {
      return json(
        { error: 'prompt has no multi-axis dimensions configured' },
        500,
      );
    }
    for (const dim of cfg.dimensions) {
      const value = parsed.scores[dim.key];
      if (value === undefined) {
        return json(
          { error: `missing score for dimension: ${dim.key}` },
          400,
        );
      }
      if (!Number.isInteger(value)) {
        return json(
          { error: `score for ${dim.key} must be an integer` },
          400,
        );
      }
      if (value < dim.min || value > dim.max) {
        return json(
          {
            error: `score for ${dim.key} must be between ${dim.min} and ${dim.max}`,
          },
          400,
        );
      }
    }

    const [gen] = await db
      .select()
      .from(schema.generations)
      .where(eq(schema.generations.id, parsed.generationId))
      .limit(1);
    if (
      !gen ||
      gen.promptId !== prompt.id ||
      gen.campaignModelId !== parsed.campaignModelId
    ) {
      return json(
        { error: 'generation does not match the prompt/model pair' },
        400,
      );
    }

    try {
      await db.insert(schema.multiAxisResponses).values({
        campaignId: campaign.id,
        participantId: participant.id,
        promptId: prompt.id,
        campaignModelId: parsed.campaignModelId,
        sessionId: crypto.randomUUID(),
        scores: parsed.scores,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate key|uniq_multi_axis_response/i.test(msg)) {
        return json(
          { ok: true, dedup: true, message: 'already rated this pair' },
          200,
        );
      }
      throw err;
    }

    try {
      await recomputeCampaignRatings(campaign.id);
    } catch (err) {
      console.error(
        '[submit-multi-axis] rating recompute failed (non-fatal):',
        err,
      );
    }

    return json({ ok: true }, 200);
  },
);

interface ParsedMultiAxisSubmit {
  promptId: string;
  campaignModelId: string;
  generationId: string;
  scores: Record<string, number>;
}

function parseMultiAxisSubmit(
  input: unknown,
): ParsedMultiAxisSubmit | { error: string } {
  if (typeof input !== 'object' || input === null)
    return { error: 'body must be an object' };
  const o = input as Record<string, unknown>;
  const promptId = typeof o.promptId === 'string' ? o.promptId : '';
  const campaignModelId =
    typeof o.campaignModelId === 'string' ? o.campaignModelId : '';
  const generationId =
    typeof o.generationId === 'string' ? o.generationId : '';

  if (!promptId) return { error: 'promptId required' };
  if (!campaignModelId) return { error: 'campaignModelId required' };
  if (!generationId) return { error: 'generationId required' };

  if (typeof o.scores !== 'object' || o.scores === null) {
    return { error: 'scores must be an object' };
  }
  const scoresRaw = o.scores as Record<string, unknown>;
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(scoresRaw)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { error: `score for ${k} must be a number` };
    }
    scores[k] = v;
  }

  return { promptId, campaignModelId, generationId, scores };
}

function extractSlug(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts[0] === 'api' &&
    parts[1] === 'vote' &&
    parts[3] === 'submit-multi-axis'
  ) {
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
