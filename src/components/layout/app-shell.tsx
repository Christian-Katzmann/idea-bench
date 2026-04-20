import { useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import { SidebarContent } from "./sidebar"
import { Topbar } from "./topbar"
import { Breadcrumb, type BreadcrumbItem } from "./breadcrumb"
import { CommandPalette } from "@/components/command-palette"
import { cn } from "@/lib/utils"

/**
 * The operator-facing app shell.
 *
 * Responsibilities:
 *   - Render the fixed 256px sidebar (desktop) or a slide-in drawer (mobile).
 *   - Render the sticky topbar with breadcrumb + search trigger + avatar.
 *   - Own the command palette open state and the ⌘K keyboard shortcut.
 *   - Center-align main content up to max-w-6xl, matching GitSlip.
 *
 * Each operator page wraps its body in <AppShell breadcrumb={...}>.
 * The breadcrumb prop is required — there's no sensible default that
 * works for every page (e.g. /campaign/:id needs the campaign name).
 * The AppShell handles crumb rendering; `Breadcrumb` is re-exported
 * for rare cases where a page wants to render its own.
 */
export function AppShell({
  breadcrumb,
  children,
  contentClassName,
}: {
  breadcrumb: BreadcrumbItem[]
  children: React.ReactNode
  /** Override the default `max-w-6xl` main container, e.g. to go wider. */
  contentClassName?: string
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const location = useLocation()

  // Close drawer on route change.
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  // ⌘K / Ctrl+K toggles the palette globally within the shell.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isK = e.key === "k" || e.key === "K"
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault()
        setIsPaletteOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return (
    <div className="flex min-h-dvh bg-background text-foreground font-sans">
      {/* Desktop sidebar — fixed so topbar + content scroll underneath */}
      <aside className="fixed inset-y-0 z-40 hidden w-64 flex-col border-r border-border bg-background/80 backdrop-blur-xl md:flex">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 transform transition-transform duration-200 md:hidden",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div
          role="presentation"
          aria-hidden
          className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
        <div className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-2xl">
          <SidebarContent
            onNavigate={() => setIsMobileMenuOpen(false)}
            onOpenPalette={() => setIsPaletteOpen(true)}
          />
        </div>
      </div>

      {/* `min-w-0` is load-bearing: without it, a flex-1 row item keeps the
          default `min-width: auto`, which lets the column grow to its widest
          content (tables, long names) instead of shrinking to the allocated
          viewport width. On phones that cascaded into every page rendering
          ~2× wider than the viewport. */}
      <div className="relative flex min-h-dvh min-w-0 flex-1 flex-col md:ml-64">
        <Topbar
          breadcrumb={breadcrumb}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onOpenPalette={() => setIsPaletteOpen(true)}
        />
        <main
          className={cn(
            "relative mx-auto w-full max-w-6xl flex-1 p-4 md:p-8",
            contentClassName
          )}
        >
          {children}
        </main>
      </div>

      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
      />
    </div>
  )
}

export { Breadcrumb, type BreadcrumbItem } from "./breadcrumb"
