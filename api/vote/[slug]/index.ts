import { and, eq, count } from 'drizzle-orm';
import { getDb } from '../../../src/server/db/client.js';
import * as schema from '../../../src/server/db/schema.js';
import { withParticipant } from '../../../src/server/auth/middleware.js';
import { toVercelHandler } from '../../../src/server/vercel-adapter.js';

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
export default toVercelHandler(withParticipant(async (request, ctx) => {
  const slug = extractSlug(new URL(request.url));
  if (!slug) return json({ error: 'missing slug' }, 400);

  const db = getDb();
  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.shareSlug, slug))
    .limit(1);
  // Soft-deleted campaigns are dead links to new voters. In-progress
  // participants keep their existing tournament state via /next /submit
  // /results /finish — those paths key off participant_id, not the slug,
  // so they keep working.
  if (!campaign || campaign.deletedAt)
    return json({ error: 'campaign not found' }, 404);

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
    // Public landing data — same payload for every visitor of a slug.
    // CDN absorbs repeat hits during the s-maxage window. SWR keeps
    // serving stale-but-fresh while a background refetch runs.
    // Vercel will skip caching first-time visits anyway because the
    // withParticipant wrapper attaches Set-Cookie when minting a fresh
    // participant_id; cookie-bearing repeat visits get the CDN HIT.
    return json(
      {
        shareSlug: campaign.shareSlug,
        name: campaign.name,
        description: campaign.description,
        categories: campaign.categories,
        status: campaign.status,
        votingMode: campaign.votingMode,
        emailPromptMessage: campaign.emailPromptMessage,
        promptCount: promptCount[0]?.n ?? 0,
        modelCount: modelCount[0]?.n ?? 0,
      },
      200,
      { 'cache-control': 'public, s-maxage=30, stale-while-revalidate=60' },
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
    const rawEmail =
      typeof body.email === 'string' && body.email.trim()
        ? body.email.trim().slice(0, 255)
        : null;

    // Enforce the campaign's voting_mode. The client-side landing page
    // renders the right form for the current mode, but we re-validate
    // server-side — an operator can flip the mode while someone has the
    // page open, and a motivated user can hit the endpoint directly.
    let email: string | null;
    if (campaign.votingMode === 'anonymous') {
      // Ignore email even if the client sent one — the operator chose to
      // collect no identity for this campaign.
      email = null;
    } else if (campaign.votingMode === 'email_required') {
      if (!rawEmail) {
        return json({ error: 'email is required for this campaign' }, 400);
      }
      // Server-side format gate — must have one `@` and a domain with a
      // dot. Mirrors the client-side regex in ParticipantLanding.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        return json({ error: 'please enter a valid email address' }, 400);
      }
      email = rawEmail;
    } else {
      // hybrid — email is optional; accept whatever the client sent.
      email = rawEmail;
    }

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
}));

function extractSlug(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'vote' && parts.length === 3) {
    return parts[2] || null;
  }
  return null;
}

function json(
  body: unknown,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}
