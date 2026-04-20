import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withParticipant } from '../../auth/middleware.js';
import { recomputeCampaignRatings } from '../../ratings.js';

/**
 * POST /api/vote/:slug/submit-best-of-n
 * Body: {
 *   promptId: uuid,
 *   chosenCampaignModelId: uuid   // the model whose output was picked
 * }
 *
 * Writes a row into best_of_n_responses. The unique
 * (participant, prompt) index makes duplicate submissions idempotent.
 *
 * Unlike slider/approve_reject/multi_axis/qualitative — which pin a
 * `generationId` from the server to prevent cross-run stitching — best
 * of N has no ambiguity: the participant sees every model's output at
 * once and picks one. We still validate that the chosen model belongs
 * to this campaign.
 */
export const voteSubmitBestOfNWebHandler = withParticipant(
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
    const parsed = parseBestOfNSubmit(body);
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
    if (prompt.mode !== 'best_of_n') {
      return json(
        { error: `prompt mode is ${prompt.mode}, not best_of_n` },
        409,
      );
    }

    // Confirm the chosen model is in this campaign's model set.
    const [cm] = await db
      .select()
      .from(schema.campaignModels)
      .where(eq(schema.campaignModels.id, parsed.chosenCampaignModelId))
      .limit(1);
    if (!cm || cm.campaignId !== campaign.id) {
      return json(
        { error: 'chosen campaignModelId does not belong to this campaign' },
        400,
      );
    }

    try {
      await db.insert(schema.bestOfNResponses).values({
        campaignId: campaign.id,
        participantId: participant.id,
        promptId: prompt.id,
        chosenCampaignModelId: parsed.chosenCampaignModelId,
        sessionId: crypto.randomUUID(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate key|uniq_best_of_n_response/i.test(msg)) {
        return json(
          { ok: true, dedup: true, message: 'already picked a winner for this prompt' },
          200,
        );
      }
      throw err;
    }

    try {
      await recomputeCampaignRatings(campaign.id);
    } catch (err) {
      console.error(
        '[submit-best-of-n] rating recompute failed (non-fatal):',
        err,
      );
    }

    return json({ ok: true }, 200);
  },
);

interface ParsedBestOfNSubmit {
  promptId: string;
  chosenCampaignModelId: string;
}

function parseBestOfNSubmit(
  input: unknown,
): ParsedBestOfNSubmit | { error: string } {
  if (typeof input !== 'object' || input === null)
    return { error: 'body must be an object' };
  const o = input as Record<string, unknown>;
  const promptId = typeof o.promptId === 'string' ? o.promptId : '';
  const chosenCampaignModelId =
    typeof o.chosenCampaignModelId === 'string' ? o.chosenCampaignModelId : '';
  if (!promptId) return { error: 'promptId required' };
  if (!chosenCampaignModelId)
    return { error: 'chosenCampaignModelId required' };
  return { promptId, chosenCampaignModelId };
}

function extractSlug(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts[0] === 'api' &&
    parts[1] === 'vote' &&
    parts[3] === 'submit-best-of-n'
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
