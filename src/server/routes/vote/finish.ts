import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withParticipant } from '../../auth/middleware.js';

/**
 * POST /api/vote/:slug/finish
 *
 * Marks the participant's record as finished. Idempotent. The
 * participant can still revisit /next if they want (which will
 * return done:true once all tournaments are complete).
 */
export const voteFinishWebHandler = withParticipant(async (request, ctx) => {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const slug = extractSlug(new URL(request.url));
  if (!slug) return json({ error: 'missing slug' }, 400);

  const db = getDb();
  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.shareSlug, slug))
    .limit(1);
  if (!campaign) return json({ error: 'campaign not found' }, 404);

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

  if (!participant.finishedAt) {
    await db
      .update(schema.participants)
      .set({ finishedAt: new Date() })
      .where(eq(schema.participants.id, participant.id));
  }

  return json({ ok: true, finishedAt: new Date().toISOString() }, 200);
});

function extractSlug(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'vote' && parts[3] === 'finish') {
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
