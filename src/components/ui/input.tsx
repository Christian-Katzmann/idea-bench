import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * GitSlip-style text input.
 * h-10, rounded-lg, surface bg, warm border, accent-green focus ring.
 * Matches SelectTrigger geometry for visual pairing in forms.
 *
 * `aria-invalid` still drives the error styling automatically (native,
 * accessible). The `variant="error"` opt-in is for rare cases where you
 * want the red treatment without the ARIA implication — e.g., a field
 * that failed client-side validation and is being corrected live.
 */
const inputVariants = cva(
  [
    "h-10 w-full min-w-0 rounded-lg border border-border bg-card px-3.5 py-1 text-base text-foreground transition-colors outline-none md:text-sm",
    "file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
    "placeholder:text-muted-foreground",
    "focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/20",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted/60 disabled:opacity-60",
    "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "",
        error: "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Input({
  className,
  type,
  variant,
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
