/**
 * Ratings recompute pipeline.
 *
 * Reads votes + generations + prompts for a campaign, builds B-T
 * comparisons per category (plus `overall`), runs the solver, and
 * UPSERTs into the `ratings` table.
 *
 * Category handling: every vote contributes to `overall`, plus to each
 * tag in its prompt's `category_tags`. A prompt with no tags contributes
 * only to overall. The sentinel string `overall` is reserved; user tags
 * must not use it (validation happens at campaign creation).
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
      .where(eq(schema.votes.campaignId, campaignId)),
  ]);

  if (campaignModels.length === 0) {
    return {
      campaignId,
      totalVotes: 0,
      byCategory: {},
      rowsWritten: 0,
    };
  }

  const modelIdByGeneration = await loadGenerationToModelMap(
    votes.map((v) => v.generationAId).concat(votes.map((v) => v.generationBId)),
  );
  const modelIds = campaignModels.map((m) => m.id);
  const promptCategoryTags = new Map(
    prompts.map((p) => [p.id, p.categoryTags ?? []]),
  );

  // Bucket comparisons per category. Every vote → overall, and also into
  // each of its prompt's category tags.
  const compsByCat = new Map<string, BTComparison[]>();
  compsByCat.set(OVERALL, []);

  for (const v of votes) {
    const aModelId = modelIdByGeneration.get(v.generationAId);
    const bModelId = modelIdByGeneration.get(v.generationBId);
    if (!aModelId || !bModelId) continue; // defensive — data invariant

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
      // Ties — order doesn't matter since votesToComparisons emits both
      // directions at half weight.
      winnerModelId = aModelId;
      loserModelId = bModelId;
      outcome = v.winner; // 'tie' | 'both_bad'
    }

    const comps = votesToComparisons([
      { winnerModelId, loserModelId, outcome },
    ]);
    for (const c of comps) compsByCat.get(OVERALL)!.push(c);

    const tags = promptCategoryTags.get(v.promptId) ?? [];
    for (const tag of tags) {
      if (tag === OVERALL) continue; // reserved, skip defensively
      if (!compsByCat.has(tag)) compsByCat.set(tag, []);
      for (const c of comps) compsByCat.get(tag)!.push(c);
    }
  }

  // Run B-T once per category.
  const byCategory: Record<string, BTOutput> = {};
  for (const [cat, comps] of compsByCat.entries()) {
    byCategory[cat] = computeBradleyTerry(modelIds, comps);
  }

  // Wipe and insert fresh rating rows for this campaign. Using DELETE
  // + INSERT rather than UPSERT keeps the set of (category, model) rows
  // exactly aligned with the current categories — a retired category
  // stops appearing in the table.
  await db
    .delete(schema.ratings)
    .where(eq(schema.ratings.campaignId, campaignId));

  let rowsWritten = 0;
  const now = new Date();
  const inserts: schema.NewRating[] = [];
  for (const [cat, bt] of Object.entries(byCategory)) {
    for (const modelId of modelIds) {
      const rating = Math.round(bt.ratings[modelId]);
      const seNum = bt.seRatings[modelId];
      inserts.push({
        campaignId,
        campaignModelId: modelId,
        category: cat,
        rating,
        seRating: seNum != null ? seNum.toFixed(4) : null,
        ciLow: bt.ciLow[modelId] != null ? Math.round(bt.ciLow[modelId]!) : null,
        ciHigh:
          bt.ciHigh[modelId] != null ? Math.round(bt.ciHigh[modelId]!) : null,
        btStrength: bt.strengths[modelId].toFixed(8),
        gameCount: Math.round(bt.gameCount[modelId]),
        computedAt: now,
      });
      rowsWritten++;
    }
  }
  if (inserts.length > 0) {
    // Chunk to stay under Neon-HTTP's statement size budget for very
    // wide campaigns (many categories × many models). 500 rows is
    // comfortably safe.
    const CHUNK = 500;
    for (let i = 0; i < inserts.length; i += CHUNK) {
      await db.insert(schema.ratings).values(inserts.slice(i, i + CHUNK));
    }
  }

  return {
    campaignId,
    totalVotes: votes.length,
    byCategory,
    rowsWritten,
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
