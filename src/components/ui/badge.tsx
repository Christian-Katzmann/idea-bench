import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * GitSlip-style badge / chip.
 *
 * Default geometry: fully-rounded pill, 10px font, uppercase with wide
 * letter-spacing — matches the `PRODUCTION` / `Live` / `Failed` chips
 * seen throughout GitSlip.
 *
 * Variants:
 * - `default`      filled dark pill (for neutral emphasis).
 * - `outline`      thin bordered pill on surface. Most common.
 * - `success`      forest-green on green-tinted surface (live/active).
 * - `warning`      amber on amber-tinted surface (draft/building).
 * - `destructive`  red on red-tinted surface (failed — chips only,
 *                  per Q4 red is not used on buttons).
 * - `secondary`    muted filled pill for category tags.
 * - `ghost`        color-only, transparent surface.
 *
 * For the semantic campaign/deployment states (`active / draft /
 * completed / live / building / failed`) use `<StatusBadge state=... />`
 * — it wraps this with the correct variant + icon.
 */
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring/30 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        outline:
          "border-border text-muted-foreground [a]:hover:bg-muted [a]:hover:text-foreground",
        secondary:
          "bg-muted text-foreground [a]:hover:bg-muted/80",
        success:
          "border-success/20 bg-success/10 text-success",
        warning:
          "border-warning/25 bg-warning/10 text-warning",
        destructive:
          "border-destructive/25 bg-destructive/10 text-destructive",
        ghost:
          "text-muted-foreground hover:bg-muted hover:text-foreground",
        link:
          "text-accent underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  }
)

function Badge({
  className,
  variant = "outline",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
