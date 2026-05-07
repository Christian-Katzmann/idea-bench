import { ModelLogo } from '@/components/ui/model-logo';
import { StatusBadge } from '@/components/ui/status-badge';
import type { DashboardLeaderboardRow } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CiBar } from './CiBar';

/**
 * One rendered rank in the leaderboard.
 *
 * Grid template is synced to `LeaderboardTable` — change both together if
 * column widths move. Numeric cells (Rating, Votes, Win rate, Stability) are
 * right-aligned so digits line up vertically across rows despite variable
 * widths (1030 vs 986, 55.9% vs 41.0%, STABLE vs PRELIMINARY).
 *
 * Below the `sm` breakpoint, Votes/Win rate collapse into a stacked line
 * under the model name and the CI bar takes the full content width on its
 * own row.
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
        'group grid grid-cols-[40px_1fr_auto] items-center gap-4 border-b border-border/60 px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-surface-highlight/40',
        // Inherit the parent table's column tracks on desktop so numerics
        // align vertically across rows. See LeaderboardTable.
        'sm:col-span-full sm:grid-cols-subgrid',
        isDirectional && 'opacity-70',
        isUpdated && 'lb-just-updated',
      )}
    >
      <div className="font-mono text-[13px] tabular-nums text-muted-foreground">
        {String(rank).padStart(2, '0')}
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        <ModelLogo
          providerModelId={row.providerModelId}
          name={row.displayName}
          size="sm"
        />
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

      <div className="hidden text-right font-mono tabular-nums sm:block">
        <span className="text-sm text-foreground">{row.rating}</span>
        {ciHalfWidth != null && (
          <span className="ml-1 text-[11px] text-muted-foreground">
            ±{ciHalfWidth}
          </span>
        )}
      </div>

      <div
        className="col-span-3 flex items-center pt-1 sm:col-span-1 sm:pt-0"
        title={ciLabel}
      >
        <CiBar lo={lo} hi={hi} pt={pt} muted={isDirectional} title={ciLabel} />
      </div>

      <div className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
        {votesLabel}
      </div>

      <div className="hidden text-right font-mono text-[13px] tabular-nums text-foreground sm:block">
        {winRateLabel}
      </div>

      <div className="hidden justify-self-end sm:block">
        <StatusBadge state={row.stability} />
      </div>
    </button>
  );
}
