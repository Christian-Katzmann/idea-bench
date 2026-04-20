import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * GitSlip-style button.
 *
 * Conventions:
 * - `default`      → dark rounded button on light surface. Primary CTA
 *                    ("New Campaign", "Add Domain"). rounded-lg, h-10.
 * - `outline`      → bordered secondary action on surface. rounded-lg.
 * - `secondary`    → subtle filled action. Same geometry as outline.
 * - `ghost`        → color-only hover, no chrome. For icon buttons and
 *                    menu rows.
 * - `destructive`  → visually == outline (no red fill, per brand restraint).
 *                    Destructive intent is communicated via typed-name
 *                    confirmation in ConfirmDestructive, not color.
 *                    Red reserved for error/validation surfaces only.
 * - `link`         → underlined inline link styled on hover.
 */
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-all outline-none select-none bg-clip-padding focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-0 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary",
        outline:
          "rounded-lg border border-border bg-card text-foreground hover:bg-surface-highlight hover:border-border aria-expanded:bg-surface-highlight",
        secondary:
          "rounded-lg bg-muted text-foreground hover:bg-surface-highlight aria-expanded:bg-surface-highlight",
        ghost:
          "rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "rounded-lg border border-border bg-card text-foreground hover:bg-surface-highlight",
        link:
          "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 gap-2 px-5 text-sm",
        xs: "h-6 gap-1 px-2 text-xs",
        sm: "h-8 gap-1.5 px-3 text-[13px]",
        lg: "h-11 gap-2 px-6 text-sm",
        icon: "size-10",
        "icon-xs": "size-6",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    compoundVariants: [
      /* Non-pill variants use lg radius at default size for "gentle rounded"
         feel; smaller sizes drop to md for proportion. */
      { variant: ["outline", "secondary", "ghost", "destructive"], size: "sm", className: "rounded-md" },
      { variant: ["outline", "secondary", "ghost", "destructive"], size: "xs", className: "rounded-md" },
      { variant: ["ghost"], size: "icon", className: "rounded-full" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
