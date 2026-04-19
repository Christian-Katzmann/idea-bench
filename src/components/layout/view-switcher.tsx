import { useEffect, useRef, useState } from "react"
import { Link, useLocation, useMatch } from "react-router-dom"
import { Check, ChevronDown, Eye } from "lucide-react"
import { BrandMark } from "@/components/ui/brand-mark"
import { cn } from "@/lib/utils"

/**
 * Top-left sidebar control — per Q2, a view-mode switcher.
 *
 *   - "Operator" (current, default) — the admin view of the app.
 *   - "Participant preview" — opens a read-only snapshot of the
 *     voting experience for the campaign currently in view. No
 *     participant row or vote row is created; the preview runs
 *     client-side against /api/campaigns/:id/preview.
 *
 * The preview item is only enabled on `/campaign/:id` (including its
 * nested routes). On every other operator page it shows a helper
 * subtitle telling the operator to open a campaign first.
 */

export function ViewSwitcher({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const location = useLocation()

  // Close on outside click and on route change.
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    window.addEventListener("mousedown", handleClick)
    return () => window.removeEventListener("mousedown", handleClick)
  }, [isOpen])

  useEffect(() => {
    setIsOpen(false)
  }, [location.pathname])

  // Detect whether we're on a campaign page. `/campaign/new` is
  // excluded — there's nothing to preview until the wizard ships a
  // real campaign id.
  const campaignMatch = useMatch('/campaign/:id/*')
  const campaignId =
    campaignMatch && campaignMatch.params.id && campaignMatch.params.id !== 'new'
      ? campaignMatch.params.id
      : null

  // Are we already inside the preview? If so, the "Operator" item
  // becomes the actionable exit.
  const isPreviewPath = !!useMatch('/campaign/:id/preview')

  const activeLabel = isPreviewPath ? "Participant" : "Operator"

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex h-14 w-full cursor-pointer items-center border-b border-border px-4 text-left transition-colors hover:bg-surface-highlight/60 md:border-none"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <BrandMark size="md" className="mr-3" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">
            ModelArena
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {activeLabel}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute inset-x-2 top-full z-20 mt-1 origin-top animate-in fade-in-0 slide-in-from-top-1 duration-150 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl"
        >
          <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            View mode
          </div>
          {isPreviewPath && campaignId ? (
            <Link
              to={`/campaign/${campaignId}`}
              onClick={() => setIsOpen(false)}
              role="menuitem"
              className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-highlight"
            >
              <BrandMark size="sm" />
              <span className="truncate">Operator</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              role="menuitem"
              className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-md bg-surface-highlight px-3 py-2 text-sm text-foreground"
            >
              <BrandMark size="sm" />
              <span className="truncate">Operator</span>
              <Check className="ml-auto size-3.5 text-foreground" />
            </button>
          )}

          {campaignId && !isPreviewPath ? (
            <Link
              to={`/campaign/${campaignId}/preview`}
              onClick={() => setIsOpen(false)}
              role="menuitem"
              className="mx-1 mt-0.5 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-highlight"
            >
              <Eye className="size-4 text-muted-foreground" />
              <span className="truncate">Participant preview</span>
            </Link>
          ) : isPreviewPath && campaignId ? (
            <div
              role="menuitem"
              aria-current="true"
              className="mx-1 mt-0.5 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-md bg-surface-highlight px-3 py-2 text-sm text-foreground"
            >
              <Eye className="size-4 text-muted-foreground" />
              <span className="truncate">Participant preview</span>
              <Check className="ml-auto size-3.5 text-foreground" />
            </div>
          ) : (
            <div
              role="menuitem"
              aria-disabled
              className="mx-1 mt-0.5 flex w-[calc(100%-0.5rem)] cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground/70"
              title="Open a campaign first to preview the voter experience"
            >
              <Eye className="size-4" />
              <span className="truncate">Participant preview</span>
              <span className="ml-auto text-[10px] text-muted-foreground/70">
                Open a campaign
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
