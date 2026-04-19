import { and, eq, count } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { withParticipant } from '../../auth/middleware.js';

/**
 * GET  /api/vote/:slug                  — public landing info
 * POST /api/vote/:slug (body { email? }) — upsert participant row for
 *                                          this (cookie, campaign),
 *                                          returns the server-side
 *                                          participant id.
 *
 * Both routes are wrapped with withParticipant so the cookie is minted
 * on first contact. GET doesn't need the participant record — it just
 * returns the campaign's public-facing info.
 */
export const voteLandingWebHandler = withParticipant(async (request, ctx) => {
  const slug = extractSlug(new URL(request.url));
  if (!slug) return json({ error: 'missing slug' }, 400);

  const db = getDb();
  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.shareSlug, slug))
    .limit(1);
  if (!campaign) return json({ error: 'campaign not found' }, 404);

  if (request.method === 'GET') {
    // Public info only — don't leak internal ids.
    const [promptCount, modelCount] = await Promise.all([
      db
        .select({ n: count() })
        .from(schema.prompts)
        .where(eq(schema.prompts.campaignId, campaign.id)),
      db
        .select({ n: count() })
        .from(schema.campaignModels)
        .where(eq(schema.campaignModels.campaignId, campaign.id)),
    ]);
    return json(
      {
        shareSlug: campaign.shareSlug,
        name: campaign.name,
        description: campaign.description,
        categories: campaign.categories,
        status: campaign.status,
        promptCount: promptCount[0]?.n ?? 0,
        modelCount: modelCount[0]?.n ?? 0,
      },
      200,
    );
  }

  if (request.method === 'POST') {
    if (campaign.status !== 'active') {
      return json(
        {
          error:
            campaign.status === 'completed'
              ? 'this campaign is closed'
              : 'this campaign is not yet accepting votes',
        },
        410,
      );
    }
    let body: { email?: unknown } = {};
    try {
      body = (await request.json()) as { email?: unknown };
    } catch {
      // Body is optional for start.
    }
    const email =
      typeof body.email === 'string' && body.email.trim()
        ? body.email.trim().slice(0, 255)
        : null;

    // Upsert the participant row for this (cookie, campaign).
    // Scoping by campaignId is critical: a single cookie can participate
    // in multiple campaigns, and each pairing is its own row. Filtering
    // by cookieId alone returns any of the voter's prior participations
    // and causes /next to 409 on subsequent campaigns.
    const [existing] = await db
      .select()
      .from(schema.participants)
      .where(
        and(
          eq(schema.participants.cookieId, ctx.participantCookieId),
          eq(schema.participants.campaignId, campaign.id),
        ),
      )
      .limit(1);

    let participant: schema.Participant;
    if (existing) {
      // Same cookie returning — optionally update email.
      if (email && existing.email !== email) {
        const [updated] = await db
          .update(schema.participants)
          .set({ email })
          .where(eq(schema.participants.id, existing.id))
          .returning();
        participant = updated;
      } else {
        participant = existing;
      }
    } else {
      const [created] = await db
        .insert(schema.participants)
        .values({
          cookieId: ctx.participantCookieId,
          campaignId: campaign.id,
          email,
        })
        .returning();
      participant = created;
    }

    return json(
      {
        participantId: participant.id,
        shareSlug: campaign.shareSlug,
        name: campaign.name,
      },
      200,
    );
  }

  return new Response('method not allowed', { status: 405 });
});

function extractSlug(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'vote' && parts.length === 3) {
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
