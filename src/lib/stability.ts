/**
 * Sample-size thresholds for how we present rating confidence in the UI.
 *
 * "Game count" means the number of pairwise comparisons involving the
 * model (ties contribute to both sides). The spec (see PR #4 thread):
 *   <50         directional — gray out; CI is wide; do not trust
 *   50..200     preliminary — show with a "preliminary" tag
 *   ≥200        stable      — show normally
 */

export const STABILITY_THRESHOLDS = {
  preliminary: 50,
  stable: 200,
} as const;

export type Stability = 'directional' | 'preliminary' | 'stable';

export function stabilityFor(gameCount: number): Stability {
  if (gameCount < STABILITY_THRESHOLDS.preliminary) return 'directional';
  if (gameCount < STABILITY_THRESHOLDS.stable) return 'preliminary';
  return 'stable';
}

export const STABILITY_LABELS: Record<Stability, string> = {
  directional: 'Directional',
  preliminary: 'Preliminary',
  stable: 'Stable',
};

/** How many more votes until the next tier kicks in, or null at stable. */
export function votesToNextTier(gameCount: number): number | null {
  if (gameCount < STABILITY_THRESHOLDS.preliminary)
    return STABILITY_THRESHOLDS.preliminary - gameCount;
  if (gameCount < STABILITY_THRESHOLDS.stable)
    return STABILITY_THRESHOLDS.stable - gameCount;
  return null;
}
