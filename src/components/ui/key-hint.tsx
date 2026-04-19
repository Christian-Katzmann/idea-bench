import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Small kbd-styled pill for keyboard-shortcut hints.
 *
 * Used under voting buttons (A / B / Tie / Both bad), in the command
 * palette trigger (⌘K), and anywhere a shortcut deserves a visible
 * affordance rather than a hidden help popover (per Q7).
 */

export function KeyHint({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-card px-1 font-mono text-[10px] font-medium text-muted-foreground leading-none shadow-[0_1px_0_rgb(var(--border))]",
        className
      )}
    >
      {children}
    </kbd>
  )
}
