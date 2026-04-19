import { Link } from "react-router-dom"
import { BrandMark } from "@/components/ui/brand-mark"
import { useTheme } from "@/components/ThemeProvider"
import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Minimal shell for public `/vote/*` routes.
 *
 * No sidebar, no command palette, no operator menu — participants are
 * anonymous and must not be led toward operator surfaces. The topbar
 * keeps just the `/` brand mark, an optional page label (usually the
 * campaign name or a static phrase like "Results"), and the theme
 * toggle for accessibility.
 *
 * The shell remains thin (`h-12` topbar) so the voting UI and results
 * views get most of the viewport.
 */
export function ParticipantShell({
  label,
  rightSlot,
  children,
  contentClassName,
}: {
  /** Small text rendered next to the brand mark (e.g. campaign name). */
  label?: React.ReactNode
  /** Extra controls to place top-right (e.g., a quit button during voting). */
  rightSlot?: React.ReactNode
  children: React.ReactNode
  contentClassName?: string
}) {
  const { theme, setTheme } = useTheme()
  const nextTheme = theme === "dark" ? "light" : "dark"

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground font-sans">
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" aria-label="Home" className="flex items-center">
            <BrandMark size="sm" />
          </Link>
          {label && (
            <>
              <span aria-hidden className="text-border">/</span>
              <div className="min-w-0 truncate text-sm font-medium text-foreground">
                {label}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {rightSlot}
          <button
            type="button"
            onClick={() => setTheme(nextTheme)}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-highlight hover:text-foreground"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </header>
      <main className={cn("flex-1", contentClassName)}>{children}</main>
    </div>
  )
}
