import { Menu, Search } from "lucide-react"
import { Breadcrumb, type BreadcrumbItem } from "./breadcrumb"
import { AvatarMenu } from "./avatar-menu"

/**
 * Sticky app topbar.
 *
 * Layout:
 *   [mobile-menu] [breadcrumb]       [search ⌘K] [avatar]
 *
 * Height: 56px (h-14). Blurred translucent background so the warm paper
 * below shows through — matches GitSlip's `glass-nav` treatment.
 */
export function Topbar({
  breadcrumb,
  onOpenMobileMenu,
  onOpenPalette,
}: {
  breadcrumb: BreadcrumbItem[]
  onOpenMobileMenu: () => void
  onOpenPalette: () => void
}) {
  return (
    <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between gap-2 border-b border-border bg-background/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md md:px-6">
      {/* `min-w-0` lets the left group shrink so the breadcrumb can truncate
          instead of pushing the right-side icons off-screen on long names. */}
      <div className="flex min-w-0 items-center gap-3 md:gap-4">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground md:hidden"
        >
          <Menu className="size-5" />
        </button>
        <Breadcrumb items={breadcrumb} className="min-w-0" />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {/* Mobile: 44×44 icon-only tap target (below md). Meets Apple HIG
            minimum and gives mobile operators a one-tap path to the command
            palette instead of drawer → "Search" row. */}
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Open search"
          className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-highlight hover:text-foreground md:hidden"
        >
          <Search className="size-5" />
        </button>
        {/* Desktop: full search pill with ⌘K hint. */}
        <button
          type="button"
          onClick={onOpenPalette}
          className="hidden h-8 w-52 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground transition-all hover:border-foreground/20 hover:text-foreground md:flex"
        >
          <Search className="size-3.5" />
          <span>Search...</span>
          <span className="ml-auto font-mono text-[10px] opacity-60">⌘K</span>
        </button>
        <AvatarMenu />
      </div>
    </header>
  )
}
