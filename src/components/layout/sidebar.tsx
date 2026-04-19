import { Link, useLocation } from "react-router-dom"
import { Activity, Boxes, Key, LayoutDashboard, Search, Users } from "lucide-react"
import { ViewSwitcher } from "./view-switcher"
import { cn } from "@/lib/utils"

/**
 * Sidebar nav sections for ModelArena.
 *
 * Organization follows GitSlip's convention (uppercase section labels,
 * icon + label rows, active state is "on surface" rather than "accented"):
 *
 *   PLATFORM  Dashboard / Campaigns / Team Activity / Models
 *   ACCOUNT   API Settings
 *
 * The active-match logic pairs `/` and `/campaign/...` under "Campaigns"
 * so navigating into a specific campaign keeps the parent item highlighted.
 */

type NavItem = {
  label: string
  to: string
  icon: React.ComponentType<{ className?: string }>
  /** Returns true when this nav item should show as active for the given path. */
  match: (pathname: string) => boolean
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: "Platform",
    items: [
      {
        label: "Dashboard",
        to: "/dashboard",
        icon: LayoutDashboard,
        match: (p) => p.startsWith("/dashboard"),
      },
      {
        label: "Campaigns",
        to: "/",
        icon: Boxes,
        match: (p) => p === "/" || p.startsWith("/campaign"),
      },
      {
        label: "Team Activity",
        to: "/team-activity",
        icon: Activity,
        match: (p) => p.startsWith("/team-activity"),
      },
      {
        label: "Models",
        to: "/models",
        icon: Users,
        match: (p) => p.startsWith("/models"),
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        label: "API Settings",
        to: "/settings/api",
        icon: Key,
        match: (p) => p.startsWith("/settings"),
      },
    ],
  },
]

export function SidebarContent({
  onNavigate,
  onOpenPalette,
}: {
  /** Called after a nav click — use to close the mobile drawer. */
  onNavigate?: () => void
  /** Called when the mobile "Search" row is clicked. */
  onOpenPalette?: () => void
}) {
  const location = useLocation()

  return (
    <>
      <ViewSwitcher className="mb-5" />

      <div className="flex flex-col gap-6 px-3 pb-6">
        {navSections.map((section, idx) => (
          <div key={section.label} className="flex flex-col gap-1">
            <div
              className={cn(
                "px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70",
                idx === 0 && "pt-0"
              )}
            >
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = item.match(location.pathname)
              const Icon = item.icon
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all",
                    active
                      ? "bg-card font-medium text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:bg-surface-highlight/60 hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}

        {onOpenPalette && (
          <div className="flex flex-col gap-1 md:hidden">
            <button
              type="button"
              onClick={() => {
                onOpenPalette()
                onNavigate?.()
              }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-surface-highlight/60 hover:text-foreground"
            >
              <Search className="size-4" /> Search
            </button>
          </div>
        )}
      </div>
    </>
  )
}
