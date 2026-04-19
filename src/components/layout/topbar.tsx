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
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation"
          className="text-muted-foreground transition-colors hover:text-foreground md:hidden"
        >
          <Menu className="size-5" />
        </button>
        <Breadcrumb items={breadcrumb} />
      </div>

      <div className="flex items-center gap-3">
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
