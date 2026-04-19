/**
 * Client-side tournament progression for Participant Preview.
 *
 * Mirrors the server logic in src/server/tournament.ts — the pure
 * functions there are what we actually need (nextBattle + finalRanking),
 * but that module imports from the Drizzle schema. Rather than pull the
 * schema into the client bundle, we duplicate the ~50 lines of pure
 * logic here with plain string-literal types.
 *
 * Preview mode runs a full bracket without persisting anything: seed
 * selection, battle advancement, and final ranking all happen locally.
 * Keep this in sync with the server if the tournament rules change.
 */

export type BracketPosition = 'b1' | 'b2' | 'b3' | 'b4' | 'b5';
export type VoteWinner = 'A' | 'B' | 'tie' | 'both_bad';

export type BracketSeed = readonly [string, string, string, string];

export interface NextBattle {
  position: BracketPosition;
  generationAId: string;
  generationBId: string;
  label: string;
  reason: string;
}

export interface TournamentVote {
  bracketPosition: BracketPosition;
  generationAId: string;
  generationBId: string;
  winner: VoteWinner;
  advancedGenerationId: string | null;
}

/** Fisher-Yates, pick first 4. Same RNG semantics as the server. */
export function sampleSeed(allIds: readonly string[]): BracketSeed {
  if (allIds.length < 4) {
    throw new Error(
      `preview needs >= 4 models for a tournament; got ${allIds.length}`,
    );
  }
  if (allIds.length === 4) {
    return [...allIds] as unknown as BracketSeed;
  }
  const a = [...allIds];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return [a[0], a[1], a[2], a[3]];
}

export function coinFlip<T>(a: T, b: T): T {
  return Math.random() < 0.5 ? a : b;
}

export function nextBattle(
  seed: BracketSeed,
  generationByModel: Record<string, string>,
  votes: readonly TournamentVote[],
): NextBattle | null {
  const byPos: Partial<Record<BracketPosition, TournamentVote>> = {};
  for (const v of votes) byPos[v.bracketPosition] = v;

  const genFor = (modelId: string): string => {
    const g = generationByModel[modelId];
    if (!g) throw new Error(`no generation for model ${modelId}`);
    return g;
  };

  if (!byPos.b1) {
    return {
      position: 'b1',
      generationAId: genFor(seed[0]),
      generationBId: genFor(seed[1]),
      label: 'Battle 1 of 5',
      reason: 'Opening match · seed 1 vs seed 2',
    };
  }
  if (!byPos.b2) {
    return {
      position: 'b2',
      generationAId: genFor(seed[2]),
      generationBId: genFor(seed[3]),
      label: 'Battle 2 of 5',
      reason: 'Opening match · seed 3 vs seed 4',
    };
  }

  const b1Adv = byPos.b1.advancedGenerationId;
  const b2Adv = byPos.b2.advancedGenerationId;
  if (!b1Adv || !b2Adv) {
    throw new Error(
      'b1/b2 votes exist but advancedGenerationId is missing',
    );
  }
  const loserOf = (v: TournamentVote, advancer: string): string =>
    advancer === v.generationAId ? v.generationBId : v.generationAId;
  const b1Loser = loserOf(byPos.b1, b1Adv);
  const b2Loser = loserOf(byPos.b2, b2Adv);

  if (!byPos.b3) {
    return {
      position: 'b3',
      generationAId: b1Adv,
      generationBId: b2Adv,
      label: 'Battle 3 of 5',
      reason: 'Winners\u2019 final · decides 1st and 2nd',
    };
  }
  if (!byPos.b4) {
    return {
      position: 'b4',
      generationAId: b1Loser,
      generationBId: b2Loser,
      label: 'Battle 4 of 5',
      reason: 'Losers\u2019 bracket · decides 3rd and 4th',
    };
  }
  const b3Inconclusive =
    byPos.b3.winner === 'tie' || byPos.b3.winner === 'both_bad';
  if (b3Inconclusive && !byPos.b5) {
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
 * Compute the advancer for a b1/b2 vote. For decisive outcomes the
 * winner's generation advances; for tie/both_bad the server does a
 * coin flip so downstream matches can still resolve.
 */
export function advancerFor(
  vote: {
    generationAId: string;
    generationBId: string;
    winner: VoteWinner;
  },
): string {
  switch (vote.winner) {
    case 'A':
      return vote.generationAId;
    case 'B':
      return vote.generationBId;
    default:
      return coinFlip(vote.generationAId, vote.generationBId);
  }
}

export function finalRanking(
  votes: readonly TournamentVote[],
): Array<{ rank: number; generationIds: string[] }> {
  const byPos: Partial<Record<BracketPosition, TournamentVote>> = {};
  for (const v of votes) byPos[v.bracketPosition] = v;

  const b3 = byPos.b3;
  const b4 = byPos.b4;
  const b5 = byPos.b5;
  if (!b3 || !b4) return [];

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
    const winnerId =
      b5.winner === 'A' ? b5.generationAId : b5.generationBId;
    const loserId =
      b5.winner === 'A' ? b5.generationBId : b5.generationAId;
    topRanked = [
      { rank: 1, generationIds: [winnerId] },
      { rank: 2, generationIds: [loserId] },
    ];
  } else {
    topRanked = [{ rank: 1, generationIds: [topPair[0], topPair[1]] }];
  }

  const botPair = [b4.generationAId, b4.generationBId] as const;
  let botRanked: Array<{ rank: number; generationIds: string[] }>;
  if (b4.winner === 'A') {
    botRanked = [
      { rank: 3, generationIds: [botPair[0]] },
      { rank: 4, generationIds: [botPair[1]] },
    ];
  } else if (b4.winner === 'B') {
    botRanked = [
      { rank: 3, generationIds: [botPair[1]] },
      { rank: 4, generationIds: [botPair[0]] },
    ];
  } else {
    botRanked = [{ rank: 3, generationIds: [botPair[0], botPair[1]] }];
  }

  return [...topRanked, ...botRanked];
}
