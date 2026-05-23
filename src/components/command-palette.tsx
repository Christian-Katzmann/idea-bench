import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Activity, Boxes, Key, LayoutDashboard, Plus, Search, Sparkles, Users } from "lucide-react"
import { apiFetch } from "@/lib/api"
import type { CampaignSummary } from "@/lib/api"
import { cn } from "@/lib/utils"

/**
 * ⌘K command palette — GitSlip-style.
 *
 * Three logical groups:
 *   - Campaigns: fuzzy-search the operator's campaigns (lazy-fetched on
 *     first open, cached by TanStack Query).
 *   - Navigation: jump to the core operator sections.
 *   - Actions: kick off common verbs (New Campaign).
 *
 * Keyboard: arrow keys move the active row, Enter invokes, Esc closes.
 * When the query is empty, we hide the Campaigns group and show nav + actions.
 */

type PaletteItem = {
  id: string
  group: "Campaigns" | "Navigation" | "Actions"
  label: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  run: () => void
}

export function CommandPalette({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Lazy-load campaigns only while the palette is open.
  const campaignsQuery = useQuery({
    queryKey: ["campaigns"],
    queryFn: () =>
      apiFetch<{ campaigns: CampaignSummary[] }>("/api/campaigns").then((r) => r.campaigns),
    enabled: isOpen,
    staleTime: 60_000,
  })

  // Reset query on close so the next open feels fresh.
  useEffect(() => {
    if (!isOpen) {
      setQuery("")
      setActiveIdx(0)
    }
  }, [isOpen])

  // Focus input when opened.
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 20)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  // Close on Escape (also captured at the app-shell level for ⌘K toggle;
  // local listener ensures Esc works even if focus is inside a result row).
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isOpen, onClose])

  const items: PaletteItem[] = useMemo(() => {
    const go = (to: string) => () => {
      navigate(to)
      onClose()
    }

    const navItems: PaletteItem[] = [
      { id: "nav-dashboard", group: "Navigation", label: "Go to Dashboard", icon: LayoutDashboard, run: go("/dashboard") },
      { id: "nav-campaigns", group: "Navigation", label: "Go to Campaigns", icon: Boxes, run: go("/") },
      { id: "nav-activity", group: "Navigation", label: "Go to Team Activity", icon: Activity, run: go("/team-activity") },
      { id: "nav-models", group: "Navigation", label: "Go to Models", icon: Users, run: go("/models") },
      { id: "nav-personas", group: "Navigation", label: "Go to Personas", icon: Sparkles, run: go("/personas") },
      { id: "nav-settings", group: "Navigation", label: "Go to API Settings", icon: Key, run: go("/settings/api") },
    ]
    const actionItems: PaletteItem[] = [
      { id: "action-new-campaign", group: "Actions", label: "New campaign", icon: Plus, run: go("/campaign/new") },
    ]

    const q = query.trim().toLowerCase()
    const campaignItems: PaletteItem[] = (campaignsQuery.data ?? [])
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q))
      .slice(0, 8)
      .map((c) => ({
        id: `campaign-${c.id}`,
        group: "Campaigns",
        label: c.name,
        subtitle: c.description ?? undefined,
        icon: Boxes,
        run: go(`/campaign/${c.id}`),
      }))

    if (!q) {
      return [...navItems, ...actionItems]
    }
    const matchesNav = navItems.filter((i) => i.label.toLowerCase().includes(q))
    const matchesAction = actionItems.filter((i) => i.label.toLowerCase().includes(q))
    return [...campaignItems, ...matchesNav, ...matchesAction]
  }, [campaignsQuery.data, query, navigate, onClose])

  // Group ordered item list for rendering, preserving original order.
  const grouped = useMemo(() => {
    const groups: Record<PaletteItem["group"], PaletteItem[]> = {
      Campaigns: [],
      Navigation: [],
      Actions: [],
    }
    items.forEach((i) => groups[i.group].push(i))
    return (Object.keys(groups) as Array<keyof typeof groups>)
      .filter((g) => groups[g].length > 0)
      .map((g) => ({ group: g, items: groups[g] }))
  }, [items])

  // Reset active index when the filtered list changes.
  useEffect(() => {
    setActiveIdx(0)
  }, [items.length])

  // Arrow navigation.
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      items[activeIdx]?.run()
    }
  }

  if (!isOpen) return null

  // Flatten ordered index across groups so arrow keys visit them in read order.
  let runningIdx = -1

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[20vh] animate-in fade-in-0 duration-150">
      <div
        role="presentation"
        aria-hidden
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-center border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search campaigns or jump to a section..."
            className="h-12 w-full border-none bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="rounded border border-border bg-surface-highlight px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </div>
        </div>
        <div ref={listRef} className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
          {grouped.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {campaignsQuery.isLoading
                ? "Loading..."
                : query
                ? "No matches."
                : "No results."}
            </div>
          )}
          {grouped.map(({ group, items: groupItems }) => (
            <div key={group} className="space-y-0.5">
              <div className="px-2 pt-1 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {group}
              </div>
              {groupItems.map((item) => {
                runningIdx += 1
                const idx = runningIdx
                const active = idx === activeIdx
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={item.run}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      active
                        ? "bg-surface-highlight text-foreground"
                        : "text-muted-foreground hover:bg-surface-highlight/60 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{item.label}</div>
                      {item.subtitle && (
                        <div className="truncate text-xs text-muted-foreground/70">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    {active && (
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                        ↵
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
