import { useNavigate } from 'react-router-dom';
import type { DashboardLeaderboardCampaign } from '@/lib/api';
import { LeaderboardRow } from './LeaderboardRow';

/**
 * Headered, bordered shell that renders one campaign's ratings.
 *
 * CI bar scaling is normalized across the currently-visible rows: we take
 * `min(rating - ci)` and `max(rating + ci)` across the set so wider CIs
 * push narrower ones to the right proportions, rather than each row being
 * scaled in isolation. Recompute on every render — cheap (≤ N models).
 *
 * If a row has no CI bounds yet we fall back to the rating itself on both
 * sides so the point still renders at the correct position without the
 * range bar.
 */
export function LeaderboardTable({
  campaign,
  updatedRowIds,
}: {
  campaign: DashboardLeaderboardCampaign;
  updatedRowIds: Set<string>;
}) {
  const navigate = useNavigate();
  const rows = campaign.ratings;

  let minR = Infinity;
  let maxR = -Infinity;
  for (const row of rows) {
    const lo = row.ciLow ?? row.rating;
    const hi = row.ciHigh ?? row.rating;
    if (lo < minR) minR = lo;
    if (hi > maxR) maxR = hi;
  }
  // Guard for one-row tables / identical ratings.
  const span = Number.isFinite(minR) && Number.isFinite(maxR) && maxR - minR > 0
    ? maxR - minR
    : 1;
  const origin = Number.isFinite(minR) ? minR : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="hidden grid-cols-[40px_minmax(0,1fr)_96px_minmax(200px,1.3fr)_56px_72px_104px] items-center gap-4 border-b border-border bg-surface-highlight px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
        <div>#</div>
        <div>Model</div>
        <div className="text-right">Rating</div>
        <div>95% CI</div>
        <div className="text-right">Votes</div>
        <div className="text-right">Win rate</div>
        <div className="text-right">Stability</div>
      </div>

      {rows.map((row, i) => {
        const lo = ((row.ciLow ?? row.rating) - origin) / span;
        const hi = ((row.ciHigh ?? row.rating) - origin) / span;
        const pt = (row.rating - origin) / span;
        return (
          <LeaderboardRow
            key={row.campaignModelId}
            row={row}
            rank={i + 1}
            lo={lo * 100}
            hi={hi * 100}
            pt={pt * 100}
            isUpdated={updatedRowIds.has(row.campaignModelId)}
            onClick={() =>
              navigate(
                `/campaign/${campaign.id}?model=${encodeURIComponent(row.campaignModelId)}`,
              )
            }
          />
        );
      })}
    </div>
  );
}
