/**
 * Ratings recompute pipeline.
 *
 * Reads votes + generations + prompts for a campaign, builds per-mode
 * aggregates, and UPSERTs into the `ratings` table. Three mode families
 * are supported in Phase 1:
 *
 *   - Tournament (mode='tournament'): Bradley-Terry MM. Category keys
 *     are `overall` and each user-defined tag.
 *   - Slider (mode='slider'): arithmetic mean + SE of the mean. Category
 *     keys are prefixed `slider:` — e.g. `slider:overall`, `slider:tone`.
 *     Stored `rating` = round(mean × 100) so an 8.3 mean on a 1..10
 *     scale renders as 830.
 *   - Approve/Reject (mode='approve_reject'): pass rate + Wilson 95% CI.
 *     Category keys are prefixed `approve_reject:`. Stored `rating` =
 *     round(pass_rate × 100) — so a 0.83 pass rate renders as 83.
 *
 * The per-mode prefix on `category` is the discriminator; readers
 * dispatch on it. This lets us extend without a schema change (see
 * Plan 01 — a `ratings.mode` column is a Phase 2+ option if the
 * category-prefix approach feels crowded).
 *
 * Category handling (shared across modes): every response contributes
 * to `<prefix>overall`, plus to each tag in its prompt's `category_tags`.
 * The sentinel string `overall` is reserved; user tags must not use it.
 */
import { eq, inArray } from 'drizzle-orm';
import { getDb } from './db/client.js';
import * as schema from './db/schema.js';
import {
  computeBradleyTerry,
  votesToComparisons,
  type BTComparison,
  type BTOutput,
} from './bradley-terry.js';

const OVERALL = 'overall';
export const SLIDER_CATEGORY_PREFIX = 'slider:';
export const APPROVE_REJECT_CATEGORY_PREFIX = 'approve_reject:';
export const BEST_OF_N_CATEGORY_PREFIX = 'best_of_n:';
// Multi-axis stores one ratings row per (model, dimension, category).
// Encoded as `multi_axis:<dimensionKey>:<category>` so readers can pull
// every dimension's rollup with a single `startsWith` filter. Dimension
// keys are validated at create time to exclude ':' characters.
export const MULTI_AXIS_CATEGORY_PREFIX = 'multi_axis:';

/**
 * Z-score for a 95% two-sided normal confidence interval. Used for
 * slider SE → CI and Wilson pass-rate CI half-widths.
 */
const Z95 = 1.96;

export interface RecomputeResult {
  campaignId: string;
  totalVotes: number;
  /** category (incl. 'overall') → per-model B-T output */
  byCategory: Record<string, BTOutput>;
  /** Number of rating rows written (one per (model, category)). */
  rowsWritten: number;
}

