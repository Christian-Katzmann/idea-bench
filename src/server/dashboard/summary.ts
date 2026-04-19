import { stabilityFor, type Stability } from '../../lib/stability.js';
import { getDb } from '../db/client.js';
import {
  buildModelLibrary,
  loadAnalyticsSnapshot,
  type AnalyticsSnapshot,
} from '../models/library.js';

/** One row on the dashboard's rich leaderboard — a single model within one
 *  campaign, with its Bradley-Terry rating, 95% CI bounds, vote count, and
 *  win rate. Tier is derived from gameCount via `stabilityFor`. */
export interface DashboardLeaderboardRow {
  campaignModelId: string;
  providerModelId: string;
  displayName: string;
  rating: number;
  seRating: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  gameCount: number;
  winRate: number | null;
  stability: Stability;
}

/** A featured campaign on the dashboard leaderboard. One tab per campaign,
 *  ordered by recent vote volume. Rows are the campaign's overall ratings. */
export interface DashboardLeaderboardCampaign {
  id: string;
  name: string;
  shareSlug: string;
  totalVotes: number;
  updatedAt: string | null;
  ratings: DashboardLeaderboardRow[];
}

export interface DashboardSummary {
  kpis: {
    activeCampaigns: number;
    draftCampaigns: number;
    totalVotes: number;
    uniqueParticipants: number;
  };
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    shareSlug?: string;
    createdAt?: string;
    totalVotes: number;
    uniqueParticipants: number;
  }>;
  leaderboard: Array<{
    id: string;
    displayName: string;
    providerModelId: string;
    availability: 'enabled' | 'disabled' | 'legacy';
    campaigns: number;
    comparisons: number;
    winRate: number | null;
  }>;
  leaderboards: DashboardLeaderboardCampaign[];
  attention: {
    draftsNeedingGeneration: Array<{ id: string; name: string }>;
    readyToLaunch: Array<{ id: string; name: string }>;
    lowVoteVolume: Array<{ id: string; name: string; totalVotes: number }>;
  };
  recentMovement: Array<{
    id: string;
    kind: 'campaign_created' | 'participant_finished' | 'ratings_recomputed';
    label: string;
    at: string;
    campaignId?: string;
  }>;
}

/** Cap: featured leaderboards shown on the dashboard. Beyond this the user
 *  should click through to an individual campaign. */
const MAX_FEATURED_LEADERBOARDS = 4;

function isSnapshot(input: AnalyticsSnapshot | ReturnType<typeof getDb>): input is AnalyticsSnapshot {
  return 'registry' in input;
}

