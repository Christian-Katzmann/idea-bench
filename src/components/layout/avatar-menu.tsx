import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, LogOut, Moon, Settings, Sun } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { useTheme } from "@/components/ThemeProvider"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

/**
 * Top-right avatar + dropdown menu.
 *
 * Surfaces: account header, theme toggle, API settings link, sign out.
 * Avatar is a circular letter tile (first letter of "Operator") — ïdea Bench
 * has no per-user profile, so we use a neutral placeholder that still reads
 * as "a user is signed in" without implying per-account state we don't have.
 */
export function AvatarMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

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

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" })
      queryClient.clear()
      navigate("/login", { replace: true })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to sign out."
      )
    } finally {
      setIsLoggingOut(false)
      setIsOpen(false)
    }
  }

  const nextTheme = theme === "dark" ? "light" : "dark"

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex size-8 items-center justify-center rounded-full bg-surface-highlight text-sm font-medium text-muted-foreground ring-2 ring-transparent transition-all hover:text-foreground hover:ring-border focus-visible:outline-none focus-visible:ring-border"
      >
        O
        <span className="sr-only">Open account menu</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-10 z-50 w-60 origin-top-right overflow-hidden rounded-xl border border-border bg-card py-1 shadow-2xl animate-in fade-in-0 slide-in-from-top-1 duration-150">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-foreground">Operator</p>
            <p className="text-xs text-muted-foreground">
              Signed in · Full access
            </p>
          </div>
          <div className="py-1">
            <Link
              to="/settings/api"
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-highlight hover:text-foreground"
            >
              <Settings className="size-4" />
              API Settings
            </Link>
            <button
              type="button"
              onClick={() => setTheme(nextTheme)}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-highlight hover:text-foreground"
            >
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
          <div className="border-t border-border py-1">
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-highlight hover:text-foreground",
                isLoggingOut && "opacity-60"
              )}
            >
              {isLoggingOut ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" />
              )}
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
