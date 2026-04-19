import { cn } from "@/lib/utils"

/**
 * Letter-square avatar for lists (campaigns, models, participants).
 *
 * GitSlip style: rounded square with the first character of the name
 * in a muted serif/sans face. We use the current font-sans for
 * consistency with the list text. Color is the surface-highlight token
 * so the tile reads as a considered placeholder, not a generic avatar.
 *
 * Kept intentionally monochrome — no deterministic-hash colorization.
 * Coloring letter tiles by hash tilts the interface toward playful,
 * which clashes with GitSlip's restraint.
 */

type EntityIconSize = "sm" | "md" | "lg"

const sizeMap: Record<EntityIconSize, string> = {
  sm: "size-7 text-[11px] rounded-md",
  md: "size-9 text-sm rounded-lg",
  lg: "size-11 text-base rounded-lg",
}

export function EntityIcon({
  name,
  size = "md",
  className,
}: {
  name: string
  size?: EntityIconSize
  className?: string
}) {
  const letter = (name?.trim().charAt(0) || "?").toUpperCase()

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-border bg-surface-highlight font-medium uppercase text-muted-foreground leading-none",
        sizeMap[size],
        className
      )}
    >
      {letter}
    </span>
  )
}