export async function buildDashboardSummary(
  input: AnalyticsSnapshot | ReturnType<typeof getDb>,
): Promise<DashboardSummary> {
  const snapshot = isSnapshot(input) ? input : await loadAnalyticsSnapshot(input);
  const library = await buildModelLibrary(snapshot, {
    status: 'all',
    sort: 'winRate',
  });

  // Prefer SQL-aggregated counts when the snapshot was loaded from the
  // database (production); fall back to scanning raw arrays for test
  // mocks that don't populate the aggregates.
  const voteCountByCampaignId =
    snapshot.voteAggregates?.countByCampaignId ??
    (() => {
      const m = new Map<string, number>();
      for (const vote of snapshot.votes) {
        if (!vote.campaignId) continue;
        m.set(vote.campaignId, (m.get(vote.campaignId) ?? 0) + 1);
      }
      return m;
    })();

  const participantCountByCampaignId =
    snapshot.participantAggregates?.countByCampaignId ??
    (() => {
      const m = new Map<string, number>();
      for (const participant of snapshot.participants ?? []) {
        m.set(participant.campaignId, (m.get(participant.campaignId) ?? 0) + 1);
      }
      return m;
    })();

  const promptsByCampaignId = new Map<string, number>();
  for (const prompt of snapshot.prompts ?? []) {
    promptsByCampaignId.set(
      prompt.campaignId,
      (promptsByCampaignId.get(prompt.campaignId) ?? 0) + 1,
    );
  }

  const modelCountByCampaignId = new Map<string, number>();
  for (const campaignModel of snapshot.campaignModels) {
    modelCountByCampaignId.set(
      campaignModel.campaignId,
      (modelCountByCampaignId.get(campaignModel.campaignId) ?? 0) + 1,
    );
  }

  const successfulGenerationCountByCampaignId =
    snapshot.generationAggregates?.successCountByCampaignId ??
    (() => {
      const m = new Map<string, number>();
      const campaignIdByCampaignModelId = new Map(
        snapshot.campaignModels.map((campaignModel) => [
          campaignModel.id,
          campaignModel.campaignId,
        ]),
      );
      for (const generation of snapshot.generations) {
        const campaignId = campaignIdByCampaignModelId.get(generation.campaignModelId);
        if (!campaignId) continue;
        if (generation.output != null && generation.error == null) {
          m.set(campaignId, (m.get(campaignId) ?? 0) + 1);
        }
      }
      return m;
    })();

  const recentCampaigns = [...snapshot.campaigns]
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .slice(0, 6)
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      shareSlug: campaign.shareSlug,
      createdAt: campaign.createdAt?.toISOString(),
      totalVotes: voteCountByCampaignId.get(campaign.id) ?? 0,
      uniqueParticipants: participantCountByCampaignId.get(campaign.id) ?? 0,
    }));

  const draftsNeedingGeneration = snapshot.campaigns
    .filter((campaign) => campaign.status === 'draft')
    .filter((campaign) => (successfulGenerationCountByCampaignId.get(campaign.id) ?? 0) === 0)
    .map((campaign) => ({ id: campaign.id, name: campaign.name }));

  const readyToLaunch = snapshot.campaigns
    .filter((campaign) => campaign.status === 'draft')
    .filter((campaign) => {
      const promptCount = promptsByCampaignId.get(campaign.id) ?? 0;
      const modelCount = modelCountByCampaignId.get(campaign.id) ?? 0;
      const expected = promptCount * modelCount;
      return promptCount > 0 && modelCount >= 4 && (successfulGenerationCountByCampaignId.get(campaign.id) ?? 0) >= expected;
    })
    .map((campaign) => ({ id: campaign.id, name: campaign.name }));

  const lowVoteVolume = snapshot.campaigns
    .filter((campaign) => campaign.status === 'active')
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      totalVotes: voteCountByCampaignId.get(campaign.id) ?? 0,
    }))
    .filter((campaign) => campaign.totalVotes < 10);

  // Featured leaderboards — up to MAX_FEATURED_LEADERBOARDS active campaigns,
  // ordered by recent vote volume. Each carries its own overall-category
  // ratings so the dashboard can render a full Bradley-Terry table per tab.
  const campaignModelsByCampaignId = new Map<
    string,
    AnalyticsSnapshot['campaignModels']
  >();
  for (const campaignModel of snapshot.campaignModels) {
    const list = campaignModelsByCampaignId.get(campaignModel.campaignId) ?? [];
    list.push(campaignModel);
    campaignModelsByCampaignId.set(campaignModel.campaignId, list);
  }

  const ratingsByCampaignId = new Map<
    string,
    AnalyticsSnapshot['ratings']
  >();
  for (const rating of snapshot.ratings) {
    if (rating.category !== 'overall') continue;
    const list = ratingsByCampaignId.get(rating.campaignId) ?? [];
    list.push(rating);
    ratingsByCampaignId.set(rating.campaignId, list);
  }

  const winStatsByCampaignModelId =
    snapshot.voteAggregates?.performanceByCampaignModelId ?? new Map();

  const leaderboards: DashboardLeaderboardCampaign[] = snapshot.campaigns
    .filter((campaign) => campaign.status === 'active')
    .map((campaign) => ({
      campaign,
      totalVotes: voteCountByCampaignId.get(campaign.id) ?? 0,
    }))
    .sort((a, b) => b.totalVotes - a.totalVotes)
    .slice(0, MAX_FEATURED_LEADERBOARDS)
    .map(({ campaign, totalVotes: campaignVotes }) => {
      const campaignModels = campaignModelsByCampaignId.get(campaign.id) ?? [];
      const ratings = ratingsByCampaignId.get(campaign.id) ?? [];
      const ratingByCampaignModelId = new Map(
        ratings.map((rating) => [rating.campaignModelId, rating]),
      );

      const rows: DashboardLeaderboardRow[] = campaignModels
        .map((campaignModel) => {
          const rating = ratingByCampaignModelId.get(campaignModel.id);
          const winStats = winStatsByCampaignModelId.get(campaignModel.id);
          const games = winStats
            ? winStats.wins + winStats.losses + winStats.ties
            : 0;
          const winRate =
            winStats && games > 0
              ? (winStats.wins + 0.5 * winStats.ties) / games
              : null;
          const gameCount = rating?.gameCount ?? games;
          return {
            campaignModelId: campaignModel.id,
            providerModelId: campaignModel.providerModelId,
            displayName: campaignModel.displayName,
            rating: rating?.rating ?? 1000,
            seRating: rating?.seRating ?? null,
            ciLow: rating?.ciLow ?? null,
            ciHigh: rating?.ciHigh ?? null,
            gameCount,
            winRate,
            stability: stabilityFor(gameCount),
          };
        })
        // Only surface models that have actually accumulated some signal —
        // zero-rated untouched models clutter the board without helping.
        .filter((row) => row.gameCount > 0 || row.rating !== 1000)
        .sort((a, b) => b.rating - a.rating);

      let latestComputedAt: number | null = null;
      for (const rating of ratings) {
        if (!rating.computedAt) continue;
        const t = rating.computedAt.getTime();
        if (latestComputedAt === null || t > latestComputedAt) {
          latestComputedAt = t;
        }
      }

      return {
        id: campaign.id,
        name: campaign.name,
        shareSlug: campaign.shareSlug ?? '',
        totalVotes: campaignVotes,
        updatedAt:
          latestComputedAt !== null
            ? new Date(latestComputedAt).toISOString()
            : null,
        ratings: rows,
      } satisfies DashboardLeaderboardCampaign;
    });

  const recentMovement = [
    ...snapshot.campaigns
      .filter((campaign) => campaign.createdAt)
      .map((campaign) => ({
        id: `campaign:${campaign.id}`,
        kind: 'campaign_created' as const,
        label: `${campaign.name} created`,
        at: campaign.createdAt!.toISOString(),
        campaignId: campaign.id,
      })),
    ...(snapshot.participants ?? [])
      .filter((participant) => participant.finishedAt)
      .map((participant) => ({
        id: `participant:${participant.id}`,
        kind: 'participant_finished' as const,
        label: 'A participant finished voting',
        at: participant.finishedAt!.toISOString(),
        campaignId: participant.campaignId,
      })),
    ...snapshot.ratings
      .filter((rating) => rating.computedAt)
      .map((rating) => ({
        id: `rating:${rating.id ?? `${rating.campaignId}:${rating.campaignModelId}`}`,
        kind: 'ratings_recomputed' as const,
        label: 'Ratings recomputed',
        at: rating.computedAt!.toISOString(),
        campaignId: rating.campaignId,
      })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  const totalVotes =
    snapshot.voteAggregates?.totalVotes ?? snapshot.votes.length;
  const uniqueParticipants = snapshot.participantAggregates
    ? Array.from(snapshot.participantAggregates.countByCampaignId.values()).reduce(
        (sum, n) => sum + n,
        0,
      )
    : (snapshot.participants ?? []).length;

  return {
    kpis: {
      activeCampaigns: snapshot.campaigns.filter((campaign) => campaign.status === 'active').length,
      draftCampaigns: snapshot.campaigns.filter((campaign) => campaign.status === 'draft').length,
      totalVotes,
      uniqueParticipants,
    },
    recentCampaigns,
    leaderboard: library.rows.slice(0, 5).map((row) => ({
      id: row.id,
      displayName: row.displayName,
      providerModelId: row.providerModelId,
      availability: row.availability,
      campaigns: row.usage.campaigns,
      comparisons: row.performance.comparisons,
      winRate: row.performance.winRate,
    })),
    leaderboards,
    attention: {
      draftsNeedingGeneration,
      readyToLaunch,
      lowVoteVolume,
    },
    recentMovement,
  };
}
