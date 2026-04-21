/**
 * Panel assembly for simulated runs.
 *
 * Two jobs:
 *
 * 1. Validate the operator's requested judge model mix at launch time.
 *    A valid panel is:
 *      - made of ≥ 3 distinct model families (diversity)
 *      - where no single family's weight exceeds 40% (no domination)
 *      - where every providerModelId is in the fixed catalog AND has
 *        a declared family
 *    If the mix fails any of these, launch is rejected with an
 *    explainable error — the operator can either fix it or fall back to
 *    the default mix.
 *
 * 2. Build per-seat judge assignments. A run declares `voterCount` seats
 *    and a weighted `modelMix`. We distribute judge models across seats
 *    so the empirical distribution matches the weights within rounding.
 *    For persona panels, we also spread seats across `personaIds`
 *    roughly evenly (largest remainder, not random) so the resulting
 *    leaderboard has a stable per-persona sample size.
 *
 * Cross-family exclusion is NOT enforced at panel-assembly time — it's
 * enforced per-comparison in judge-calls.ts. Reasoning: for a campaign
 * with models from every major family, panel-level exclusion would
 * leave the pool empty, but per-comparison exclusion still produces
 * useful signal on the subset of comparisons where the judge's family
 * isn't involved.
 */
import {
  familyOf,
  isKnownModel,
  lookupModel,
  type ModelFamily,
} from '../../lib/models.js';
import type { SimulatedRunModelMix } from '../db/schema.js';

/** Max share any single family may have in a judge panel. */
export const MAX_FAMILY_WEIGHT = 0.4;
/** Min distinct families required in a judge panel. */
export const MIN_FAMILY_COUNT = 3;
/** Weights sum must be within this tolerance of 1.0. */
const WEIGHT_SUM_EPSILON = 1e-6;

export interface PanelValidationResult {
  ok: boolean;
  /** Human-readable explanation when `ok = false`. */
  error?: string;
}

/**
 * Validates a model mix. Returns `{ ok: true }` on success, otherwise
 * a specific error string the UI can surface directly.
 */
export function validateModelMix(
  modelMix: SimulatedRunModelMix[],
): PanelValidationResult {
  if (!Array.isArray(modelMix) || modelMix.length === 0) {
    return { ok: false, error: 'modelMix must be a non-empty array' };
  }

  const seenIds = new Set<string>();
  let totalWeight = 0;
  const familyWeights = new Map<ModelFamily, number>();

  for (const entry of modelMix) {
    if (!entry || typeof entry.providerModelId !== 'string') {
      return { ok: false, error: 'every modelMix entry needs a providerModelId' };
    }
    if (typeof entry.weight !== 'number' || entry.weight <= 0) {
      return {
        ok: false,
        error: `weight for ${entry.providerModelId} must be > 0`,
      };
    }
    if (seenIds.has(entry.providerModelId)) {
      return {
        ok: false,
        error: `duplicate providerModelId in mix: ${entry.providerModelId}`,
      };
    }
    seenIds.add(entry.providerModelId);

    if (!isKnownModel(entry.providerModelId)) {
      return {
        ok: false,
        error: `unknown providerModelId: ${entry.providerModelId}`,
      };
    }
    const family = familyOf(entry.providerModelId);
    if (!family) {
      return {
        ok: false,
        error: `no family declared for model ${entry.providerModelId} (update src/lib/models.ts)`,
      };
    }
    familyWeights.set(family, (familyWeights.get(family) ?? 0) + entry.weight);
    totalWeight += entry.weight;
  }

  if (Math.abs(totalWeight - 1) > WEIGHT_SUM_EPSILON) {
    return {
      ok: false,
      error: `weights must sum to 1.0 (got ${totalWeight.toFixed(4)})`,
    };
  }

  if (familyWeights.size < MIN_FAMILY_COUNT) {
    return {
      ok: false,
      error: `panel must include at least ${MIN_FAMILY_COUNT} distinct model families (got ${familyWeights.size})`,
    };
  }

  for (const [fam, weight] of familyWeights.entries()) {
    if (weight > MAX_FAMILY_WEIGHT + WEIGHT_SUM_EPSILON) {
      return {
        ok: false,
        error: `${fam} family is ${(weight * 100).toFixed(0)}% of the panel — cap is ${(
          MAX_FAMILY_WEIGHT * 100
        ).toFixed(0)}%`,
      };
    }
  }

  return { ok: true };
}

