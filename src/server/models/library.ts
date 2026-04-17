import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { syncModelRegistry, type RegistryRow } from './registry.js';

export type CampaignStatus = 'draft' | 'active' | 'completed';

export interface ActivityVoteRecord {
  id?: string;
  campaignId?: string;
  generationAId: string;
  generationBId: string;
  winner: string;
  createdAt?: Date;
}

export interface ActivityRatingRecord {
  id?: string;
  campaignId: string;
  campaignModelId: string;
  category: string;
  rating: number;
  gameCount: number;
  computedAt?: Date;
}

export interface AnalyticsSnapshot {
  registry: RegistryRow[];
  campaigns: Array<{
    id: string;
    name: string;
    shareSlug?: string;
    description?: string;
    status: string;
    createdAt?: Date;
  }>;
  prompts?: Array<{ id: string; campaignId: string }>;
  participants?: Array<{
    id: string;
    campaignId: string;
    startedAt?: Date | null;
    finishedAt?: Date | null;
  }>;
  campaignModels: Array<{
    id: string;
    campaignId: string;
    providerModelId: string;
    displayName: string;
  }>;
  generations: Array<{
    id: string;
    campaignModelId: string;
    promptId?: string;
    output?: string | null;
    error?: string | null;
  }>;
  votes: ActivityVoteRecord[];
  ratings: ActivityRatingRecord[];
}

export type ModelLibraryStatusFilter =
  | 'all'
  | 'enabled'
  | 'disabled'
  | 'legacy'
  | 'in-use';
export type ModelLibrarySort = 'name' | 'usage' | 'winRate';

export interface ModelLibraryFilters {
  search?: string;
  status?: ModelLibraryStatusFilter;
  sort?: ModelLibrarySort;
}

export interface ModelLibraryRow {
  id: string;
  providerModelId: string;
  displayName: string;
  enabled: boolean;
  legacy: boolean;
  availability: 'enabled' | 'disabled' | 'legacy';
  usage: {
    campaigns: number;
    activeCampaigns: number;
    completedCampaigns: number;
  };
  performance: {
    wins: number;
    losses: number;
    ties: number;
    comparisons: number;
    winRate: number | null;
    averageRating: number | null;
  };
  footprint: Array<{
    campaignId: string;
    name: string;
    status: string;
  }>;
  recommendation: string;
}

export interface ModelLibraryData {
  rows: ModelLibraryRow[];
  summary: {
    totalModels: number;
    enabled: number;
    disabled: number;
    legacy: number;
    inUse: number;
  };
  guidance: {
    recommendedIds: string[];
    note: string;
  };
}

interface BuildModelStatsOptions {
  search: string;
  status: ModelLibraryStatusFilter;
  sort: ModelLibrarySort;
}

function defaultFilters(filters?: ModelLibraryFilters): BuildModelStatsOptions {
  return {
    search: filters?.search?.trim().toLowerCase() ?? '',
    status: filters?.status ?? 'all',
    sort: filters?.sort ?? 'usage',
  };
}

function isSnapshot(input: AnalyticsSnapshot | ReturnType<typeof getDb>): input is AnalyticsSnapshot {
  return 'registry' in input;
}

