import { cn } from '@/lib/utils';

/**
 * Horizontal range bar with a point marker — the leaderboard's signature
 * element. All three inputs are percentages of the visible range so the
 * caller controls normalization (typically min/max across currently-rendered
 * rows).
 *
 * `muted` drops the point to fg-muted for directional (low-confidence) rows.
 */
export function CiBar({
  lo,
  hi,
  pt,
  muted = false,
  title,
}: {
  lo: number;
  hi: number;
  pt: number;
  muted?: boolean;
  title?: string;
}) {
  return (
    <div
      className="relative h-1.5 min-w-[80px] flex-1 rounded-full bg-surface-highlight"
      title={title}
    >
      <div
        className="absolute inset-y-0 rounded-full bg-foreground/25"
        style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 0.5)}%` }}
      />
      <div
        className={cn(
          'absolute -top-[2px] h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-card',
          muted ? 'bg-muted-foreground' : 'bg-foreground',
        )}
        style={{ left: `${pt}%` }}
      />
    </div>
  );
}
