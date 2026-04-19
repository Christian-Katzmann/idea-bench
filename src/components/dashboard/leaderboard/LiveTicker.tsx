import { useEffect, useState } from 'react';
import { formatDistanceToNow } from '@/lib/relative-time';
import { cn } from '@/lib/utils';

/**
 * Right-aligned dot + running count for the leaderboard header.
 *
 * The pulsing dot is a standing UI affordance — it animates whether or not
 * there's actually fresh data. The `updatedAt` timestamp drives the relative
 * phrase: "just now" if < 60s, minutes thereafter. If there's no update
 * timestamp (nothing computed yet), we dim the text instead of lying about
 * freshness.
 */
export function LiveTicker({
  totalVotes,
  updatedAt,
}: {
  totalVotes: number;
  updatedAt: string | null;
}) {
  // Force a re-render every 30s so the relative phrase stays current without
  // requiring a parent-level re-query. Cheap — one state update per tick.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const updated = updatedAt ? new Date(updatedAt) : null;
  const relative = updated
    ? formatDistanceToNow(updated, { addSuffix: true })
    : 'awaiting votes';
  const isStale =
    updated !== null && Date.now() - updated.getTime() > 5 * 60 * 1000;

  return (
    <div
      className={cn(
        'flex items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground',
        isStale && 'opacity-60',
      )}
    >
      <span className="size-1.5 animate-pulse rounded-full bg-accent" />
      <span>
        {totalVotes.toLocaleString()} votes · {relative}
      </span>
    </div>
  );
}
