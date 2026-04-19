import { getDb } from '../db/client.js';
import {
  buildModelLibrary,
  loadAnalyticsSnapshot,
  type AnalyticsSnapshot,
} from '../models/library.js';

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
    attention: {
      draftsNeedingGeneration,
      readyToLaunch,
      lowVoteVolume,
    },
    recentMovement,
  };
}
