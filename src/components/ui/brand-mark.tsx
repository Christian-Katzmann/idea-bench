import { cn } from "@/lib/utils"

/**
 * The `/` mark, rendered as text in a rounded dark tile.
 *
 * Ported from GitSlip. Kept per Q1 — ïdea Bench adopts the visual but
 * uses its own breadcrumb root, not the GitSlip wordmark.
 *
 * Sizes calibrated so the `sm` variant works in list-row context (inline
 * with 14px body text) while `md` sits beside the sidebar org selector
 * and `lg` fits auth card headers.
 */

type BrandMarkSize = "sm" | "md" | "lg" | "xl"

const sizeMap: Record<BrandMarkSize, string> = {
  sm: "size-5 text-[11px] rounded-[5px]",
  md: "size-7 text-sm rounded-md",
  lg: "size-9 text-lg rounded-lg",
  xl: "size-12 text-2xl rounded-xl",
}

export function BrandMark({
  size = "md",
  className,
}: {
  size?: BrandMarkSize
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-primary font-mono font-bold text-primary-foreground leading-none",
        sizeMap[size],
        className
      )}
    >
      /
    </span>
  )
}
