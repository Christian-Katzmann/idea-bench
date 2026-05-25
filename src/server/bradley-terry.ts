/**
 * Bradley-Terry model — iterative MM solver with Fisher-information
 * standard errors.
 *
 * Model: for two items i, j with strengths p_i, p_j > 0, the probability
 * i beats j is p_i / (p_i + p_j).
 *
 * MM update (Hunter 2004):
 *   p_i ← W_i / Σ_{j≠i} N_ij / (p_i + p_j)
 * where W_i = weighted win count for i (ties count 0.5) and N_ij = total
 * comparisons between i and j.
 *
 * Normalize each iteration to sum-log-p = 0 (equivalent to geometric-
 * mean = 1) so values don't drift. Converge when max relative delta
 * < CONVERGENCE_TOL. Safety cap at MAX_ITERATIONS.
 *
 * Display scale: rating = 1000 + 400·log10(p). Because we normalize so
 * the geometric mean of p is 1, mean rating is 1000.
 *
 * Standard errors: observed Fisher information on the log-strength scale.
 *   I_ii =  Σ_{j≠i} N_ij · p_i·p_j / (p_i+p_j)²
 *   I_ij = -N_ij · p_i·p_j / (p_i+p_j)²
 * The matrix is singular (scale-invariance; the null space is the
 * all-ones vector). We take the Moore-Penrose pseudoinverse by adding a
 * rank-1 term (1/M)·1·1^T before inverting — this projects out the null
 * space, equivalent to enforcing Σλ = 0 which is already our
 * normalization.
 *
 * SE on rating scale = (400/ln(10)) · SE on log-strength scale.
 *
 * Confidence interval (95%): rating ± 1.96·SE.
 */

export const CONVERGENCE_TOL = 1e-4;
export const MAX_ITERATIONS = 200;

export interface BTComparison {
  /** The model id credited with a win. For ties we emit two half-weight rows. */
  winner: string;
  loser: string;
  /** 1 for a decisive outcome; 0.5 for each direction of a tie/both_bad. */
  weight: number;
}

export interface BTOutput {
  modelIds: string[];
  converged: boolean;
  iterations: number;
  /** Raw B-T strengths (geometric mean normalized to 1). */
  strengths: Record<string, number>;
  /** 1000 + 400·log10(strength). Center is 1000. */
  ratings: Record<string, number>;
  /** SE on the rating scale. Null if the model has no games. */
  seRatings: Record<string, number | null>;
  ciLow: Record<string, number | null>;
  ciHigh: Record<string, number | null>;
  /** Comparisons involving the model (weighted, so ties count toward both). */
  gameCount: Record<string, number>;
  /** Decisive + half-tie wins. */
  winCount: Record<string, number>;
  /** For display: (wins + 0.5·ties) / games, in [0,1]. Null if games = 0. */
  winRate: Record<string, number | null>;
}

/**
 * Compute B-T ratings + SEs from a list of pairwise comparisons.
 *
 * Models that never appear in any comparison are still returned, with
 * rating = 1000, SE = null, ciLow/High = null, gameCount = 0.
 */
