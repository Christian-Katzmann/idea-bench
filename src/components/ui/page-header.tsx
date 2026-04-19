import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Single source of truth for the top of an operator page.
 *
 * Every page was reimplementing `<h1> + description + action button`
 * differently (different font sizes, different margins, different gap).
 * This consolidates the pattern to match GitSlip:
 *   - title:      text-xl font-semibold (large pages use text-2xl via prop)
 *   - description: text-sm text-muted-foreground
 *   - action slot: right-aligned, wraps below on mobile
 *
 * For breadcrumbs, use the AppShell breadcrumb prop, not this header.
 */

export function PageHeader({
  title,
  description,
  action,
  size = "default",
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  size?: "default" | "lg"
  className?: string
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 pb-2 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1
          className={cn(
            "font-heading font-semibold tracking-tight text-foreground",
            size === "lg" ? "text-2xl" : "text-xl"
          )}
        >
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      )}
    </header>
  )
}
