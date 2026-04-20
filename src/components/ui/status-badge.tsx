import { cn } from "@/lib/utils"

/**
 * Editorial-stamp status mark.
 *
 * Reads as marginalia rather than UI: small-caps tinted text sitting on
 * a hairline rule, no fill, no icon, no pill. Palette maps onto the
 * warm paper tokens — accent green for go-states, burnt-sienna warning
 * for in-progress, warm stone for archival, destructive brick for
 * failure. Tracking is wider than `tracking-wide` so the letters read
 * as a small-caps stamp, not a button label.
 *
 * Campaign states: `active` / `draft` / `completed`
 * Deployment/run states: `live` / `building` / `failed`
 * Rating stability tiers: `directional` / `preliminary` / `stable`
 */

export type StatusState =
  | "active"
  | "draft"
  | "completed"
  | "live"
  | "building"
  | "failed"
  | "directional"
  | "preliminary"
  | "stable"

type StatusTone = "go" | "progress" | "archival" | "failure"

const TONE_CLASS: Record<StatusTone, string> = {
  go:       "text-accent border-accent/45",
  progress: "text-warning border-warning/45",
  archival: "text-muted-foreground border-muted-foreground/40",
  failure:  "text-destructive border-destructive/45",
}

const STATUSES: Record<StatusState, { label: string; tone: StatusTone }> = {
  active:      { label: "Active",      tone: "go" },
  live:        { label: "Live",        tone: "go" },
  stable:      { label: "Stable",      tone: "go" },
  draft:       { label: "Draft",       tone: "progress" },
  building:    { label: "Building",    tone: "progress" },
  preliminary: { label: "Preliminary", tone: "progress" },
  completed:   { label: "Completed",   tone: "archival" },
  directional: { label: "Directional", tone: "archival" },
  failed:      { label: "Failed",      tone: "failure" },
}

export function StatusBadge({
  state,
  label,
  className,
}: {
  state: StatusState
  /** Override the default label (e.g., "Closed" instead of "Completed"). */
  label?: string
  className?: string
}) {
  const config = STATUSES[state]

  return (
    <span
      className={cn(
        "inline-block text-[10px] font-medium uppercase leading-none tracking-[0.14em]",
        "border-b pb-[3px]",
        TONE_CLASS[config.tone],
        state === "building" && "animate-pulse",
        className
      )}
    >
      {label ?? config.label}
    </span>
  )
}