/**
 * Default generic-panel mix: cheap, fast judges from three families.
 * Weights are equal thirds — close enough to hit the 40% cap without
 * forcing the arithmetic to 0.4/0.4/0.2. Used as the autofill value
 * when the operator hasn't customized the mix yet.
 */
export function defaultGenericMix(): SimulatedRunModelMix[] {
  return [
    { providerModelId: 'anthropic/claude-haiku-4-5', weight: 1 / 3 },
    { providerModelId: 'openai/gpt-5-mini', weight: 1 / 3 },
    { providerModelId: 'google/gemini-2.5-flash', weight: 1 / 3 },
  ];
}

/**
 * Deterministic per-seat assignment. Given a mix of judges (and
 * optionally personas), returns an array of length `voterCount` where
 * the judgeModelIds follow the weighted distribution and, if personas
 * are provided, the personaIds are distributed roundly round-robin.
 *
 * Largest-remainder allocation, not random — two different launches of
 * the same configuration produce the same seat table. Tested directly
 * in panel-assembly.test.ts so any regression is visible.
 */
export function assignSeats(args: {
  voterCount: number;
  modelMix: SimulatedRunModelMix[];
  personaIds?: readonly string[] | null;
}): Array<{ seatIndex: number; judgeModelId: string; personaId: string | null }> {
  const { voterCount, modelMix, personaIds } = args;
  if (voterCount <= 0) return [];

  // Largest-remainder: compute target count per model, floor it, then
  // distribute the remaining seats to the models with the largest
  // fractional parts.
  const rawTargets = modelMix.map((m) => ({
    providerModelId: m.providerModelId,
    raw: m.weight * voterCount,
  }));
  const assigned = rawTargets.map((t) => ({
    providerModelId: t.providerModelId,
    count: Math.floor(t.raw),
    frac: t.raw - Math.floor(t.raw),
  }));
  let leftover = voterCount - assigned.reduce((s, x) => s + x.count, 0);
  // Sort by remainder desc; tie-break by provider id for determinism.
  const remainderOrder = [...assigned].sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    return a.providerModelId.localeCompare(b.providerModelId);
  });
  for (const entry of remainderOrder) {
    if (leftover <= 0) break;
    const target = assigned.find((x) => x.providerModelId === entry.providerModelId);
    if (target) {
      target.count += 1;
      leftover -= 1;
    }
  }

  // Flatten into per-seat judgeModelId.
  const judgeSequence: string[] = [];
  // Iterate models in the original mix order so seat distribution
  // reads naturally: anthropic seats first, then openai, then google, etc.
  for (const m of modelMix) {
    const a = assigned.find((x) => x.providerModelId === m.providerModelId);
    if (!a) continue;
    for (let i = 0; i < a.count; i++) judgeSequence.push(m.providerModelId);
  }
  // Invariant: judgeSequence.length === voterCount.
  while (judgeSequence.length < voterCount) judgeSequence.push(modelMix[0].providerModelId);

  // Persona round-robin. If no personas, every seat gets null.
  const personas = personaIds && personaIds.length > 0 ? personaIds : null;

  const seats = judgeSequence.map((judgeModelId, seatIndex) => ({
    seatIndex,
    judgeModelId,
    personaId: personas ? personas[seatIndex % personas.length] : null,
  }));
  return seats;
}

/**
 * Cross-family exclusion check — applied per-comparison at judge-call
 * time. Returns true if the judge may evaluate the given candidate
 * models (none share the judge's family), false if the judge must skip
 * this specific comparison.
 *
 * Unknown models (not in the catalog) get a `null` family — treated as
 * non-matching. That's a defensive default: an unknown family can't
 * trigger spurious self-preference, but the bias protection also
 * doesn't apply. Callers who care can warn.
 */
export function isJudgeAllowed(
  judgeModelId: string,
  candidateProviderModelIds: readonly string[],
): boolean {
  const judgeFamily = familyOf(judgeModelId);
  if (!judgeFamily) return true;
  for (const candidate of candidateProviderModelIds) {
    if (familyOf(candidate) === judgeFamily) return false;
  }
  return true;
}

/**
 * Convenience for the runner/UI: returns the human-readable model
 * display name for a providerModelId, falling back to the id string.
 */
export function displayNameFor(providerModelId: string): string {
  return lookupModel(providerModelId)?.displayName ?? providerModelId;
}
