import { and, count, countDistinct, eq, inArray, sql } from 'drizzle-orm';
import { stabilityFor, type Stability } from '../../lib/stability.js';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';

type Database = ReturnType<typeof getDb>;

export interface CampaignLeaderboardRow {
  category: string;
  rating: number;
  seRating: number | null;
  btStrength: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  gameCount: number;
  gamesPlayed: number;
  winCount: number;
  lossCount: number;
  tieCount: number;
  winRate: number | null;
  stability: Stability;
  computedAt: Date | null;
  campaignModelId: string;
  providerModelId: string;
  displayName: string;
}

export interface CampaignDetailData {
  campaign: {
    id: string;
    shareSlug: string;
    name: string;
    description: string;
    categories: string[];
    status: schema.CampaignStatus;
    createdAt: Date;
    closedAt: Date | null;
  };
  stats: {
    promptCount: number;
    modelCount: number;
    totalVotes: number;
    uniqueParticipants: number;
    finishedParticipants: number;
  };
  models: Array<{
    id: string;
    providerModelId: string;
    displayName: string;
  }>;
  ratings: CampaignLeaderboardRow[];
}

export async function buildCampaignDetail(
  db: Database,
  id: string,
): Promise<CampaignDetailData | null> {
  const [campaign] = await db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, id))
    .limit(1);
  if (!campaign) return null;

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

  const winStats = await computeWinStats(db, id, models);
  const enrichedRatings = ratings.map<CampaignLeaderboardRow>((rating) => {
    const winStat = winStats.get(rating.campaignModelId) ?? {
      wins: 0,
      losses: 0,
      ties: 0,
      games: 0,
    };
    const winRate =
      winStat.games > 0
        ? (winStat.wins + 0.5 * winStat.ties) / winStat.games
        : null;

    return {
      ...rating,
      seRating: rating.seRating != null ? Number(rating.seRating) : null,
      btStrength: rating.btStrength != null ? Number(rating.btStrength) : null,
      winCount: winStat.wins,
      lossCount: winStat.losses,
      tieCount: winStat.ties,
      gamesPlayed: winStat.games,
      winRate,
      stability: stabilityFor(rating.gameCount),
    };
  });

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

  return {
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
    models: models.map((model) => ({
      id: model.id,
      providerModelId: model.providerModelId,
      displayName: model.displayName,
    })),
    ratings: enrichedRatings,
  };
}

async function computeWinStats(
  db: Database,
  campaignId: string,
  models: { id: string }[],
): Promise<
  Map<string, { wins: number; losses: number; ties: number; games: number }>
> {
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
  for (const model of models) {
    stats.set(model.id, { wins: 0, losses: 0, ties: 0, games: 0 });
  }
  if (votes.length === 0) return stats;

  const generationIds = new Set<string>();
  for (const vote of votes) {
    generationIds.add(vote.generationAId);
    generationIds.add(vote.generationBId);
  }

  const generations = await db
    .select({
      id: schema.generations.id,
      campaignModelId: schema.generations.campaignModelId,
    })
    .from(schema.generations)
    .where(inArray(schema.generations.id, [...generationIds]));
  const generationToModel = new Map(
    generations.map((generation) => [generation.id, generation.campaignModelId]),
  );

  for (const vote of votes) {
    const modelA = generationToModel.get(vote.generationAId);
    const modelB = generationToModel.get(vote.generationBId);
    if (!modelA || !modelB) continue;

    const statsA = stats.get(modelA);
    const statsB = stats.get(modelB);
    if (!statsA || !statsB) continue;

    statsA.games += 1;
    statsB.games += 1;

    if (vote.winner === 'A') {
      statsA.wins += 1;
      statsB.losses += 1;
    } else if (vote.winner === 'B') {
      statsB.wins += 1;
      statsA.losses += 1;
    } else {
      statsA.ties += 1;
      statsB.ties += 1;
    }
  }

  return stats;
}