export function computeBradleyTerry(
  modelIds: readonly string[],
  comparisons: readonly BTComparison[],
): BTOutput {
  const M = modelIds.length;
  const indexOf = new Map(modelIds.map((id, i) => [id, i]));

  // Aggregate W (wins) and N (pairwise totals).
  const W: number[] = new Array(M).fill(0);
  const N: number[][] = Array.from({ length: M }, () => new Array(M).fill(0));
  for (const c of comparisons) {
    const i = indexOf.get(c.winner);
    const j = indexOf.get(c.loser);
    if (i === undefined || j === undefined || i === j) continue;
    W[i] += c.weight;
    N[i][j] += c.weight;
    N[j][i] += c.weight;
  }
  const hasGames = N.map((row) => row.some((count) => count > 0));
  const activeModelCount = hasGames.filter(Boolean).length;

  // Initialize strengths to 1. Models with zero games stay at 1 forever.
  const p: number[] = new Array(M).fill(1);
  let converged = false;
  let iters = 0;

  for (iters = 0; iters < MAX_ITERATIONS; iters++) {
    const pNew: number[] = new Array(M).fill(1);
    for (let i = 0; i < M; i++) {
      let denom = 0;
      for (let j = 0; j < M; j++) {
        if (j === i) continue;
        const nij = N[i][j];
        if (nij === 0) continue;
        denom += nij / (p[i] + p[j]);
      }
      if (denom === 0 || W[i] === 0) {
        // No decisive comparisons involving i, or i has never won.
        // Leave it near the geometric mean so the log is finite.
        pNew[i] = Math.max(p[i], 1e-6);
      } else {
        pNew[i] = W[i] / denom;
      }
    }

    // Normalize only models that actually appear in the comparison graph.
    // Zero-game models stay neutral at strength=1 / rating=1000.
    if (activeModelCount > 0) {
      let sumLog = 0;
      for (let i = 0; i < M; i++) {
        if (hasGames[i]) sumLog += Math.log(pNew[i]);
      }
      const shift = sumLog / activeModelCount;
      for (let i = 0; i < M; i++) {
        pNew[i] = hasGames[i] ? Math.exp(Math.log(pNew[i]) - shift) : 1;
      }
    }

    // Convergence on max relative delta.
    let maxDelta = 0;
    for (let i = 0; i < M; i++) {
      const d = Math.abs(pNew[i] - p[i]) / Math.max(p[i], 1e-9);
      if (d > maxDelta) maxDelta = d;
    }
    for (let i = 0; i < M; i++) p[i] = pNew[i];
    if (maxDelta < CONVERGENCE_TOL) {
      converged = true;
      iters++;
      break;
    }
  }

  // Observed Fisher information on log-strength scale.
  // I_ii =  Σ N_ij p_i p_j / (p_i+p_j)²
  // I_ij = -N_ij p_i p_j / (p_i+p_j)²
  const F: number[][] = Array.from({ length: M }, () =>
    new Array(M).fill(0),
  );
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      if (j === i) continue;
      const nij = N[i][j];
      if (nij === 0) continue;
      const denom = (p[i] + p[j]) ** 2;
      const term = (nij * p[i] * p[j]) / denom;
      F[i][i] += term;
      F[i][j] -= term;
    }
  }

  // Pseudo-inverse via (F + (1/M)·J)^-1, where J = 1·1^T. This injects
  // a rank-1 term in the null-space direction so the inversion is
  // well-posed; the result is the MP pseudoinverse on the sum-log-zero
  // constraint surface we already use for normalization.
  const regularized: number[][] = Array.from({ length: M }, (_, i) =>
    Array.from({ length: M }, (_, j) => F[i][j] + 1 / M),
  );
  const Finv = invertSquareMatrix(regularized);

  const strengths: Record<string, number> = {};
  const ratings: Record<string, number> = {};
  const seRatings: Record<string, number | null> = {};
  const ciLow: Record<string, number | null> = {};
  const ciHigh: Record<string, number | null> = {};
  const gameCount: Record<string, number> = {};
  const winCount: Record<string, number> = {};
  const winRate: Record<string, number | null> = {};

  const RATING_SCALE = 400 / Math.LN10; // ≈ 173.7178

  for (let i = 0; i < M; i++) {
    const id = modelIds[i];
    strengths[id] = p[i];
    ratings[id] = 1000 + 400 * Math.log10(p[i]);

    const games = N[i].reduce((a, b) => a + b, 0);
    gameCount[id] = games;
    winCount[id] = W[i];
    winRate[id] = games > 0 ? W[i] / games : null;

    if (!Finv || games === 0) {
      seRatings[id] = null;
      ciLow[id] = null;
      ciHigh[id] = null;
      continue;
    }
    const diag = Finv[i][i];
    if (!Number.isFinite(diag) || diag <= 0) {
      seRatings[id] = null;
      ciLow[id] = null;
      ciHigh[id] = null;
      continue;
    }
    const seLogP = Math.sqrt(diag);
    const se = RATING_SCALE * seLogP;
    seRatings[id] = se;
    ciLow[id] = ratings[id] - 1.96 * se;
    ciHigh[id] = ratings[id] + 1.96 * se;
  }

  return {
    modelIds: [...modelIds],
    converged,
    iterations: iters,
    strengths,
    ratings,
    seRatings,
    ciLow,
    ciHigh,
    gameCount,
    winCount,
    winRate,
  };
}

/**
 * Gauss-Jordan inversion of a square matrix. Returns null if singular.
 * Mutates a local copy; inputs untouched. O(n³) — fine for M ≤ ~50.
 */
export function invertSquareMatrix(m: readonly number[][]): number[][] | null {
  const n = m.length;
  const aug: number[][] = Array.from({ length: n }, (_, i) => [
    ...m[i],
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let i = 0; i < n; i++) {
    // Partial pivot for numerical stability.
    let pivotRow = i;
    let pivotMag = Math.abs(aug[i][i]);
    for (let r = i + 1; r < n; r++) {
      const mag = Math.abs(aug[r][i]);
      if (mag > pivotMag) {
        pivotMag = mag;
        pivotRow = r;
      }
    }
    if (pivotMag < 1e-12) return null;
    if (pivotRow !== i) {
      const tmp = aug[i];
      aug[i] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }
    const pivot = aug[i][i];
    for (let c = 0; c < 2 * n; c++) aug[i][c] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = aug[r][i];
      if (factor === 0) continue;
      for (let c = 0; c < 2 * n; c++) aug[r][c] -= factor * aug[i][c];
    }
  }

  return aug.map((row) => row.slice(n));
}

/**
 * Turn a list of votes (with winner + optional tie/both_bad) into the
 * pair-wise comparison list B-T consumes. Tie and both_bad both become
 * symmetric half-weight wins in each direction.
 */
export function votesToComparisons(
  votes: ReadonlyArray<{
    winnerModelId: string;
    loserModelId: string;
    outcome: 'decisive' | 'tie' | 'both_bad';
  }>,
): BTComparison[] {
  const out: BTComparison[] = [];
  for (const v of votes) {
    if (v.winnerModelId === v.loserModelId) continue;
    if (v.outcome === 'decisive') {
      out.push({ winner: v.winnerModelId, loser: v.loserModelId, weight: 1 });
    } else {
      out.push({ winner: v.winnerModelId, loser: v.loserModelId, weight: 0.5 });
      out.push({ winner: v.loserModelId, loser: v.winnerModelId, weight: 0.5 });
    }
  }
  return out;
}