export function summarizeModelLibrary(
  snapshot: AnalyticsSnapshot,
  filters?: ModelLibraryFilters,
): ModelLibraryData {
  const options = defaultFilters(filters);
  const campaignById = new Map(snapshot.campaigns.map((campaign) => [campaign.id, campaign]));
  const campaignModelById = new Map(
    snapshot.campaignModels.map((campaignModel) => [campaignModel.id, campaignModel]),
  );
  const generationToProviderModelId = new Map<string, string>();
  for (const generation of snapshot.generations) {
    const campaignModel = campaignModelById.get(generation.campaignModelId);
    if (campaignModel) {
      generationToProviderModelId.set(generation.id, campaignModel.providerModelId);
    }
  }

  const ratingBuckets = new Map<
    string,
    { totalRating: number; ratingCount: number; gameCount: number }
  >();
  for (const rating of snapshot.ratings) {
    if (rating.category !== 'overall') continue;
    const campaignModel = campaignModelById.get(rating.campaignModelId);
    if (!campaignModel) continue;
    const bucket = ratingBuckets.get(campaignModel.providerModelId) ?? {
      totalRating: 0,
      ratingCount: 0,
      gameCount: 0,
    };
    bucket.totalRating += rating.rating;
    bucket.ratingCount += 1;
    bucket.gameCount += rating.gameCount;
    ratingBuckets.set(campaignModel.providerModelId, bucket);
  }

  const recordByProviderModelId = new Map<
    string,
    {
      usageCampaignIds: Set<string>;
      activeCampaignIds: Set<string>;
      completedCampaignIds: Set<string>;
      footprint: Map<string, { campaignId: string; name: string; status: string }>;
      wins: number;
      losses: number;
      ties: number;
    }
  >();

  for (const row of snapshot.registry) {
    recordByProviderModelId.set(row.providerModelId, {
      usageCampaignIds: new Set(),
      activeCampaignIds: new Set(),
      completedCampaignIds: new Set(),
      footprint: new Map(),
      wins: 0,
      losses: 0,
      ties: 0,
    });
  }

  for (const campaignModel of snapshot.campaignModels) {
    const bucket =
      recordByProviderModelId.get(campaignModel.providerModelId) ?? {
        usageCampaignIds: new Set<string>(),
        activeCampaignIds: new Set<string>(),
        completedCampaignIds: new Set<string>(),
        footprint: new Map<string, { campaignId: string; name: string; status: string }>(),
        wins: 0,
        losses: 0,
        ties: 0,
      };
    const campaign = campaignById.get(campaignModel.campaignId);
    bucket.usageCampaignIds.add(campaignModel.campaignId);
    if (campaign?.status === 'active') bucket.activeCampaignIds.add(campaign.id);
    if (campaign?.status === 'completed') bucket.completedCampaignIds.add(campaign.id);
    if (campaign) {
      bucket.footprint.set(campaign.id, {
        campaignId: campaign.id,
        name: campaign.name,
        status: campaign.status,
      });
    }
    recordByProviderModelId.set(campaignModel.providerModelId, bucket);
  }

  for (const vote of snapshot.votes) {
    const providerA = generationToProviderModelId.get(vote.generationAId);
    const providerB = generationToProviderModelId.get(vote.generationBId);
    if (!providerA || !providerB) continue;
    const bucketA = recordByProviderModelId.get(providerA);
    const bucketB = recordByProviderModelId.get(providerB);
    if (!bucketA || !bucketB) continue;

    if (vote.winner === 'A') {
      bucketA.wins += 1;
      bucketB.losses += 1;
    } else if (vote.winner === 'B') {
      bucketB.wins += 1;
      bucketA.losses += 1;
    } else {
      bucketA.ties += 1;
      bucketB.ties += 1;
    }
  }

  const rows = snapshot.registry
    .map<ModelLibraryRow>((row) => {
      const bucket = recordByProviderModelId.get(row.providerModelId) ?? {
        usageCampaignIds: new Set<string>(),
        activeCampaignIds: new Set<string>(),
        completedCampaignIds: new Set<string>(),
        footprint: new Map<string, { campaignId: string; name: string; status: string }>(),
        wins: 0,
        losses: 0,
        ties: 0,
      };
      const ratingBucket = ratingBuckets.get(row.providerModelId);
      const comparisons = bucket.wins + bucket.losses + bucket.ties;
      const winRate =
        comparisons > 0 ? (bucket.wins + bucket.ties * 0.5) / comparisons : null;
      const availability = row.legacy
        ? 'legacy'
        : row.enabled
          ? 'enabled'
          : 'disabled';
      const recommendation =
        comparisons === 0
          ? 'Untested'
          : comparisons < 3
            ? 'Low sample'
            : winRate != null && winRate >= 0.6
              ? 'Strong generalist'
              : winRate != null && winRate < 0.4
                ? 'Underperforming'
                : 'Balanced option';

      return {
        id: row.id,
        providerModelId: row.providerModelId,
        displayName: row.displayName,
        enabled: row.enabled,
        legacy: row.legacy,
        availability,
        usage: {
          campaigns: bucket.usageCampaignIds.size,
          activeCampaigns: bucket.activeCampaignIds.size,
          completedCampaigns: bucket.completedCampaignIds.size,
        },
        performance: {
          wins: bucket.wins,
          losses: bucket.losses,
          ties: bucket.ties,
          comparisons,
          winRate,
          averageRating:
            ratingBucket && ratingBucket.ratingCount > 0
              ? Math.round(ratingBucket.totalRating / ratingBucket.ratingCount)
              : null,
        },
        footprint: [...bucket.footprint.values()].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
        recommendation,
      };
    })
    .filter((row) => {
      if (options.search) {
        const haystack = `${row.displayName} ${row.providerModelId}`.toLowerCase();
        if (!haystack.includes(options.search)) return false;
      }

      switch (options.status) {
        case 'enabled':
          return row.enabled && !row.legacy;
        case 'disabled':
          return !row.enabled && !row.legacy;
        case 'legacy':
          return row.legacy;
        case 'in-use':
          return row.usage.campaigns > 0;
        default:
          return true;
      }
    })
    .sort((a, b) => {
      if (options.sort === 'name') {
        return a.displayName.localeCompare(b.displayName);
      }
      if (options.sort === 'winRate') {
        return (
          (b.performance.winRate ?? -1) - (a.performance.winRate ?? -1) ||
          b.performance.comparisons - a.performance.comparisons ||
          a.displayName.localeCompare(b.displayName)
        );
      }
      return (
        b.usage.campaigns - a.usage.campaigns ||
        (b.performance.winRate ?? -1) - (a.performance.winRate ?? -1) ||
        a.displayName.localeCompare(b.displayName)
      );
    });

  const recommendedIds = rows
    .filter((row) => row.enabled && !row.legacy)
    .sort((a, b) => {
      const scoreA =
        (a.performance.winRate ?? 0) * 10 + a.usage.campaigns + a.performance.comparisons;
      const scoreB =
        (b.performance.winRate ?? 0) * 10 + b.usage.campaigns + b.performance.comparisons;
      return scoreB - scoreA;
    })
    .slice(0, 4)
    .map((row) => row.id);

  return {
    rows,
    summary: {
      totalModels: snapshot.registry.length,
      enabled: snapshot.registry.filter((row) => row.enabled && !row.legacy).length,
      disabled: snapshot.registry.filter((row) => !row.enabled && !row.legacy).length,
      legacy: snapshot.registry.filter((row) => row.legacy).length,
      inUse: rows.filter((row) => row.usage.campaigns > 0).length,
    },
    guidance: {
      recommendedIds,
      note:
        recommendedIds.length > 0
          ? 'Use a balanced mix of proven models and keep at least one lower-latency option enabled.'
          : 'Enable at least four non-legacy models to make future campaign creation possible.',
    },
  };
}

