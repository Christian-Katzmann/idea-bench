import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Skeleton placeholder block.
 *
 * Subtle pulse animation on surface-highlight; intentionally no shimmer
 * — GitSlip favors restraint, and shimmer reads as chrome in a warm
 * palette. Use inside layout wrappers that mirror the real page so the
 * content settles without reflow.
 */
const skeletonVariants = cva('animate-pulse bg-surface-highlight', {
  variants: {
    variant: {
      default: 'rounded-md',
      circle: 'rounded-full aspect-square',
      text: 'rounded-md h-4 w-full',
    },
    size: {
      default: '',
      sm: 'h-3',
      lg: 'h-6',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export function Skeleton({
  className,
  variant,
  size,
  ...props
}: React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof skeletonVariants>) {
  return (
    <div
      aria-hidden="true"
      className={cn(skeletonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { skeletonVariants };
