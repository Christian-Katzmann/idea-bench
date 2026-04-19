import { Check, CircleDashed, Loader2, XCircle, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/**
 * Semantic status chip for ModelArena state machines.
 *
 * Maps domain states to the GitSlip chip conventions — all rounded-full,
 * 10px uppercase, color-tinted border + background + text.
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

type StatusConfig = {
  variant: React.ComponentProps<typeof Badge>["variant"]
  label: string
  icon?: React.ComponentType<{ className?: string }>
  iconSpin?: boolean
}

const STATUSES: Record<StatusState, StatusConfig> = {
  active:       { variant: "success",     label: "Active" },
  live:         { variant: "success",     label: "Live" },
  building:     { variant: "warning",     label: "Building",     icon: Loader2,      iconSpin: true },
  draft:        { variant: "warning",     label: "Draft",        icon: CircleDashed },
  completed:    { variant: "outline",     label: "Completed",    icon: Check },
  failed:       { variant: "destructive", label: "Failed",       icon: XCircle },
  directional:  { variant: "outline",     label: "Directional" },
  preliminary:  { variant: "warning",     label: "Preliminary" },
  stable:       { variant: "success",     label: "Stable",       icon: Zap },
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
  const Icon = config.icon

  return (
    <Badge variant={config.variant} className={cn(className)}>
      {Icon && (
        <Icon
          className={cn(
            "size-2.5",
            config.iconSpin && "animate-spin"
          )}
        />
      )}
      {label ?? config.label}
    </Badge>
  )
}
