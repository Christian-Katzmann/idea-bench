/**
 * Tournament progression logic.
 *
 * A tournament is one bracket of 4 models, played by one participant
 * on one prompt. Battles:
 *
 *   b1: seed[0] vs seed[1]
 *   b2: seed[2] vs seed[3]
 *   b3: advancer(b1) vs advancer(b2)  — decides #1 / #2
 *   b4: non-advancer(b1) vs non-advancer(b2) — decides #3 / #4
 *   b5: rematch of b3's pair, ONLY if b3 was tie/both_bad
 *
 * Each battle records a vote row with `bracket_position` in
 * {b1..b5}. For b1/b2, the `advanced_generation_id` is either the
 * winner's generation id (for decisive outcomes) or a coin-flip
 * result (for tie/both_bad). Downstream battles read that column to
 * know who advanced.
 */
import type { BracketPosition, Vote } from './db/schema.js';

/** The four models that make up a bracket, in seed order. */
export type BracketSeed = readonly [string, string, string, string];

export interface NextBattle {
  position: BracketPosition;
  generationAId: string;
  generationBId: string;
  /** Human-readable label for the UI — "Battle 1 of 5" etc. */
  label: string;
  /** Why this specific pair was chosen (for transparency in the UI). */
  reason: string;
}

/** Randomly pick 4 campaign_model ids. Used when campaign has >4 models. */
export function sampleSeed(
  allCampaignModelIds: readonly string[],
): BracketSeed {
  if (allCampaignModelIds.length < 4) {
    throw new Error(
      `campaign needs >= 4 models for a tournament; got ${allCampaignModelIds.length}`,
    );
  }
  if (allCampaignModelIds.length === 4) {
    return [...allCampaignModelIds] as unknown as BracketSeed;
  }
  // Fisher-Yates, pick first 4.
  const a = [...allCampaignModelIds];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return [a[0], a[1], a[2], a[3]];
}

/** Random choice for b1/b2 ties. Not deterministic by design. */
export function coinFlip<T>(a: T, b: T): T {
  return Math.random() < 0.5 ? a : b;
}

export interface TournamentVote {
  bracketPosition: BracketPosition;
  generationAId: string;
  generationBId: string;
  winner: Vote['winner'];
  advancedGenerationId: string | null;
}

/**
 * Given the bracket seed, the map from campaign_model_id → generation_id
 * for this prompt, and the votes cast so far (any order), returns the
 * next battle to play — or null if the tournament is complete.
 *
 * The seed is positional: seed[0..3] are the 4 campaign_model ids in
 * bracket order.
 */
export function nextBattle(
  seed: BracketSeed,
  /** campaign_model_id → generation_id (the model's output on THIS prompt) */
  generationByModel: Record<string, string>,
  /** Votes in this tournament so far. */
  votes: readonly TournamentVote[],
): NextBattle | null {
  for (const [id] of Object.entries(generationByModel)) {
    void id; // noop — just asserting the map is populated
  }
  const byPos: Partial<Record<BracketPosition, TournamentVote>> = {};
  for (const v of votes) byPos[v.bracketPosition] = v;

  const genFor = (modelId: string): string => {
    const g = generationByModel[modelId];
    if (!g) throw new Error(`no generation for model ${modelId}`);
    return g;
  };

  // --- b1 ---
  if (!byPos.b1) {
    return {
      position: 'b1',
      generationAId: genFor(seed[0]),
      generationBId: genFor(seed[1]),
      label: 'Battle 1 of 5',
      reason: 'Opening match · seed 1 vs seed 2',
    };
  }
  // --- b2 ---
  if (!byPos.b2) {
    return {
      position: 'b2',
      generationAId: genFor(seed[2]),
      generationBId: genFor(seed[3]),
      label: 'Battle 2 of 5',
      reason: 'Opening match · seed 3 vs seed 4',
    };
  }

  // Resolve advancers from b1/b2 — `advanced_generation_id` is
  // always populated on these rows (winner's gen for decisive
  // outcomes, coin-flip for ties).
  const b1Adv = byPos.b1.advancedGenerationId;
  const b2Adv = byPos.b2.advancedGenerationId;
  if (!b1Adv || !b2Adv) {
    throw new Error(
      'b1/b2 votes exist but advanced_generation_id is missing — data invariant violated',
    );
  }
  const loserOf = (v: TournamentVote, advancer: string): string => {
    return advancer === v.generationAId ? v.generationBId : v.generationAId;
  };
  const b1Loser = loserOf(byPos.b1, b1Adv);
  const b2Loser = loserOf(byPos.b2, b2Adv);

  // --- b3: winners' bracket ---
  if (!byPos.b3) {
    return {
      position: 'b3',
      generationAId: b1Adv,
      generationBId: b2Adv,
      label: 'Battle 3 of 5',
      reason: 'Winners\u2019 final · decides 1st and 2nd',
    };
  }
  // --- b4: losers' bracket ---
  if (!byPos.b4) {
    return {
      position: 'b4',
      generationAId: b1Loser,
      generationBId: b2Loser,
      label: 'Battle 4 of 5',
      reason: 'Losers\u2019 bracket · decides 3rd and 4th',
    };
  }
  // --- b5: tiebreaker for b3, only if needed ---
  const b3TiedForTop =
    byPos.b3.winner === 'tie' || byPos.b3.winner === 'both_bad';
  if (b3TiedForTop && !byPos.b5) {
    return {
      position: 'b5',
      generationAId: byPos.b3.generationAId,
      generationBId: byPos.b3.generationBId,
      label: 'Battle 5 of 5',
      reason: 'Tiebreaker · battle 3 was inconclusive',
    };
  }

  return null;
}