export async function recomputeCampaignRatings(
  campaignId: string,
): Promise<RecomputeResult> {
  const db = getDb();

  // Fetch every input for every mode in parallel. A campaign can mix
  // modes, so we need all five response tables + the prompts + models.
  // Qualitative isn't fetched here — it has no numeric aggregate and
  // is read directly by the comments-reader surface.
  const [
    campaignModels,
    prompts,
    votes,
    sliderResponses,
    approveRejectResponses,
    bestOfNResponses,
    multiAxisResponses,
  ] = await Promise.all([
    db
      .select()
      .from(schema.campaignModels)
      .where(eq(schema.campaignModels.campaignId, campaignId)),
    db
      .select()
      .from(schema.prompts)
      .where(eq(schema.prompts.campaignId, campaignId)),
    db
      .select()
      .from(schema.votes)
      .where(eq(schema.votes.campaignId, campaignId)),
    db
      .select()
      .from(schema.sliderResponses)
      .where(eq(schema.sliderResponses.campaignId, campaignId)),
    db
      .select()
      .from(schema.approveRejectResponses)
      .where(eq(schema.approveRejectResponses.campaignId, campaignId)),
    db
      .select()
      .from(schema.bestOfNResponses)
      .where(eq(schema.bestOfNResponses.campaignId, campaignId)),
    db
      .select()
      .from(schema.multiAxisResponses)
      .where(eq(schema.multiAxisResponses.campaignId, campaignId)),
  ]);

  if (campaignModels.length === 0) {
    return {
      campaignId,
      totalVotes: 0,
      byCategory: {},
      rowsWritten: 0,
    };
  }

  const modelIds = campaignModels.map((m) => m.id);
  const promptCategoryTags = new Map(
    prompts.map((p) => [p.id, p.categoryTags ?? []]),
  );
  const now = new Date();
  const inserts: schema.NewRating[] = [];

  // Partition responses by source for the Plan 02 "Human / Simulated /
  // Both" leaderboard filter. Each partition produces its own set of
  // rating rows tagged with `source`. The 'both' partition — the
  // combined view — is the default the dashboard reads with no filter,
  // so campaigns without any simulated signal see no behavior change.
  const bySourceVotes = partitionVotesBySource(votes);
  const bySourceSlider = partitionResponsesBySource(sliderResponses);
  const bySourceApproveReject = partitionResponsesBySource(approveRejectResponses);
  const bySourceBestOfN = partitionResponsesBySource(bestOfNResponses);
  const bySourceMultiAxis = partitionResponsesBySource(multiAxisResponses);

  const sourceOrder: schema.RatingSource[] = ['human', 'simulated', 'both'];

  // ─── Tournament (Bradley-Terry) ───────────────────────────────────────
  // byCategory (returned below) uses the `both` view — the combined
  // signal — so downstream consumers of RecomputeResult get the same
  // shape they always have.
  const byCategory = await computeTournamentByCategory({
    votes: bySourceVotes.both,
    modelIds,
    promptCategoryTags,
  });
  for (const source of sourceOrder) {
    const subsetVotes = bySourceVotes[source];
    if (subsetVotes.length === 0 && source !== 'both') continue;
    const subset =
      source === 'both'
        ? byCategory
        : await computeTournamentByCategory({
            votes: subsetVotes,
            modelIds,
            promptCategoryTags,
          });
    for (const [cat, bt] of Object.entries(subset)) {
      for (const modelId of modelIds) {
        const rating = Math.round(bt.ratings[modelId]);
        const seNum = bt.seRatings[modelId];
        inserts.push({
          campaignId,
          campaignModelId: modelId,
          category: cat,
          source,
          rating,
          seRating: seNum != null ? seNum.toFixed(4) : null,
          ciLow:
            bt.ciLow[modelId] != null ? Math.round(bt.ciLow[modelId]!) : null,
          ciHigh:
            bt.ciHigh[modelId] != null
              ? Math.round(bt.ciHigh[modelId]!)
              : null,
          btStrength: bt.strengths[modelId].toFixed(8),
          gameCount: Math.round(bt.gameCount[modelId]),
          computedAt: now,
        });
      }
    }
  }

  // ─── Slider ───────────────────────────────────────────────────────────
  for (const source of sourceOrder) {
    const responses = bySourceSlider[source];
    if (responses.length === 0 && source !== 'both') continue;
    for (const row of computeSliderAggregates({
      campaignId,
      responses,
      modelIds,
      promptCategoryTags,
      now,
    })) {
      inserts.push({ ...row, source });
    }
  }

  // ─── Approve / Reject ─────────────────────────────────────────────────
  for (const source of sourceOrder) {
    const responses = bySourceApproveReject[source];
    if (responses.length === 0 && source !== 'both') continue;
    for (const row of computeApproveRejectAggregates({
      campaignId,
      responses,
      modelIds,
      promptCategoryTags,
      now,
    })) {
      inserts.push({ ...row, source });
    }
  }

  // ─── Best-of-N ────────────────────────────────────────────────────────
  for (const source of sourceOrder) {
    const responses = bySourceBestOfN[source];
    if (responses.length === 0 && source !== 'both') continue;
    for (const row of computeBestOfNAggregates({
      campaignId,
      responses,
      modelIds,
      promptCategoryTags,
      now,
    })) {
      inserts.push({ ...row, source });
    }
  }

  // ─── Multi-axis ───────────────────────────────────────────────────────
  for (const source of sourceOrder) {
    const responses = bySourceMultiAxis[source];
    if (responses.length === 0 && source !== 'both') continue;
    for (const row of computeMultiAxisAggregates({
      campaignId,
      responses,
      prompts,
      modelIds,
      promptCategoryTags,
      now,
    })) {
      inserts.push({ ...row, source });
    }
  }

  // Wipe and insert fresh rating rows. DELETE + INSERT (rather than
  // UPSERT) keeps the set of (category, model) rows exactly aligned
  // with the current inputs — retired categories disappear cleanly.
  await db
    .delete(schema.ratings)
    .where(eq(schema.ratings.campaignId, campaignId));

  if (inserts.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < inserts.length; i += CHUNK) {
      await db.insert(schema.ratings).values(inserts.slice(i, i + CHUNK));
    }
  }

  return {
    campaignId,
    totalVotes: votes.length,
    byCategory,
    rowsWritten: inserts.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Tournament (Bradley-Terry) aggregation — split out from the main
// pipeline so each mode is self-contained.
// ─────────────────────────────────────────────────────────────────────────

async function computeTournamentByCategory(args: {
  votes: schema.Vote[];
  modelIds: string[];
  promptCategoryTags: Map<string, string[]>;
}): Promise<Record<string, BTOutput>> {
  const { votes, modelIds, promptCategoryTags } = args;

  const modelIdByGeneration = await loadGenerationToModelMap(
    votes.map((v) => v.generationAId).concat(votes.map((v) => v.generationBId)),
  );

  const compsByCat = new Map<string, BTComparison[]>();
  compsByCat.set(OVERALL, []);

  for (const v of votes) {
    const aModelId = modelIdByGeneration.get(v.generationAId);
    const bModelId = modelIdByGeneration.get(v.generationBId);
    if (!aModelId || !bModelId) continue;

    let outcome: 'decisive' | 'tie' | 'both_bad';
    let winnerModelId: string;
    let loserModelId: string;
    if (v.winner === 'A') {
      winnerModelId = aModelId;
      loserModelId = bModelId;
      outcome = 'decisive';
    } else if (v.winner === 'B') {
      winnerModelId = bModelId;
      loserModelId = aModelId;
      outcome = 'decisive';
    } else {
      winnerModelId = aModelId;
      loserModelId = bModelId;
      outcome = v.winner;
    }

    const comps = votesToComparisons([
      { winnerModelId, loserModelId, outcome },
    ]);
    for (const c of comps) compsByCat.get(OVERALL)!.push(c);
    const tags = promptCategoryTags.get(v.promptId) ?? [];
    for (const tag of tags) {
      if (tag === OVERALL) continue;
      if (!compsByCat.has(tag)) compsByCat.set(tag, []);
      for (const c of comps) compsByCat.get(tag)!.push(c);
    }
  }

  const byCategory: Record<string, BTOutput> = {};
  for (const [cat, comps] of compsByCat.entries()) {
    byCategory[cat] = computeBradleyTerry(modelIds, comps);
  }
  return byCategory;
}

// ─────────────────────────────────────────────────────────────────────────
// Slider aggregation
//
// For each (model, category) bucket: sample mean of the 1..N scores.
// Store on the ratings table scaled × 100 so the `rating` integer stays
// easy to read ("mean 7.3" → rating=730). SE of the mean uses the
// standard stddev / √n formula; n=1 produces SE=null so the UI can
// show "—" rather than a nonsense CI.
// ─────────────────────────────────────────────────────────────────────────

function computeSliderAggregates(args: {
  campaignId: string;
  responses: schema.SliderResponse[];
  modelIds: string[];
  promptCategoryTags: Map<string, string[]>;
  now: Date;
}): schema.NewRating[] {
  const { campaignId, responses, modelIds, promptCategoryTags, now } = args;
  if (responses.length === 0) return [];

  // scoresByCatModel[category][modelId] = array of raw scores
  const scoresByCatModel = new Map<string, Map<string, number[]>>();
  const bucket = (cat: string, modelId: string): number[] => {
    if (!scoresByCatModel.has(cat))
      scoresByCatModel.set(cat, new Map<string, number[]>());
    const inner = scoresByCatModel.get(cat)!;
    if (!inner.has(modelId)) inner.set(modelId, []);
    return inner.get(modelId)!;
  };

  for (const r of responses) {
    bucket(OVERALL, r.campaignModelId).push(r.score);
    const tags = promptCategoryTags.get(r.promptId) ?? [];
    for (const tag of tags) {
      if (tag === OVERALL) continue;
      bucket(tag, r.campaignModelId).push(r.score);
    }
  }

  const rows: schema.NewRating[] = [];
  for (const [cat, inner] of scoresByCatModel.entries()) {
    for (const modelId of modelIds) {
      const scores = inner.get(modelId) ?? [];
      if (scores.length === 0) {
        // Model has no ratings in this category — emit an empty row so
        // the leaderboard lists it with a 0 game count rather than
        // dropping it silently.
        rows.push({
          campaignId,
          campaignModelId: modelId,
          category: `${SLIDER_CATEGORY_PREFIX}${cat}`,
          rating: 0,
          seRating: null,
          ciLow: null,
          ciHigh: null,
          btStrength: '0',
          gameCount: 0,
          computedAt: now,
        });
        continue;
      }
      const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
      const variance =
        scores.length > 1
          ? scores.reduce((s, x) => s + (x - mean) * (x - mean), 0) /
            (scores.length - 1)
          : 0;
      const stddev = Math.sqrt(variance);
      const se = scores.length > 1 ? stddev / Math.sqrt(scores.length) : null;

      // Scale × 100 so integers in `rating` land naturally (mean 7.3 →
      // rating=730). Callers check the category prefix before reading.
      const ratingInt = Math.round(mean * 100);
      const ciLow = se != null ? Math.round((mean - Z95 * se) * 100) : null;
      const ciHigh = se != null ? Math.round((mean + Z95 * se) * 100) : null;

      rows.push({
        campaignId,
        campaignModelId: modelId,
        category: `${SLIDER_CATEGORY_PREFIX}${cat}`,
        rating: ratingInt,
        seRating: se != null ? se.toFixed(4) : null,
        ciLow,
        ciHigh,
        btStrength: mean.toFixed(8),
        gameCount: scores.length,
        computedAt: now,
      });
    }
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────
// Approve/Reject aggregation
//
// Per (model, category): Wilson 95% score interval on the pass rate.
// Wilson is the standard choice for small-sample proportions — it
// behaves better than Normal approximation at the 0/100% edges.
// `rating` = round(p × 100); bounds also on the percent scale.
// ─────────────────────────────────────────────────────────────────────────

function computeApproveRejectAggregates(args: {
  campaignId: string;
  responses: schema.ApproveRejectResponse[];
  modelIds: string[];
  promptCategoryTags: Map<string, string[]>;
  now: Date;
}): schema.NewRating[] {
  const { campaignId, responses, modelIds, promptCategoryTags, now } = args;
  if (responses.length === 0) return [];

  // by[cat][model] = { approved: n, total: n }
  const byCatModel = new Map<
    string,
    Map<string, { approved: number; total: number }>
  >();
  const bucket = (
    cat: string,
    modelId: string,
  ): { approved: number; total: number } => {
    if (!byCatModel.has(cat))
      byCatModel.set(
        cat,
        new Map<string, { approved: number; total: number }>(),
      );
    const inner = byCatModel.get(cat)!;
    if (!inner.has(modelId)) inner.set(modelId, { approved: 0, total: 0 });
    return inner.get(modelId)!;
  };

  for (const r of responses) {
    const rec = bucket(OVERALL, r.campaignModelId);
    rec.total += 1;
    if (r.approved) rec.approved += 1;
    const tags = promptCategoryTags.get(r.promptId) ?? [];
    for (const tag of tags) {
      if (tag === OVERALL) continue;
      const t = bucket(tag, r.campaignModelId);
      t.total += 1;
      if (r.approved) t.approved += 1;
    }
  }

  const rows: schema.NewRating[] = [];
  for (const [cat, inner] of byCatModel.entries()) {
    for (const modelId of modelIds) {
      const rec = inner.get(modelId) ?? { approved: 0, total: 0 };
      if (rec.total === 0) {
        rows.push({
          campaignId,
          campaignModelId: modelId,
          category: `${APPROVE_REJECT_CATEGORY_PREFIX}${cat}`,
          rating: 0,
          seRating: null,
          ciLow: null,
          ciHigh: null,
          btStrength: '0',
          gameCount: 0,
          computedAt: now,
        });
        continue;
      }
      const p = rec.approved / rec.total;
      const { low, high } = wilsonInterval(rec.approved, rec.total, Z95);
      // SE on the percent scale for downstream code that needs it; not
      // strictly required for Wilson display but kept for parity with
      // the tournament path.
      const se = Math.sqrt((p * (1 - p)) / rec.total);
      rows.push({
        campaignId,
        campaignModelId: modelId,
        category: `${APPROVE_REJECT_CATEGORY_PREFIX}${cat}`,
        rating: Math.round(p * 100),
        seRating: (se * 100).toFixed(4),
        ciLow: Math.round(low * 100),
        ciHigh: Math.round(high * 100),
        btStrength: p.toFixed(8),
        gameCount: rec.total,
        computedAt: now,
      });
    }
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────
// Best-of-N aggregation
//
// For each (model, category) bucket: win rate = (times chosen) / (times
// eligible). A model is "eligible" whenever a participant picked *any*
// winner for a prompt that this model was in. Since best_of_n campaigns
// always show every model's output on every prompt, eligibility equals
// "participant submitted a pick for this prompt" — regardless of who
// won. Wilson 95% CI on the pass-rate scale, stored × 100 like
// approve/reject.
// ─────────────────────────────────────────────────────────────────────────

export function computeBestOfNAggregates(args: {
  campaignId: string;
  responses: schema.BestOfNResponse[];
  modelIds: string[];
  promptCategoryTags: Map<string, string[]>;
  now: Date;
}): schema.NewRating[] {
  const { campaignId, responses, modelIds, promptCategoryTags, now } = args;
  if (responses.length === 0) return [];

  // Eligibility: a submission contributes a count to every campaign
  // model on the prompt (since every model's output was shown to the
  // voter). Only one model "wins". Grouped by category.
  const byCatModel = new Map<
    string,
    Map<string, { wins: number; eligible: number }>
  >();
  const bucket = (
    cat: string,
    modelId: string,
  ): { wins: number; eligible: number } => {
    if (!byCatModel.has(cat))
      byCatModel.set(
        cat,
        new Map<string, { wins: number; eligible: number }>(),
      );
    const inner = byCatModel.get(cat)!;
    if (!inner.has(modelId)) inner.set(modelId, { wins: 0, eligible: 0 });
    return inner.get(modelId)!;
  };

  for (const r of responses) {
    // Every response contributes to OVERALL plus each of its prompt's
    // tags. The sentinel string 'overall' as a user-tag is reserved
    // (enforced at campaign creation) so there's no double counting.
    const tags = promptCategoryTags.get(r.promptId) ?? [];
    const cats = [OVERALL, ...tags.filter((t) => t !== OVERALL)];
    for (const cat of cats) {
      for (const modelId of modelIds) {
        const rec = bucket(cat, modelId);
        rec.eligible += 1;
      }
      const winRec = bucket(cat, r.chosenCampaignModelId);
      winRec.wins += 1;
    }
  }

  const rows: schema.NewRating[] = [];
  for (const [cat, inner] of byCatModel.entries()) {
    for (const modelId of modelIds) {
      const rec = inner.get(modelId) ?? { wins: 0, eligible: 0 };
      if (rec.eligible === 0) {
        rows.push({
          campaignId,
          campaignModelId: modelId,
          category: `${BEST_OF_N_CATEGORY_PREFIX}${cat}`,
          rating: 0,
          seRating: null,
          ciLow: null,
          ciHigh: null,
          btStrength: '0',
          gameCount: 0,
          computedAt: now,
        });
        continue;
      }
      const p = rec.wins / rec.eligible;
      const { low, high } = wilsonInterval(rec.wins, rec.eligible, Z95);
      const se = Math.sqrt((p * (1 - p)) / rec.eligible);
      rows.push({
        campaignId,
        campaignModelId: modelId,
        category: `${BEST_OF_N_CATEGORY_PREFIX}${cat}`,
        rating: Math.round(p * 100),
        seRating: (se * 100).toFixed(4),
        ciLow: Math.round(low * 100),
        ciHigh: Math.round(high * 100),
        btStrength: p.toFixed(8),
        gameCount: rec.eligible,
        computedAt: now,
      });
    }
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────
// Multi-axis aggregation
//
// For each (model, dimension, category): arithmetic mean + SE of the
// dimension's score. One ratings row per combination; category label is
// `multi_axis:<dimensionKey>:<category>` so readers can extract the
// dimension from the key.
//
// The set of valid dimension keys comes from each prompt's modeConfig.
// We only emit rows for dimensions that actually appear in responses
// (a dimension that was retired mid-campaign disappears cleanly).
// ─────────────────────────────────────────────────────────────────────────

export function computeMultiAxisAggregates(args: {
  campaignId: string;
  responses: schema.MultiAxisResponse[];
  prompts: schema.Prompt[];
  modelIds: string[];
  promptCategoryTags: Map<string, string[]>;
  now: Date;
}): schema.NewRating[] {
  const { campaignId, responses, modelIds, promptCategoryTags, now } = args;
  if (responses.length === 0) return [];

  // scoresByDimCatModel[dim][category][modelId] = array of raw scores
  const outer = new Map<string, Map<string, Map<string, number[]>>>();
  const bucket = (dim: string, cat: string, modelId: string): number[] => {
    if (!outer.has(dim)) outer.set(dim, new Map());
    const catMap = outer.get(dim)!;
    if (!catMap.has(cat)) catMap.set(cat, new Map());
    const modMap = catMap.get(cat)!;
    if (!modMap.has(modelId)) modMap.set(modelId, []);
    return modMap.get(modelId)!;
  };

  // Collect the set of dimension keys observed across all responses
  // (via the jsonb `scores` field). Prompts' modeConfig could name more
  // dimensions than actually voted on; we only emit rows for those we
  // have data for.
  for (const r of responses) {
    const scores = r.scores as Record<string, number>;
    for (const [dimKey, value] of Object.entries(scores)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      bucket(dimKey, OVERALL, r.campaignModelId).push(value);
      const tags = promptCategoryTags.get(r.promptId) ?? [];
      for (const tag of tags) {
        if (tag === OVERALL) continue;
        bucket(dimKey, tag, r.campaignModelId).push(value);
      }
    }
  }

  const rows: schema.NewRating[] = [];
  for (const [dim, catMap] of outer.entries()) {
    for (const [cat, modMap] of catMap.entries()) {
      for (const modelId of modelIds) {
        const scores = modMap.get(modelId) ?? [];
        const categoryKey = `${MULTI_AXIS_CATEGORY_PREFIX}${dim}:${cat}`;
        if (scores.length === 0) {
          rows.push({
            campaignId,
            campaignModelId: modelId,
            category: categoryKey,
            rating: 0,
            seRating: null,
            ciLow: null,
            ciHigh: null,
            btStrength: '0',
            gameCount: 0,
            computedAt: now,
          });
          continue;
        }
        const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
        const variance =
          scores.length > 1
            ? scores.reduce((s, x) => s + (x - mean) * (x - mean), 0) /
              (scores.length - 1)
            : 0;
        const stddev = Math.sqrt(variance);
        const se = scores.length > 1 ? stddev / Math.sqrt(scores.length) : null;
        rows.push({
          campaignId,
          campaignModelId: modelId,
          category: categoryKey,
          rating: Math.round(mean * 100),
          seRating: se != null ? se.toFixed(4) : null,
          ciLow: se != null ? Math.round((mean - Z95 * se) * 100) : null,
          ciHigh: se != null ? Math.round((mean + Z95 * se) * 100) : null,
          btStrength: mean.toFixed(8),
          gameCount: scores.length,
          computedAt: now,
        });
      }
    }
  }
  return rows;
}

/**
 * Wilson score interval for a binomial proportion. Returns bounds in
 * [0, 1] on the raw probability scale; callers scale to display units.
 */
export function wilsonInterval(
  successes: number,
  total: number,
  z: number,
): { low: number; high: number } {
  if (total <= 0) return { low: 0, high: 0 };
  const p = successes / total;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const half =
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
    denom;
  return {
    low: Math.max(0, center - half),
    high: Math.min(1, center + half),
  };
}

/**
 * Same math, but scoped to a single participant's vote subset. Used by
 * the personal-results endpoint. Does NOT touch the `ratings` table —
 * purely a compute-on-demand.
 */
export async function computeParticipantRatings(
  campaignId: string,
  participantId: string,
): Promise<{
  overall: BTOutput;
  byCategory: Record<string, BTOutput>;
  totalVotes: number;
  seenModelIds: string[];
}> {
  const db = getDb();

  const [campaignModels, prompts, votes] = await Promise.all([
    db
      .select()
      .from(schema.campaignModels)
      .where(eq(schema.campaignModels.campaignId, campaignId)),
    db
      .select()
      .from(schema.prompts)
      .where(eq(schema.prompts.campaignId, campaignId)),
    db
      .select()
      .from(schema.votes)
      .where(eq(schema.votes.participantId, participantId)),
  ]);

  const modelIdByGeneration = await loadGenerationToModelMap(
    votes.flatMap((v) => [v.generationAId, v.generationBId]),
  );

  // Restrict to models the participant actually saw.
  const seen = new Set<string>();
  for (const v of votes) {
    const a = modelIdByGeneration.get(v.generationAId);
    const b = modelIdByGeneration.get(v.generationBId);
    if (a) seen.add(a);
    if (b) seen.add(b);
  }
  const seenModelIds = campaignModels
    .map((m) => m.id)
    .filter((id) => seen.has(id));

  const promptCategoryTags = new Map(
    prompts.map((p) => [p.id, p.categoryTags ?? []]),
  );

  const compsByCat = new Map<string, BTComparison[]>();
  compsByCat.set(OVERALL, []);
  for (const v of votes) {
    const aModelId = modelIdByGeneration.get(v.generationAId);
    const bModelId = modelIdByGeneration.get(v.generationBId);
    if (!aModelId || !bModelId) continue;

    let winnerModelId: string;
    let loserModelId: string;
    let outcome: 'decisive' | 'tie' | 'both_bad';
    if (v.winner === 'A') {
      winnerModelId = aModelId;
      loserModelId = bModelId;
      outcome = 'decisive';
    } else if (v.winner === 'B') {
      winnerModelId = bModelId;
      loserModelId = aModelId;
      outcome = 'decisive';
    } else {
      winnerModelId = aModelId;
      loserModelId = bModelId;
      outcome = v.winner;
    }
    const comps = votesToComparisons([
      { winnerModelId, loserModelId, outcome },
    ]);
    for (const c of comps) compsByCat.get(OVERALL)!.push(c);
    const tags = promptCategoryTags.get(v.promptId) ?? [];
    for (const tag of tags) {
      if (tag === OVERALL) continue;
      if (!compsByCat.has(tag)) compsByCat.set(tag, []);
      for (const c of comps) compsByCat.get(tag)!.push(c);
    }
  }

  const overall = computeBradleyTerry(seenModelIds, compsByCat.get(OVERALL)!);
  const byCategory: Record<string, BTOutput> = {};
  for (const [cat, comps] of compsByCat.entries()) {
    if (cat === OVERALL) continue;
    byCategory[cat] = computeBradleyTerry(seenModelIds, comps);
  }

  return {
    overall,
    byCategory,
    totalVotes: votes.length,
    seenModelIds,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Source partitioning (Plan 02)
//
// Every response row is XOR-tagged with `participant_id` (human) or
// `simulated_participant_id` (simulated). The partition returns three
// views: the human subset, the simulated subset, and the combined
// signal ("both"). Ratings are computed per partition and stored with
// the matching `source` so the dashboard filter reads a consistent
// slice with no on-the-fly arithmetic.
// ─────────────────────────────────────────────────────────────────────────

interface VoterTagged {
  participantId: string | null;
  simulatedParticipantId: string | null;
}

function partitionBySource<T extends VoterTagged>(rows: readonly T[]): {
  human: T[];
  simulated: T[];
  both: T[];
} {
  const human: T[] = [];
  const simulated: T[] = [];
  for (const r of rows) {
    if (r.participantId != null) human.push(r);
    else if (r.simulatedParticipantId != null) simulated.push(r);
  }
  return { human, simulated, both: [...human, ...simulated] };
}

function partitionVotesBySource(
  rows: readonly schema.Vote[],
): { human: schema.Vote[]; simulated: schema.Vote[]; both: schema.Vote[] } {
  return partitionBySource(rows);
}

function partitionResponsesBySource<T extends VoterTagged>(
  rows: readonly T[],
): { human: T[]; simulated: T[]; both: T[] } {
  return partitionBySource(rows);
}

async function loadGenerationToModelMap(
  generationIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(generationIds)];
  if (unique.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({
      id: schema.generations.id,
      campaignModelId: schema.generations.campaignModelId,
    })
    .from(schema.generations)
    .where(inArray(schema.generations.id, unique));
  return new Map(rows.map((r) => [r.id, r.campaignModelId]));
}
