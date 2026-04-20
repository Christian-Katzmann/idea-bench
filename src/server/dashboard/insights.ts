import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';

/**
 * Pairwise matchup between two models within a single campaign.
 * Counts are normalized so `aWins` always means "the model with id `aCampaignModelId` won."
 * Vote `winner` of `'tie'` and `'both_bad'` both increment `ties`.
 */
export interface CampaignMatchup {
  aCampaignModelId: string;
  bCampaignModelId: string;
  aWins: number;
  bWins: number;
  ties: number;
}

/** A single hour's vote count, padded with zeros for empty hours. */
export interface CampaignPulseBucket {
  /** Truncated-to-hour ISO timestamp, e.g. "2026-04-20T14:00:00.000Z". */
  hour: string;
  votes: number;
}

/**
 * One vote, with model IDs the client can resolve to display names from the
 * existing leaderboard `ratings` array. `winnerCampaignModelId` is null on tie.
 */
export interface CampaignRecentVote {
  at: string;
  aCampaignModelId: string;
  bCampaignModelId: string;
  winnerCampaignModelId: string | null;
  isTie: boolean;
}

export interface CampaignInsights {
  matchups: CampaignMatchup[];
  pulseBuckets: CampaignPulseBucket[];
  recentVotes: CampaignRecentVote[];
}

const PULSE_HOURS = 24;
const RECENT_VOTES_PER_CAMPAIGN = 5;

/**
 * Load per-campaign matchup matrices, hourly vote velocity over the last 24h,
 * and the most recent N votes — all in three bounded queries against the
 * featured campaign IDs.
 *
 * Designed to live alongside `loadAnalyticsSnapshot`: the snapshot already
 * has model labels, so we ship raw IDs here and let the client resolve names
 * from the leaderboard rows it's already rendering.
 */
