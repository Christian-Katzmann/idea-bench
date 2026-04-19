import { STABILITY_THRESHOLDS } from '@/lib/stability';
import { StatusBadge } from '@/components/ui/status-badge';

/**
 * Footer row. Methodology note on the left; tier thresholds on the right.
 * Threshold copy pulls from the real `STABILITY_THRESHOLDS` constants so
 * the UI never drifts from what the server actually uses.
 */
export function LeaderboardLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 font-mono text-[11px] tabular-nums text-muted-foreground">
      <div>
        Bradley-Terry · logistic · 95% CI via Fisher information · recomputed
        after each finished participant
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5">
          <StatusBadge state="stable" />
          <span>≥ {STABILITY_THRESHOLDS.stable} votes</span>
        </span>
        <span className="flex items-center gap-1.5">
          <StatusBadge state="preliminary" />
          <span>
            {STABILITY_THRESHOLDS.preliminary}–
            {STABILITY_THRESHOLDS.stable - 1} votes
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <StatusBadge state="directional" />
          <span>&lt; {STABILITY_THRESHOLDS.preliminary} votes</span>
        </span>
      </div>
    </div>
  );
}
