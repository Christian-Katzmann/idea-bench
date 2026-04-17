import { getDb } from '../db/client.js';
import {
  loadAnalyticsSnapshot,
  type ActivityRatingRecord,
  type ActivityVoteRecord,
  type AnalyticsSnapshot,
} from '../models/library.js';

export interface ActivitySnapshot {
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    createdAt?: Date;
  }>;
  participants?: Array<{
    id: string;
    campaignId: string;
    finishedAt?: Date | null;
  }>;
  ratings: Array<Pick<ActivityRatingRecord, 'id' | 'campaignId' | 'computedAt'>>;
  votes: Array<Pick<ActivityVoteRecord, 'id' | 'campaignId'>>;
}

export interface ActivityFeed {
  summary: {
    activeCampaigns: number;
    completedCampaigns: number;
    totalVotes: number;
  };
  events: Array<{
    id: string;
    kind: 'campaign_created' | 'participant_finished' | 'ratings_recomputed';
    label: string;
    at: string;
    campaignId?: string;
  }>;
  topCampaigns: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

type ActivityFeedInput = ReturnType<typeof getDb> | ActivitySnapshot | AnalyticsSnapshot;

function isDatabase(input: ActivityFeedInput): input is ReturnType<typeof getDb> {
  return typeof input === 'object' && input !== null && '$withAuth' in input;
}

export async function buildActivityFeed(
  input: ActivityFeedInput,
): Promise<ActivityFeed> {
  const snapshot = isDatabase(input)
    ? await loadAnalyticsSnapshot(input)
    : input;

  const events = [
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
        id: `rating:${rating.id ?? `${rating.campaignId}`}`,
        kind: 'ratings_recomputed' as const,
        label: 'Ratings recomputed',
        at: rating.computedAt!.toISOString(),
        campaignId: rating.campaignId,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return {
    summary: {
      activeCampaigns: snapshot.campaigns.filter((campaign) => campaign.status === 'active').length,
      completedCampaigns: snapshot.campaigns.filter((campaign) => campaign.status === 'completed').length,
      totalVotes: snapshot.votes.length,
    },
    events,
    topCampaigns: [...snapshot.campaigns]
      .sort((a, b) => {
        if (a.status === b.status) {
          return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
        }
        if (a.status === 'active') return -1;
        if (b.status === 'active') return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 5)
      .map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
      })),
  };
}
