import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withParticipant } from '../../auth/middleware.js';
import { recomputeCampaignRatings } from '../../ratings.js';

/**
 * POST /api/vote/:slug/submit-approve-reject
 * Body: {
 *   promptId: uuid,
 *   campaignModelId: uuid,
 *   generationId: uuid,
 *   approved: boolean
 * }
 *
 * Mirrors submit-slider in structure. Gates + idempotency identical; the
 * only difference is the response table (approve_reject_responses) and
 * the payload field (`approved` instead of `score`).
 */
export const voteSubmitApproveRejectWebHandler = withParticipant(
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
    const parsed = parseApproveRejectSubmit(body);
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
    if (prompt.mode !== 'approve_reject') {
      return json(
        { error: `prompt mode is ${prompt.mode}, not approve_reject` },
        409,
      );
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
      await db.insert(schema.approveRejectResponses).values({
        campaignId: campaign.id,
        participantId: participant.id,
        promptId: prompt.id,
        campaignModelId: parsed.campaignModelId,
        sessionId: crypto.randomUUID(),
        approved: parsed.approved,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate key|uniq_approve_reject_response/i.test(msg)) {
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
        '[submit-approve-reject] rating recompute failed (non-fatal):',
        err,
      );
    }

    return json({ ok: true }, 200);
  },
);

interface ParsedApproveRejectSubmit {
  promptId: string;
  campaignModelId: string;
  generationId: string;
  approved: boolean;
}

function parseApproveRejectSubmit(
  input: unknown,
): ParsedApproveRejectSubmit | { error: string } {
  if (typeof input !== 'object' || input === null)
    return { error: 'body must be an object' };
  const o = input as Record<string, unknown>;
  const promptId = typeof o.promptId === 'string' ? o.promptId : '';
  const campaignModelId =
    typeof o.campaignModelId === 'string' ? o.campaignModelId : '';
  const generationId =
    typeof o.generationId === 'string' ? o.generationId : '';
  const approved = typeof o.approved === 'boolean' ? o.approved : null;

  if (!promptId) return { error: 'promptId required' };
  if (!campaignModelId) return { error: 'campaignModelId required' };
  if (!generationId) return { error: 'generationId required' };
  if (approved === null) return { error: 'approved must be a boolean' };

  return { promptId, campaignModelId, generationId, approved };
}

function extractSlug(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts[0] === 'api' &&
    parts[1] === 'vote' &&
    parts[3] === 'submit-approve-reject'
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
