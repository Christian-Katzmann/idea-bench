import { cn } from "@/lib/utils"

/**
 * The idea.com split-sphere mark.
 *
 * ïdea Bench uses the mark as a compact product signature beside
 * breadcrumbs, campaign titles, and auth surfaces.
 *
 * Sizes calibrated so the `sm` variant works in list-row context (inline
 * with 14px body text) while `md` sits beside the sidebar org selector
 * and `lg` fits auth card headers.
 */

type BrandMarkSize = "sm" | "md" | "lg" | "xl"

const sizeMap: Record<BrandMarkSize, string> = {
  sm: "size-5",
  md: "size-7",
  lg: "size-9",
  xl: "size-12",
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
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        sizeMap[size],
        className
      )}
    >
      <img
        src="/logo-brand.png"
        alt=""
        className="size-full object-contain"
        draggable={false}
      />
    </span>
  )
}
