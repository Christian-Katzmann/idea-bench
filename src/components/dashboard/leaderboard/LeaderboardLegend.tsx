import { STABILITY_THRESHOLDS } from '@/lib/stability';

/**
 * Footer row. Methodology note on the left; tier thresholds on the right.
 * Threshold copy pulls from the real `STABILITY_THRESHOLDS` constants so the
 * UI never drifts from what the server actually uses.
 *
 * Stability semantics are already visible on every row via the chip column —
 * the legend is a density-neutral reference, so we spell thresholds out as
 * plain mono text rather than re-showing the chips here.
 */
export function LeaderboardLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
      <div>
        Bradley-Terry · logistic · 95% CI via Fisher information · recomputed
        after each finished participant
      </div>
      <div>
        Stable ≥ {STABILITY_THRESHOLDS.stable} · Preliminary{' '}
        {STABILITY_THRESHOLDS.preliminary}–{STABILITY_THRESHOLDS.stable - 1} ·
        Directional &lt; {STABILITY_THRESHOLDS.preliminary} votes
      </div>
    </div>
  );
}
