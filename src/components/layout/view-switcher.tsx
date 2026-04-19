import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Eye } from "lucide-react"
import { BrandMark } from "@/components/ui/brand-mark"
import { cn } from "@/lib/utils"

/**
 * Top-left sidebar control — currently a placeholder (per Q2, option C).
 *
 * Intended trajectory:
 *   - "Operator" (current, default) — the admin view of the app.
 *   - "Participant Preview" — lets an operator see the voting experience
 *     for a selected campaign without logging out. Disabled until we wire
 *     it up in a later phase; the dropdown surfaces the intent today.
 *
 * The shape matches GitSlip's org-switcher tile: `/` mark + label + small
 * caption + chevron. A left-click opens the dropdown; clicking the same
 * item closes it. No backend change — purely UI scaffolding.
 */

type ViewMode = "operator" | "participant"

export function ViewSwitcher({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click
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

  const activeMode: ViewMode = "operator"

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
            Operator
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
        <div className="absolute inset-x-2 top-full z-20 mt-1 origin-top animate-in fade-in-0 slide-in-from-top-1 duration-150 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl">
          <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            View mode
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-md bg-surface-highlight px-3 py-2 text-sm text-foreground"
          >
            <BrandMark size="sm" />
            <span className="truncate">Operator</span>
            {activeMode === "operator" && (
              <Check className="ml-auto size-3.5 text-foreground" />
            )}
          </button>
          <div
            className="mx-1 mt-0.5 flex w-[calc(100%-0.5rem)] cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground/70"
            aria-disabled
            title="Pick a campaign first to preview the participant experience"
          >
            <Eye className="size-4" />
            <span className="truncate">Participant preview</span>
            <span className="ml-auto rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70">
              Soon
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
