import { ChevronRight } from 'lucide-react';
import { EntityIcon } from '@/components/ui/entity-icon';
import { StatusBadge } from '@/components/ui/status-badge';
import type { DashboardLeaderboardRow } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CiBar } from './CiBar';

/**
 * One rendered rank in the leaderboard.
 *
 * Progressive disclosure: below the `sm` breakpoint we collapse the Votes and
 * Win rate columns into a stacked line under the model name and flatten the
 * grid so the CI bar keeps its full width. The grid template is synced to
 * `LeaderboardTable` — change both together if you alter column widths.
 */
export function LeaderboardRow({
  row,
  rank,
  lo,
  hi,
  pt,
  onClick,
  isUpdated,
}: {
  row: DashboardLeaderboardRow;
  rank: number;
  lo: number;
  hi: number;
  pt: number;
  onClick: () => void;
  isUpdated: boolean;
}) {
  const isDirectional = row.stability === 'directional';
  const winRateLabel =
    row.winRate != null ? `${(row.winRate * 100).toFixed(1)}%` : '—';
  const votesLabel = row.gameCount.toLocaleString();
  const ciLabel =
    row.ciLow != null && row.ciHigh != null
      ? `${row.rating} (95% CI ${row.ciLow}–${row.ciHigh})`
      : `${row.rating}`;
  const ciHalfWidth =
    row.ciLow != null && row.ciHigh != null
      ? Math.round((row.ciHigh - row.ciLow) / 2)
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group grid grid-cols-[40px_1fr_auto] items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-surface-highlight/60 sm:grid-cols-[40px_1.7fr_0.9fr_1.6fr_0.9fr_0.9fr_0.9fr]',
        isDirectional && 'opacity-70',
        isUpdated && 'lb-just-updated',
      )}
    >
      <div className="font-mono text-[13px] tabular-nums text-muted-foreground">
        {String(rank).padStart(2, '0')}
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        <EntityIcon name={row.displayName} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {row.displayName}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground sm:hidden">
            {votesLabel} votes · {winRateLabel}
          </div>
          <div className="hidden truncate font-mono text-[11px] text-muted-foreground sm:block">
            {row.providerModelId}
          </div>
        </div>
      </div>

      <div className="hidden font-mono text-sm tabular-nums sm:block">
        {row.rating}
        {ciHalfWidth != null && (
          <span className="ml-1 text-[11px] text-muted-foreground">
            ±{ciHalfWidth}
          </span>
        )}
      </div>

      <div
        className="col-span-3 flex items-center gap-2 pt-1 sm:col-span-1 sm:pt-0"
        title={ciLabel}
      >
        <CiBar lo={lo} hi={hi} pt={pt} muted={isDirectional} title={ciLabel} />
      </div>

      <div className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:block">
        {votesLabel}
      </div>

      <div className="hidden font-mono text-sm tabular-nums sm:block">
        {winRateLabel}
      </div>

      <div className="hidden items-center gap-1.5 sm:flex">
        <StatusBadge state={row.stability} />
        <ChevronRight className="size-3.5 text-muted-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
      </div>
    </button>
  );
}
