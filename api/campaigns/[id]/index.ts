import { eq, and, countDistinct, count, sql } from 'drizzle-orm';
import { getDb } from '../../../src/server/db/client';
import * as schema from '../../../src/server/db/schema';
import { withOperator } from '../../../src/server/auth/middleware';

/**
 * GET /api/campaigns/:id
 *
 * Returns the campaign + everything the dashboard needs in one shot:
 * stats (vote count, unique participants, elapsed), campaign_models,
 * prompts count, per-model ratings (for the leaderboard).
 *
 * Ratings are served as-is from the `ratings` table. Phase 4 will add
 * the B-T recompute that keeps them fresh; for now, the seed populates
 * placeholder ratings on the demo campaign and new campaigns return an
 * empty leaderboard until voting + Phase 4 compute run.
 */
export default withOperator(async (request: Request) => {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  const id = extractId(new URL(request.url));
  if (!id) return json({ error: 'missing id' }, 400);

  const db = getDb();

  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, id))
    .limit(1);
  if (!campaign) return json({ error: 'campaign not found' }, 404);

  const [models, promptCount, voteStats, ratings] = await Promise.all([
    db
      .select()
      .from(schema.campaignModels)
      .where(eq(schema.campaignModels.campaignId, id)),
    db
      .select({ n: count() })
      .from(schema.prompts)
      .where(eq(schema.prompts.campaignId, id)),
    db
      .select({
        totalVotes: count(schema.votes.id),
        uniqueParticipants: countDistinct(schema.votes.participantId),
      })
      .from(schema.votes)
      .where(eq(schema.votes.campaignId, id)),
    // Ratings joined with model display names.
    db
      .select({
        category: schema.ratings.category,
        rating: schema.ratings.rating,
        ciLow: schema.ratings.ciLow,
        ciHigh: schema.ratings.ciHigh,
        gameCount: schema.ratings.gameCount,
        computedAt: schema.ratings.computedAt,
        campaignModelId: schema.ratings.campaignModelId,
        providerModelId: schema.campaignModels.providerModelId,
        displayName: schema.campaignModels.displayName,
      })
      .from(schema.ratings)
      .innerJoin(
        schema.campaignModels,
        eq(schema.ratings.campaignModelId, schema.campaignModels.id),
      )
      .where(eq(schema.ratings.campaignId, id))
      .orderBy(sql`${schema.ratings.rating} desc`),
  ]);

  // Count completed tournaments (proxy for "finished participants").
  const finishedParticipants = (
    await db
      .select({ n: count() })
      .from(schema.participants)
      .where(
        and(
          eq(schema.participants.campaignId, id),
          sql`${schema.participants.finishedAt} is not null`,
        ),
      )
  )[0]?.n ?? 0;

  return json(
    {
      campaign: {
        id: campaign.id,
        shareSlug: campaign.shareSlug,
        name: campaign.name,
        description: campaign.description,
        categories: campaign.categories,
        status: campaign.status,
        createdAt: campaign.createdAt,
        closedAt: campaign.closedAt,
      },
      stats: {
        promptCount: promptCount[0]?.n ?? 0,
        modelCount: models.length,
        totalVotes: voteStats[0]?.totalVotes ?? 0,
        uniqueParticipants: voteStats[0]?.uniqueParticipants ?? 0,
        finishedParticipants,
      },
      models: models.map((m) => ({
        id: m.id,
        providerModelId: m.providerModelId,
        displayName: m.displayName,
      })),
      ratings,
    },
    200,
  );
});

function extractId(url: URL): string | null {
  // /api/campaigns/:id → parts[0]='api', parts[1]='campaigns', parts[2]=id
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'campaigns' && parts.length === 3) {
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
