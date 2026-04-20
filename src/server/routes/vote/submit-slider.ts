import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withParticipant } from '../../auth/middleware.js';
import { recomputeCampaignRatings } from '../../ratings.js';

/**
 * POST /api/vote/:slug/submit-slider
 * Body: {
 *   promptId: uuid,
 *   campaignModelId: uuid,
 *   generationId: uuid,     // what the server served; rejects mismatches
 *   score: integer
 * }
 *
 * Writes a row into slider_responses, gated by:
 *   - Participant must be started for this campaign's slug
 *   - Prompt must belong to the campaign and be mode='slider'
 *   - Generation must match the (prompt, model) pair
 *   - Score must fall inside the prompt's mode_config range (or 1..10
 *     if the prompt had no explicit config)
 *
 * The unique (participant, prompt, model) index makes duplicate
 * submissions idempotent — we detect the violation and return
 * `{ ok: true, dedup: true }` without erroring.
 */
export const voteSubmitSliderWebHandler = withParticipant(
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
    const parsed = parseSliderSubmit(body);
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
    if (prompt.mode !== 'slider') {
      return json(
        { error: `prompt mode is ${prompt.mode}, not slider` },
        409,
      );
    }

    // Validate score against mode_config (falls back to 1..10 when no
    // config was set — matches the UI's default slider range).
    const cfg = (prompt.modeConfig ?? {}) as { min?: unknown; max?: unknown };
    const min = typeof cfg.min === 'number' ? cfg.min : 1;
    const max = typeof cfg.max === 'number' ? cfg.max : 10;
    if (parsed.score < min || parsed.score > max) {
      return json(
        { error: `score must be between ${min} and ${max}` },
        400,
      );
    }

    // The generation the server served must match (prompt, model). Guards
    // against clients stitching together IDs from different runs.
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
      await db.insert(schema.sliderResponses).values({
        campaignId: campaign.id,
        participantId: participant.id,
        promptId: prompt.id,
        campaignModelId: parsed.campaignModelId,
        sessionId: crypto.randomUUID(),
        score: parsed.score,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate key|uniq_slider_response/i.test(msg)) {
        return json(
          { ok: true, dedup: true, message: 'already rated this pair' },
          200,
        );
      }
      throw err;
    }

    // Ratings recompute kicks per-mode aggregates for this campaign.
    // Synchronous + try/catch so a compute failure doesn't block the
    // submit path — stale leaderboards are a better failure mode than
    // rejected votes.
    try {
      await recomputeCampaignRatings(campaign.id);
    } catch (err) {
      console.error('[submit-slider] rating recompute failed (non-fatal):', err);
    }

    return json({ ok: true }, 200);
  },
);

interface ParsedSliderSubmit {
  promptId: string;
  campaignModelId: string;
  generationId: string;
  score: number;
}

function parseSliderSubmit(
  input: unknown,
): ParsedSliderSubmit | { error: string } {
  if (typeof input !== 'object' || input === null)
    return { error: 'body must be an object' };
  const o = input as Record<string, unknown>;
  const promptId = typeof o.promptId === 'string' ? o.promptId : '';
  const campaignModelId =
    typeof o.campaignModelId === 'string' ? o.campaignModelId : '';
  const generationId =
    typeof o.generationId === 'string' ? o.generationId : '';
  const score = typeof o.score === 'number' ? o.score : NaN;

  if (!promptId) return { error: 'promptId required' };
  if (!campaignModelId) return { error: 'campaignModelId required' };
  if (!generationId) return { error: 'generationId required' };
  if (!Number.isFinite(score) || !Number.isInteger(score))
    return { error: 'score must be an integer' };

  return { promptId, campaignModelId, generationId, score };
}

function extractSlug(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts[0] === 'api' &&
    parts[1] === 'vote' &&
    parts[3] === 'submit-slider'
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
