import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * GitSlip-style empty-state card.
 *
 * Dashed border, centered icon in a circle, headline, helper text,
 * optional CTA. Matches the Domains "No custom domains yet" treatment.
 *
 * Used for: empty Campaigns list, empty Models list, empty voting
 * results (no votes yet), filter-matches-nothing states.
 */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-card/30 px-6 py-14 text-center",
        className
      )}
    >
      {Icon && (
        <div className="flex size-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
          <Icon className="size-5" />
        </div>
      )}
      <div className="flex max-w-sm flex-col gap-1.5">
        <div className="font-heading text-base font-medium text-foreground">
          {title}
        </div>
        {description && (
          <div className="text-sm text-muted-foreground">{description}</div>
        )}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}
