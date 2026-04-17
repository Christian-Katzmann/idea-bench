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

  const voteCountByCampaignId = new Map<string, number>();
  const participantCountByCampaignId = new Map<string, number>();
  for (const vote of snapshot.votes) {
    if (!vote.campaignId) continue;
    voteCountByCampaignId.set(
      vote.campaignId,
      (voteCountByCampaignId.get(vote.campaignId) ?? 0) + 1,
    );
  }
  for (const participant of snapshot.participants ?? []) {
    participantCountByCampaignId.set(
      participant.campaignId,
      (participantCountByCampaignId.get(participant.campaignId) ?? 0) + 1,
    );
  }

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

  const successfulGenerationCountByCampaignId = new Map<string, number>();
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
      successfulGenerationCountByCampaignId.set(
        campaignId,
        (successfulGenerationCountByCampaignId.get(campaignId) ?? 0) + 1,
      );
    }
  }

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

  return {
    kpis: {
      activeCampaigns: snapshot.campaigns.filter((campaign) => campaign.status === 'active').length,
      draftCampaigns: snapshot.campaigns.filter((campaign) => campaign.status === 'draft').length,
      totalVotes: snapshot.votes.length,
      uniqueParticipants: (snapshot.participants ?? []).length,
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
