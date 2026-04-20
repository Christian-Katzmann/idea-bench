import type { CampaignMatchup, DashboardLeaderboardRow } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Pairwise win-rate matrix for the spotlight campaign. Models appear on
 * both axes; each cell shows the row-model's win share against the column-
 * model (ties counted as half-wins, matching how Bradley-Terry treats them).
 *
 * Why this exists alongside the leaderboard: BT ratings collapse hundreds of
 * pairwise outcomes into a single number per model. The matrix surfaces the
 * raw structure — useful when one model dominates one rival but loses to
 * another, which a flat ranking can hide.
 */
export function Matchups({
  rows,
  matchups,
}: {
  rows: DashboardLeaderboardRow[];
  matchups: CampaignMatchup[];
}) {
  // Build a lookup keyed by sorted-pair so we can resolve any (a,b) read.
  const lookup = new Map<string, CampaignMatchup>();
  for (const m of matchups) {
    lookup.set(`${m.aCampaignModelId}::${m.bCampaignModelId}`, m);
  }

  const totalMatchups = matchups.reduce(
    (sum, m) => sum + m.aWins + m.bWins + m.ties,
    0,
  );

  if (rows.length < 2 || totalMatchups === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-8">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          Not enough head-to-head data yet
        </h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Once at least two models have been compared, this matrix shows the
          pairwise win rate of each row against each column.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card p-4">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Row beats column →
            </th>
            {rows.map((col) => (
              <th
                key={col.campaignModelId}
                className="max-w-[120px] px-2 py-1.5 text-left text-xs font-medium text-muted-foreground"
                title={col.displayName}
              >
                <span className="block truncate">{col.displayName}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.campaignModelId}>
              <td
                className="px-2 py-1.5 text-left text-sm font-medium text-foreground"
                title={row.displayName}
              >
                <span className="block max-w-[160px] truncate">
                  {row.displayName}
                </span>
              </td>
              {rows.map((col) => (
                <MatchupCell
                  key={col.campaignModelId}
                  rowId={row.campaignModelId}
                  colId={col.campaignModelId}
                  lookup={lookup}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">
        Win share = (wins + ½·ties) ÷ matchups. Cells fade when sample size
        is small (&lt; 10).
      </p>
    </div>
  );
}

function MatchupCell({
  rowId,
  colId,
  lookup,
}: {
  rowId: string;
  colId: string;
  lookup: Map<string, CampaignMatchup>;
}) {
  if (rowId === colId) {
    return (
      <td className="rounded-md bg-muted/40 px-2 py-2 text-center text-xs text-muted-foreground/60">
        —
      </td>
    );
  }

  const [lo, hi] = rowId < colId ? [rowId, colId] : [colId, rowId];
  const m = lookup.get(`${lo}::${hi}`);
  if (!m || m.aWins + m.bWins + m.ties === 0) {
    return (
      <td className="rounded-md bg-muted/20 px-2 py-2 text-center text-xs text-muted-foreground/60">
        n/a
      </td>
    );
  }

  const total = m.aWins + m.bWins + m.ties;
  // From the row's perspective: if the row id is the lex-smaller (`lo`),
  // its raw wins are aWins; otherwise bWins.
  const rowIsLo = rowId === lo;
  const rowWins = rowIsLo ? m.aWins : m.bWins;
  const winShare = (rowWins + 0.5 * m.ties) / total;
  const lowSample = total < 10;

  // Tint by share: subtle background that reads at a glance without being
  // loud. Above 0.5 leans toward foreground accent; below leans neutral.
  const intensity = Math.abs(winShare - 0.5) * 2; // 0..1
  const bg =
    winShare >= 0.5
      ? `rgba(31,27,22,${(intensity * 0.18).toFixed(3)})`
      : `rgba(31,27,22,${(intensity * 0.06).toFixed(3)})`;

  return (
    <td
      className={cn(
        'rounded-md px-2 py-2 text-center align-middle',
        lowSample && 'opacity-60',
      )}
      style={{ backgroundColor: bg }}
      title={`${m.aWins + (rowIsLo ? 0 : m.bWins - m.aWins)} W · ${m.ties} T · ${total - rowWins - m.ties} L of ${total}`}
    >
      <div className="font-medium text-foreground tabular-nums">
        {(winShare * 100).toFixed(0)}%
      </div>
      <div className="text-[10px] text-muted-foreground tabular-nums">
        n={total}
      </div>
    </td>
  );
}