/**
 * Returns the 1..4 ranking of generation ids from a completed
 * tournament. Ties propagate as "joint rank" — two entries can share
 * a rank, and the next rank is skipped accordingly.
 *
 * Used by personal-results to show a per-prompt ranking.
 */
export function finalRanking(
  votes: readonly TournamentVote[],
): Array<{ rank: number; generationIds: string[] }> {
  const byPos: Partial<Record<BracketPosition, TournamentVote>> = {};
  for (const v of votes) byPos[v.bracketPosition] = v;

  const b3 = byPos.b3;
  const b4 = byPos.b4;
  const b5 = byPos.b5;
  if (!b3 || !b4) return []; // incomplete

  // Top-of-podium: b3 winner → #1, b3 loser → #2. Ties resolved by b5
  // if present; else joint 1st.
  const topPair = [b3.generationAId, b3.generationBId] as const;
  let topRanked: Array<{ rank: number; generationIds: string[] }>;
  if (b3.winner === 'A') {
    topRanked = [
      { rank: 1, generationIds: [topPair[0]] },
      { rank: 2, generationIds: [topPair[1]] },
    ];
  } else if (b3.winner === 'B') {
    topRanked = [
      { rank: 1, generationIds: [topPair[1]] },
      { rank: 2, generationIds: [topPair[0]] },
    ];
  } else if (b5 && (b5.winner === 'A' || b5.winner === 'B')) {
    // b5 is a rematch of b3's pair with the same A/B orientation.
    const winnerId =
      b5.winner === 'A' ? b5.generationAId : b5.generationBId;
    const loserId =
      b5.winner === 'A' ? b5.generationBId : b5.generationAId;
    topRanked = [
      { rank: 1, generationIds: [winnerId] },
      { rank: 2, generationIds: [loserId] },
    ];
  } else {
    // Still ambiguous — joint 1st.
    topRanked = [{ rank: 1, generationIds: [topPair[0], topPair[1]] }];
  }

  // Bottom-of-podium: b4 winner → #3, b4 loser → #4. Ties = joint 3rd.
  const botPair = [b4.generationAId, b4.generationBId] as const;
  let botRanked: Array<{ rank: number; generationIds: string[] }>;
  const botStart = topRanked.length === 1 ? 3 : 3; // always 3; top is 1 or 1+2
  if (b4.winner === 'A') {
    botRanked = [
      { rank: botStart, generationIds: [botPair[0]] },
      { rank: botStart + 1, generationIds: [botPair[1]] },
    ];
  } else if (b4.winner === 'B') {
    botRanked = [
      { rank: botStart, generationIds: [botPair[1]] },
      { rank: botStart + 1, generationIds: [botPair[0]] },
    ];
  } else {
    botRanked = [{ rank: botStart, generationIds: [botPair[0], botPair[1]] }];
  }

  return [...topRanked, ...botRanked];
}
