import { formatDistanceToNow } from '@/lib/relative-time';
import type {
  CampaignPulseBucket,
  CampaignRecentVote,
  DashboardLeaderboardRow,
} from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Vitality view for the spotlight campaign. Two stacked sub-panels:
 *   1. Sparkline-style bar chart — vote count per hour over the last 24h.
 *      Answers "is this thing alive?" at a glance.
 *   2. Recent votes feed — last 5 individual outcomes rendered as
 *      "A beat B · 2m ago". Answers "what just happened?"
 *
 * The sparkline uses CSS height, not a chart lib — keeps dependencies lean
 * and the bars sized to whatever the container allows.
 */
export function Pulse({
  buckets,
  recentVotes,
  modelLabelById,
}: {
  buckets: CampaignPulseBucket[];
  recentVotes: CampaignRecentVote[];
  modelLabelById: Map<string, DashboardLeaderboardRow>;
}) {
  const totalLast24h = buckets.reduce((n, b) => n + b.votes, 0);
  const peak = buckets.reduce((m, b) => Math.max(m, b.votes), 0);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Votes · last 24h
          </h3>
          <div className="tabular-nums text-xs text-muted-foreground">
            <span className="text-sm font-medium text-foreground">
              {totalLast24h}
            </span>
            {peak > 0 && <span className="ml-2">peak {peak}/hr</span>}
          </div>
        </div>
        {totalLast24h === 0 ? (
          <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border/70 text-xs text-muted-foreground">
            No votes in the last 24 hours.
          </div>
        ) : (
          <Sparkline buckets={buckets} peak={peak} />
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Recent votes
        </h3>
        {recentVotes.length === 0 ? (
          <div className="py-4 text-xs text-muted-foreground">
            Nothing yet. Votes appear here as they arrive.
          </div>
        ) : (
          <ul className="divide-y divide-border/80">
            {recentVotes.map((vote, i) => (
              <RecentVoteRow
                key={`${vote.at}-${i}`}
                vote={vote}
                modelLabelById={modelLabelById}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Sparkline({
  buckets,
  peak,
}: {
  buckets: CampaignPulseBucket[];
  peak: number;
}) {
  return (
    <div
      role="img"
      aria-label={`Vote volume per hour for the last 24 hours, peak ${peak}`}
      className="flex h-20 items-end gap-0.5"
    >
      {buckets.map((b) => {
        const ratio = peak > 0 ? b.votes / peak : 0;
        const hour = new Date(b.hour).getUTCHours();
        return (
          <div
            key={b.hour}
            className="group relative flex-1"
            title={`${formatHourLabel(b.hour)}: ${b.votes} ${b.votes === 1 ? 'vote' : 'votes'}`}
          >
            <div
              className={cn(
                'w-full rounded-sm bg-foreground/80 transition-colors',
                b.votes === 0 && 'bg-muted/70',
              )}
              style={{
                height: `${Math.max(ratio * 100, b.votes > 0 ? 6 : 2)}%`,
              }}
            />
            {/* Tick label every 6 hours — avoids crowding on narrow widths */}
            {hour % 6 === 0 && (
              <div className="absolute -bottom-4 left-0 text-[9px] tabular-nums text-muted-foreground">
                {hour.toString().padStart(2, '0')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RecentVoteRow({
  vote,
  modelLabelById,
}: {
  vote: CampaignRecentVote;
  modelLabelById: Map<string, DashboardLeaderboardRow>;
}) {
  const a = modelLabelById.get(vote.aCampaignModelId)?.displayName ?? 'Model A';
  const b = modelLabelById.get(vote.bCampaignModelId)?.displayName ?? 'Model B';
  const at = new Date(vote.at);

  let body: React.ReactNode;
  if (vote.isTie) {
    body = (
      <>
        <span className="font-medium text-foreground">{a}</span>
        <span className="mx-1.5 text-muted-foreground">tied with</span>
        <span className="font-medium text-foreground">{b}</span>
      </>
    );
  } else {
    const winner = vote.winnerCampaignModelId;
    const winnerName =
      (winner && modelLabelById.get(winner)?.displayName) ??
      (winner === vote.aCampaignModelId ? a : b);
    const loserName = winner === vote.aCampaignModelId ? b : a;
    body = (
      <>
        <span className="font-medium text-foreground">{winnerName}</span>
        <span className="mx-1.5 text-muted-foreground">beat</span>
        <span className="text-muted-foreground">{loserName}</span>
      </>
    );
  }

  return (
    <li className="flex items-center justify-between py-1.5 text-sm">
      <span className="min-w-0 truncate">{body}</span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatDistanceToNow(at, { addSuffix: true })}
      </span>
    </li>
  );
}

function formatHourLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
