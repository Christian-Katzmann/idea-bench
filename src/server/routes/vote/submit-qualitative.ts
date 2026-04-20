import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withParticipant } from '../../auth/middleware.js';

/**
 * POST /api/vote/:slug/submit-qualitative
 * Body: {
 *   promptId: uuid,
 *   campaignModelId: uuid,
 *   generationId: uuid,
 *   text: string
 * }
 *
 * Writes a row into qualitative_responses. No aggregate recompute —
 * qualitative produces no numeric rating (it's text to read, not math
 * to average). The leaderboard surface for qualitative is a reader,
 * not a scorecard.
 *
 * `required` flag on the prompt's modeConfig is enforced on the client
 * (empty text still accepted server-side so the voter can skip if they
 * chose "optional" and the client is being unusual).
 *
 * Text is capped at 4 000 chars to prevent abuse; longer entries are
 * truncated server-side with a preserved suffix marker.
 */
const MAX_TEXT_LENGTH = 4000;

export const voteSubmitQualitativeWebHandler = withParticipant(
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
    const parsed = parseQualitativeSubmit(body);
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
    if (prompt.mode !== 'qualitative') {
      return json(
        { error: `prompt mode is ${prompt.mode}, not qualitative` },
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

    const truncated =
      parsed.text.length > MAX_TEXT_LENGTH
        ? parsed.text.slice(0, MAX_TEXT_LENGTH - 10) + '… [trunc]'
        : parsed.text;

    try {
      await db.insert(schema.qualitativeResponses).values({
        campaignId: campaign.id,
        participantId: participant.id,
        promptId: prompt.id,
        campaignModelId: parsed.campaignModelId,
        sessionId: crypto.randomUUID(),
        text: truncated,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate key|uniq_qualitative_response/i.test(msg)) {
        return json(
          {
            ok: true,
            dedup: true,
            message: 'already left feedback for this pair',
          },
          200,
        );
      }
      throw err;
    }

    // Qualitative produces no numeric rating, so no recompute call. A
    // future "qualitative clustering" aggregate would run async anyway.

    return json({ ok: true }, 200);
  },
);

interface ParsedQualitativeSubmit {
  promptId: string;
  campaignModelId: string;
  generationId: string;
  text: string;
}

function parseQualitativeSubmit(
  input: unknown,
): ParsedQualitativeSubmit | { error: string } {
  if (typeof input !== 'object' || input === null)
    return { error: 'body must be an object' };
  const o = input as Record<string, unknown>;
  const promptId = typeof o.promptId === 'string' ? o.promptId : '';
  const campaignModelId =
    typeof o.campaignModelId === 'string' ? o.campaignModelId : '';
  const generationId =
    typeof o.generationId === 'string' ? o.generationId : '';
  const text = typeof o.text === 'string' ? o.text : '';

  if (!promptId) return { error: 'promptId required' };
  if (!campaignModelId) return { error: 'campaignModelId required' };
  if (!generationId) return { error: 'generationId required' };

  return { promptId, campaignModelId, generationId, text };
}

function extractSlug(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts[0] === 'api' &&
    parts[1] === 'vote' &&
    parts[3] === 'submit-qualitative'
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
