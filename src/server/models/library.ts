import { and, count, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { syncModelRegistry, type RegistryRow } from './registry.js';

/**
 * Pre-aggregated snapshot fields so consumers don't have to scan large
 * raw tables in JS. Computed via SQL GROUP BY in `computeAnalyticsSnapshot`.
 *
 * Consumers must still tolerate snapshots without these fields — the
 * existing test mocks construct snapshots from raw arrays, and a
 * fallback path iterates those.
 */
export interface SnapshotVoteAggregates {
  totalVotes: number;
  countByCampaignId: Map<string, number>;
  /** Per-provider model wins/losses/ties summed across both A and B sides. */
  performanceByProviderModelId: Map<
    string,
    { wins: number; losses: number; ties: number }
  >;
  /** Per-(campaign × campaignModel) wins/losses/ties. Needed for per-campaign
   *  leaderboards that report winRate alongside Bradley-Terry rating. */
  performanceByCampaignModelId: Map<
    string,
    { wins: number; losses: number; ties: number }
  >;
}

export interface SnapshotGenerationAggregates {
  /** Generations with output IS NOT NULL AND error IS NULL, per campaign. */
  successCountByCampaignId: Map<string, number>;
}

export interface SnapshotParticipantAggregates {
  countByCampaignId: Map<string, number>;
}

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
  /** Standard error of the rating (nullable — unknown until BT recompute runs). */
  seRating?: number | null;
  /** Lower bound of 95% confidence interval, in rating points. */
  ciLow?: number | null;
  /** Upper bound of 95% confidence interval, in rating points. */
  ciHigh?: number | null;
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
  /** Optional pre-aggregated counts. When present, consumers should
   *  prefer these over scanning the raw arrays — production loaders
   *  populate them and skip raw fetches for `votes`, `generations`,
   *  and `participants`. Test fixtures may omit them. */
  voteAggregates?: SnapshotVoteAggregates;
  generationAggregates?: SnapshotGenerationAggregates;
  participantAggregates?: SnapshotParticipantAggregates;
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
  // Only built when the snapshot lacks pre-aggregated performance data
  // (e.g., test mocks). Production skips this — aggregates come from SQL.
  const generationToProviderModelId = new Map<string, string>();
  if (!snapshot.voteAggregates) {
    for (const generation of snapshot.generations) {
      const campaignModel = campaignModelById.get(generation.campaignModelId);
      if (campaignModel) {
        generationToProviderModelId.set(generation.id, campaignModel.providerModelId);
      }
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

  if (snapshot.voteAggregates) {
    // Fast path: pre-aggregated wins/losses/ties per provider — folded
    // into the existing per-provider buckets so footprint, ratings,
    // etc. flow through unchanged.
    for (const [providerModelId, perf] of snapshot.voteAggregates.performanceByProviderModelId) {
      const bucket = recordByProviderModelId.get(providerModelId);
      if (!bucket) continue;
      bucket.wins += perf.wins;
      bucket.losses += perf.losses;
      bucket.ties += perf.ties;
    }
  } else {
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

  invalidateAnalyticsSnapshot();
  return {
    id: updated.id,
    providerModelId: updated.providerModelId,
    displayName: updated.displayName,
    enabled: updated.enabled,
    legacy: updated.legacy,
  };
}

/**
 * Memoized snapshot, scoped to the current Vercel Function instance.
 *
 * `loadAnalyticsSnapshot` runs ~7 unfiltered SELECTs (campaigns, prompts,
 * participants, campaign_models, generations, votes, ratings) on every
 * /api/dashboard, /api/models, and /api/activity request — measured at
 * ~900ms warm. Memoizing the result for SNAPSHOT_TTL_MS reduces repeat
 * reads to single-digit ms while keeping staleness bounded.
 *
 * Cross-instance invalidation is not possible without an external store,
 * so the TTL acts as the upper bound on staleness even without explicit
 * `invalidateAnalyticsSnapshot()` calls. Mutation handlers should call
 * the invalidator anyway to make the same-instance experience snappy.
 */
const SNAPSHOT_TTL_MS = 30_000;
let cachedSnapshot:
  | { snapshot: AnalyticsSnapshot; expiresAt: number }
  | null = null;

export function invalidateAnalyticsSnapshot(): void {
  cachedSnapshot = null;
  // L2 bust: expire the 'snapshot' tag on Vercel Runtime Cache so any
  // /api/operator/:kind response cached in this region (and others,
  // propagating globally in ≤300ms) is invalidated. Fire-and-forget —
  // this function remains synchronous so existing callers don't need
  // to await. Falls back silently in dev/tests where Runtime Cache is
  // unavailable.
  void (async () => {
    try {
      const mod = await import('@vercel/functions');
      const getCache = (mod as { getCache?: unknown }).getCache;
      if (typeof getCache !== 'function') return;
      const cache = (getCache as (opts: { namespace: string }) => {
        expireTag?: (tag: string) => Promise<void>;
      })({ namespace: 'idea-bench' });
      await cache.expireTag?.('snapshot');
    } catch {
      /* swallow — invalidation failure is tolerable; the 30s TTL on
         Runtime Cache entries is the upper bound on staleness. */
    }
  })();
}

export async function loadAnalyticsSnapshot(
  db: ReturnType<typeof getDb>,
): Promise<AnalyticsSnapshot> {
  const now = Date.now();
  if (cachedSnapshot && now < cachedSnapshot.expiresAt) {
    return cachedSnapshot.snapshot;
  }
  const snapshot = await computeAnalyticsSnapshot(db);
  cachedSnapshot = { snapshot, expiresAt: now + SNAPSHOT_TTL_MS };
  return snapshot;
}

/**
 * Pulls vote aggregates without fetching the raw votes table.
 *
 * Three queries in parallel:
 *   1. votes-by-campaign count (for dashboard KPIs and recentCampaigns)
 *   2. wins/losses/ties grouped by provider model when vote.A is provider's
 *   3. wins/losses/ties grouped by provider model when vote.B is provider's
 *
 * Result rows are tiny (~providers × 4 winners). Avoids loading a vote
 * table that grows linearly with traffic.
 */
async function loadVoteAggregates(
  db: ReturnType<typeof getDb>,
): Promise<SnapshotVoteAggregates> {
  const [byCampaign, asASide, asBSide] = await Promise.all([
    db
      .select({ campaignId: schema.votes.campaignId, n: count() })
      .from(schema.votes)
      .groupBy(schema.votes.campaignId),
    db
      .select({
        providerModelId: schema.campaignModels.providerModelId,
        campaignModelId: schema.campaignModels.id,
        winner: schema.votes.winner,
        n: count(),
      })
      .from(schema.votes)
      .innerJoin(
        schema.generations,
        eq(schema.votes.generationAId, schema.generations.id),
      )
      .innerJoin(
        schema.campaignModels,
        eq(schema.generations.campaignModelId, schema.campaignModels.id),
      )
      .groupBy(
        schema.campaignModels.providerModelId,
        schema.campaignModels.id,
        schema.votes.winner,
      ),
    db
      .select({
        providerModelId: schema.campaignModels.providerModelId,
        campaignModelId: schema.campaignModels.id,
        winner: schema.votes.winner,
        n: count(),
      })
      .from(schema.votes)
      .innerJoin(
        schema.generations,
        eq(schema.votes.generationBId, schema.generations.id),
      )
      .innerJoin(
        schema.campaignModels,
        eq(schema.generations.campaignModelId, schema.campaignModels.id),
      )
      .groupBy(
        schema.campaignModels.providerModelId,
        schema.campaignModels.id,
        schema.votes.winner,
      ),
  ]);

  const countByCampaignId = new Map<string, number>();
  let totalVotes = 0;
  for (const row of byCampaign) {
    if (!row.campaignId) continue;
    countByCampaignId.set(row.campaignId, row.n);
    totalVotes += row.n;
  }

  const performanceByProviderModelId = new Map<
    string,
    { wins: number; losses: number; ties: number }
  >();
  const performanceByCampaignModelId = new Map<
    string,
    { wins: number; losses: number; ties: number }
  >();
  function bumpProvider(
    provider: string,
    key: 'wins' | 'losses' | 'ties',
    n: number,
  ) {
    const bucket =
      performanceByProviderModelId.get(provider) ?? { wins: 0, losses: 0, ties: 0 };
    bucket[key] += n;
    performanceByProviderModelId.set(provider, bucket);
  }
  function bumpCampaignModel(
    campaignModelId: string,
    key: 'wins' | 'losses' | 'ties',
    n: number,
  ) {
    const bucket =
      performanceByCampaignModelId.get(campaignModelId) ?? {
        wins: 0,
        losses: 0,
        ties: 0,
      };
    bucket[key] += n;
    performanceByCampaignModelId.set(campaignModelId, bucket);
  }
  for (const row of asASide) {
    const key =
      row.winner === 'A' ? 'wins' : row.winner === 'B' ? 'losses' : 'ties';
    bumpProvider(row.providerModelId, key, row.n);
    bumpCampaignModel(row.campaignModelId, key, row.n);
  }
  for (const row of asBSide) {
    const key =
      row.winner === 'B' ? 'wins' : row.winner === 'A' ? 'losses' : 'ties';
    bumpProvider(row.providerModelId, key, row.n);
    bumpCampaignModel(row.campaignModelId, key, row.n);
  }

  return {
    totalVotes,
    countByCampaignId,
    performanceByProviderModelId,
    performanceByCampaignModelId,
  };
}

async function loadGenerationAggregates(
  db: ReturnType<typeof getDb>,
): Promise<SnapshotGenerationAggregates> {
  const rows = await db
    .select({ campaignId: schema.campaignModels.campaignId, n: count() })
    .from(schema.generations)
    .innerJoin(
      schema.campaignModels,
      eq(schema.generations.campaignModelId, schema.campaignModels.id),
    )
    .where(
      and(isNotNull(schema.generations.output), isNull(schema.generations.error)),
    )
    .groupBy(schema.campaignModels.campaignId);

  const successCountByCampaignId = new Map<string, number>();
  for (const row of rows) successCountByCampaignId.set(row.campaignId, row.n);
  return { successCountByCampaignId };
}

async function loadParticipantAggregates(
  db: ReturnType<typeof getDb>,
): Promise<SnapshotParticipantAggregates> {
  const rows = await db
    .select({ campaignId: schema.participants.campaignId, n: count() })
    .from(schema.participants)
    .groupBy(schema.participants.campaignId);
  const countByCampaignId = new Map<string, number>();
  for (const row of rows) countByCampaignId.set(row.campaignId, row.n);
  return { countByCampaignId };
}

async function computeAnalyticsSnapshot(
  db: ReturnType<typeof getDb>,
): Promise<AnalyticsSnapshot> {
  const registry = await syncModelRegistry(db);

  const [
    campaigns,
    prompts,
    finishedParticipants,
    campaignModels,
    ratings,
    voteAggregates,
    generationAggregates,
    participantAggregates,
  ] = await Promise.all([
      // Soft-deleted campaigns are excluded from analytics so the
      // dashboard leaderboard / model library / activity feed don't
      // surface ghost data.
      db.select().from(schema.campaigns).where(isNull(schema.campaigns.deletedAt)),
      db.select({ id: schema.prompts.id, campaignId: schema.prompts.campaignId }).from(schema.prompts),
      // Activity feed needs recent participant_finished events. Only
      // finished participants matter for that — total counts come from
      // participantAggregates below.
      db
        .select({
          id: schema.participants.id,
          campaignId: schema.participants.campaignId,
          finishedAt: schema.participants.finishedAt,
        })
        .from(schema.participants)
        .where(isNotNull(schema.participants.finishedAt))
        .orderBy(desc(schema.participants.finishedAt))
        .limit(50),
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
          id: schema.ratings.id,
          campaignId: schema.ratings.campaignId,
          campaignModelId: schema.ratings.campaignModelId,
          category: schema.ratings.category,
          rating: schema.ratings.rating,
          seRating: schema.ratings.seRating,
          ciLow: schema.ratings.ciLow,
          ciHigh: schema.ratings.ciHigh,
          gameCount: schema.ratings.gameCount,
          computedAt: schema.ratings.computedAt,
        })
        .from(schema.ratings)
        .where(eq(schema.ratings.category, 'overall'))
        .orderBy(desc(schema.ratings.computedAt)),
      loadVoteAggregates(db),
      loadGenerationAggregates(db),
      loadParticipantAggregates(db),
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
    // Raw arrays for `votes` and `generations` are no longer fetched —
    // consumers read the aggregates below. Empty arrays preserve shape
    // for any code path or test that still inspects them. `participants`
    // is narrowed to only the finished ones, which the activity feed
    // needs for its participant_finished events.
    participants: finishedParticipants,
    campaignModels,
    generations: [],
    votes: [],
    // Drizzle returns `numeric(p,s)` columns as strings. Coerce to number
    // here so the ActivityRatingRecord contract holds across consumers.
    ratings: ratings.map((rating) => ({
      ...rating,
      seRating: rating.seRating != null ? Number(rating.seRating) : null,
    })),
    voteAggregates,
    generationAggregates,
    participantAggregates,
  };
}
