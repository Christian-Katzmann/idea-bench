import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading state for the whole leaderboard block: header row + 8 table rows.
 * Grid columns match the live component so the skeleton snaps cleanly when
 * real data arrives.
 */
export function LeaderboardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          <Skeleton className="h-7 w-28 rounded-lg" />
          <Skeleton className="h-7 w-24 rounded-lg" />
          <Skeleton className="h-7 w-28 rounded-lg" />
        </div>
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-[40px_1.7fr_0.9fr_1.6fr_0.9fr_0.9fr_0.9fr] items-center gap-3 border-b border-border bg-surface-highlight px-4 py-2.5">
          <Skeleton className="h-2 w-4" />
          <Skeleton className="h-2 w-16" />
          <Skeleton className="h-2 w-12" />
          <Skeleton className="h-2 w-16" />
          <Skeleton className="h-2 w-12" />
          <Skeleton className="h-2 w-14" />
          <Skeleton className="h-2 w-16" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[40px_1.7fr_0.9fr_1.6fr_0.9fr_0.9fr_0.9fr] items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0"
          >
            <Skeleton className="h-3 w-5" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