export async function buildModelLibrary(
  input: AnalyticsSnapshot | ReturnType<typeof getDb>,
  filters?: ModelLibraryFilters,
): Promise<ModelLibraryData> {
  if (isSnapshot(input)) {
    return summarizeModelLibrary(input, filters);
  }
  const snapshot = await loadAnalyticsSnapshot(input);
  return summarizeModelLibrary(snapshot, filters);
}

export async function updateRegistryModel(
  input: AnalyticsSnapshot | ReturnType<typeof getDb>,
  id: string,
  patch: { enabled?: boolean; legacy?: boolean },
): Promise<RegistryRow> {
  if (isSnapshot(input)) {
    const row = input.registry.find((registryRow) => registryRow.id === id);
    if (!row) throw new Error('model not found');
    return {
      ...row,
      enabled: patch.enabled ?? row.enabled,
      legacy: patch.legacy ?? row.legacy,
    };
  }

  const db = input;
  await syncModelRegistry(db);
  const [updated] = await db
    .update(schema.modelRegistry)
    .set({
      ...(patch.enabled != null ? { enabled: patch.enabled } : {}),
      ...(patch.legacy != null ? { legacy: patch.legacy } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.modelRegistry.id, id))
    .returning();

  if (!updated) {
    throw new Error('model not found');
  }

  return {
    id: updated.id,
    providerModelId: updated.providerModelId,
    displayName: updated.displayName,
    enabled: updated.enabled,
    legacy: updated.legacy,
  };
}

export async function loadAnalyticsSnapshot(
  db: ReturnType<typeof getDb>,
): Promise<AnalyticsSnapshot> {
  const registry = await syncModelRegistry(db);

  const [campaigns, prompts, participants, campaignModels, generations, votes, ratings] =
    await Promise.all([
      db.select().from(schema.campaigns),
      db.select({ id: schema.prompts.id, campaignId: schema.prompts.campaignId }).from(schema.prompts),
      db
        .select({
          id: schema.participants.id,
          campaignId: schema.participants.campaignId,
          startedAt: schema.participants.startedAt,
          finishedAt: schema.participants.finishedAt,
        })
        .from(schema.participants),
      db
        .select({
          id: schema.campaignModels.id,
          campaignId: schema.campaignModels.campaignId,
          providerModelId: schema.campaignModels.providerModelId,
          displayName: schema.campaignModels.displayName,
        })
        .from(schema.campaignModels),
      db
        .select({
          id: schema.generations.id,
          campaignModelId: schema.generations.campaignModelId,
          promptId: schema.generations.promptId,
          output: schema.generations.output,
          error: schema.generations.error,
        })
        .from(schema.generations),
      db
        .select({
          id: schema.votes.id,
          campaignId: schema.votes.campaignId,
          generationAId: schema.votes.generationAId,
          generationBId: schema.votes.generationBId,
          winner: schema.votes.winner,
          createdAt: schema.votes.createdAt,
        })
        .from(schema.votes),
      db
        .select({
          id: schema.ratings.id,
          campaignId: schema.ratings.campaignId,
          campaignModelId: schema.ratings.campaignModelId,
          category: schema.ratings.category,
          rating: schema.ratings.rating,
          gameCount: schema.ratings.gameCount,
          computedAt: schema.ratings.computedAt,
        })
        .from(schema.ratings)
        .where(eq(schema.ratings.category, 'overall'))
        .orderBy(desc(schema.ratings.computedAt)),
    ]);

  return {
    registry,
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      shareSlug: campaign.shareSlug,
      description: campaign.description,
      status: campaign.status,
      createdAt: campaign.createdAt,
    })),
    prompts,
    participants,
    campaignModels,
    generations,
    votes,
    ratings,
  };
}