export async function loadCampaignInsights(
  db: ReturnType<typeof getDb>,
  campaignIds: string[],
): Promise<Map<string, CampaignInsights>> {
  const result = new Map<string, CampaignInsights>();
  if (campaignIds.length === 0) return result;

  for (const id of campaignIds) {
    result.set(id, { matchups: [], pulseBuckets: [], recentVotes: [] });
  }

  const ga = alias(schema.generations, 'ga');
  const gb = alias(schema.generations, 'gb');

  const since = new Date(Date.now() - PULSE_HOURS * 60 * 60 * 1000);

  const [matchupRows, pulseRows, recentRows] = await Promise.all([
    db
      .select({
        campaignId: schema.votes.campaignId,
        aId: ga.campaignModelId,
        bId: gb.campaignModelId,
        winner: schema.votes.winner,
        n: count(),
      })
      .from(schema.votes)
      .innerJoin(ga, eq(schema.votes.generationAId, ga.id))
      .innerJoin(gb, eq(schema.votes.generationBId, gb.id))
      .where(inArray(schema.votes.campaignId, campaignIds))
      .groupBy(
        schema.votes.campaignId,
        ga.campaignModelId,
        gb.campaignModelId,
        schema.votes.winner,
      ),

    db
      .select({
        campaignId: schema.votes.campaignId,
        hour: sql<Date>`date_trunc('hour', ${schema.votes.createdAt})`.as(
          'hour',
        ),
        n: count(),
      })
      .from(schema.votes)
      .where(
        and(
          inArray(schema.votes.campaignId, campaignIds),
          gte(schema.votes.createdAt, since),
        ),
      )
      .groupBy(schema.votes.campaignId, sql`hour`),

    // Latest N votes per campaign via ROW_NUMBER window. Use explicit SQL
    // aliases for the two campaign_model_id columns — otherwise Drizzle
    // emits the bare column name twice and the outer SELECT can't tell
    // them apart.
    (async () => {
      const ranked = db
        .select({
          campaignId: schema.votes.campaignId,
          createdAt: schema.votes.createdAt,
          winner: schema.votes.winner,
          aCampaignModelId:
            sql<string>`${ga.campaignModelId}`.as('a_campaign_model_id'),
          bCampaignModelId:
            sql<string>`${gb.campaignModelId}`.as('b_campaign_model_id'),
          rn: sql<number>`row_number() over (partition by ${schema.votes.campaignId} order by ${schema.votes.createdAt} desc)`.as(
            'rn',
          ),
        })
        .from(schema.votes)
        .innerJoin(ga, eq(schema.votes.generationAId, ga.id))
        .innerJoin(gb, eq(schema.votes.generationBId, gb.id))
        .where(inArray(schema.votes.campaignId, campaignIds))
        .as('ranked');

      return db
        .select({
          campaignId: ranked.campaignId,
          createdAt: ranked.createdAt,
          winner: ranked.winner,
          aCampaignModelId: ranked.aCampaignModelId,
          bCampaignModelId: ranked.bCampaignModelId,
        })
        .from(ranked)
        .where(sql`${ranked.rn} <= ${RECENT_VOTES_PER_CAMPAIGN}`)
        .orderBy(ranked.campaignId, desc(ranked.createdAt));
    })(),
  ]);

  // Fold matchups into a normalized {aId,bId} key (sorted) so the matrix is
  // symmetric. We always store with the lex-smaller id as `a` and adjust
  // win/loss accordingly.
  const matchupMap = new Map<string, Map<string, CampaignMatchup>>();
  for (const id of campaignIds) matchupMap.set(id, new Map());

  for (const row of matchupRows) {
    if (!row.campaignId || !row.aId || !row.bId) continue;
    if (row.aId === row.bId) continue;
    const [lo, hi] =
      row.aId < row.bId ? [row.aId, row.bId] : [row.bId, row.aId];
    const aIsLo = row.aId === lo;
    const key = `${lo}::${hi}`;
    const bucket = matchupMap.get(row.campaignId)!;
    const existing =
      bucket.get(key) ??
      ({
        aCampaignModelId: lo,
        bCampaignModelId: hi,
        aWins: 0,
        bWins: 0,
        ties: 0,
      } satisfies CampaignMatchup);

    if (row.winner === 'tie' || row.winner === 'both_bad') {
      existing.ties += row.n;
    } else if (
      (row.winner === 'A' && aIsLo) ||
      (row.winner === 'B' && !aIsLo)
    ) {
      existing.aWins += row.n;
    } else {
      existing.bWins += row.n;
    }
    bucket.set(key, existing);
  }

  for (const [campaignId, bucket] of matchupMap) {
    result.get(campaignId)!.matchups = Array.from(bucket.values());
  }

  // Build pulse: pad each campaign's last 24 hours with zeros.
  const hourSlots: string[] = [];
  const nowHour = new Date(Date.now());
  nowHour.setUTCMinutes(0, 0, 0);
  for (let i = PULSE_HOURS - 1; i >= 0; i--) {
    const t = new Date(nowHour.getTime() - i * 60 * 60 * 1000);
    hourSlots.push(t.toISOString());
  }
  const pulseByCampaign = new Map<string, Map<string, number>>();
  for (const id of campaignIds) pulseByCampaign.set(id, new Map());
  for (const row of pulseRows) {
    if (!row.campaignId) continue;
    const iso = new Date(row.hour).toISOString();
    pulseByCampaign.get(row.campaignId)!.set(iso, row.n);
  }
  for (const [campaignId, hourMap] of pulseByCampaign) {
    result.get(campaignId)!.pulseBuckets = hourSlots.map((hour) => ({
      hour,
      votes: hourMap.get(hour) ?? 0,
    }));
  }

  // Recent votes feed.
  for (const row of recentRows) {
    const isTie = row.winner === 'tie' || row.winner === 'both_bad';
    const winnerCampaignModelId = isTie
      ? null
      : row.winner === 'A'
        ? row.aCampaignModelId
        : row.bCampaignModelId;
    result.get(row.campaignId)!.recentVotes.push({
      at: row.createdAt.toISOString(),
      aCampaignModelId: row.aCampaignModelId,
      bCampaignModelId: row.bCampaignModelId,
      winnerCampaignModelId,
      isTie,
    });
  }

  return result;
}
