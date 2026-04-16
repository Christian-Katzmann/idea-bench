import { eq, and, countDistinct, count, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../../src/server/db/client.js';
import * as schema from '../../../src/server/db/schema.js';
import { withOperator } from '../../../src/server/auth/middleware.js';
import { stabilityFor, type Stability } from '../../../src/lib/stability.js';
import { toVercelHandler } from '../../../src/server/vercel-adapter.js';

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
export default toVercelHandler(withOperator(async (request: Request) => {
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
    // Ratings joined with model display names. `seRating` is numeric →
    // comes back as a string over the HTTP driver; we coerce below.
    db
      .select({
        category: schema.ratings.category,
        rating: schema.ratings.rating,
        ciLow: schema.ratings.ciLow,
        ciHigh: schema.ratings.ciHigh,
        seRating: schema.ratings.seRating,
        btStrength: schema.ratings.btStrength,
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

  // Per-model win-rate is not stored in the ratings table — derive it
  // from votes on the fly so dashboards see a fresh rate even between
  // recomputes. Small cost (one query; O(votes)).
  const winStats = await computeWinStats(id, models);
  const enrichedRatings = ratings.map((r) => {
    const ws = winStats.get(r.campaignModelId) ?? {
      wins: 0,
      losses: 0,
      ties: 0,
      games: 0,
    };
    const winRate = ws.games > 0 ? (ws.wins + 0.5 * ws.ties) / ws.games : null;
    const stability: Stability = stabilityFor(r.gameCount);
    return {
      ...r,
      seRating: r.seRating != null ? Number(r.seRating) : null,
      btStrength: r.btStrength != null ? Number(r.btStrength) : null,
      winCount: ws.wins,
      lossCount: ws.losses,
      tieCount: ws.ties,
      gamesPlayed: ws.games,
      winRate,
      stability,
    };
  });

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
      ratings: enrichedRatings,
    },
    200,
  );
}));

/**
 * Per-model win/loss/tie/game counts for a campaign. Derived from the
 * vote log on demand. Returns Map<campaignModelId, stats>.
 *
 * Ties and `both_bad` both count as "ties" for the display win-rate —
 * consistent with how the B-T solver weighs them (0.5 each side).
 */
async function computeWinStats(
  campaignId: string,
  models: { id: string }[],
): Promise<
  Map<
    string,
    { wins: number; losses: number; ties: number; games: number }
  >
> {
  const db = getDb();
  const votes = await db
    .select({
      generationAId: schema.votes.generationAId,
      generationBId: schema.votes.generationBId,
      winner: schema.votes.winner,
    })
    .from(schema.votes)
    .where(eq(schema.votes.campaignId, campaignId));

  const stats = new Map<
    string,
    { wins: number; losses: number; ties: number; games: number }
  >();
  for (const m of models) {
    stats.set(m.id, { wins: 0, losses: 0, ties: 0, games: 0 });
  }
  if (votes.length === 0) return stats;

  // Look up generation → campaign_model for the gens referenced.
  const genIds = new Set<string>();
  for (const v of votes) {
    genIds.add(v.generationAId);
    genIds.add(v.generationBId);
  }
  const gens = await db
    .select({
      id: schema.generations.id,
      campaignModelId: schema.generations.campaignModelId,
    })
    .from(schema.generations)
    .where(inArray(schema.generations.id, [...genIds]));
  const g2m = new Map(gens.map((g) => [g.id, g.campaignModelId]));

  for (const v of votes) {
    const a = g2m.get(v.generationAId);
    const b = g2m.get(v.generationBId);
    if (!a || !b) continue;
    const sa = stats.get(a);
    const sb = stats.get(b);
    if (!sa || !sb) continue;
    sa.games++;
    sb.games++;
    if (v.winner === 'A') {
      sa.wins++;
      sb.losses++;
    } else if (v.winner === 'B') {
      sb.wins++;
      sa.losses++;
    } else {
      sa.ties++;
      sb.ties++;
    }
  }
  return stats;
}

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
