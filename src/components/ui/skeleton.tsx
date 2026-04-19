import { cn } from '@/lib/utils';

/**
 * Skeleton placeholder block.
 *
 * Subtle pulse animation on surface-highlight; intentionally no shimmer
 * — GitSlip favors restraint, and shimmer reads as chrome in a warm
 * palette. Use inside layout wrappers that mirror the real page so the
 * content settles without reflow.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-md bg-surface-highlight',
        className,
      )}
      {...props}
    />
  );
}
