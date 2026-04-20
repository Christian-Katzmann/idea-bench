import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

export type BreadcrumbItem = {
  /** Display label. */
  label: string
  /** If present, the item links; if absent, it renders as the current page. */
  to?: string
}

/**
 * Topbar breadcrumb: `modelarena / Section` or `modelarena / Section / Detail`.
 *
 * The leading `modelarena` segment links to `/` (Campaigns home). The final
 * segment is rendered as emphasized current-page text; middle segments link.
 *
 * Per Q1, the root label is "modelarena" (the product), not "gitslip".
 */
export function Breadcrumb({
  items,
  className,
}: {
  items: BreadcrumbItem[]
  className?: string
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex min-w-0 items-center gap-2 text-sm text-muted-foreground", className)}
    >
      {/* Root and intermediate segments never truncate; the last segment
          takes whatever space remains and truncates. This keeps
          "modelarena / Campaigns" readable while preventing a long
          campaign name in the last slot from pushing the right-side
          topbar icons off-screen. */}
      <Link
        to="/"
        className="shrink-0 transition-colors hover:text-foreground"
      >
        modelarena
      </Link>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        // On phones, intermediate segments steal room from the last (current-
        // page) segment and collapse it to "O...". Hide them below sm; the
        // drawer covers navigation. Desktop keeps the full trail.
        const hideOnMobile = !isLast && items.length > 1
        return (
          <span
            key={`${item.label}-${idx}`}
            className={cn(
              "items-center gap-2",
              isLast ? "flex min-w-0" : "shrink-0",
              hideOnMobile ? "hidden sm:flex" : "flex",
            )}
          >
            <span aria-hidden className="shrink-0 text-border">/</span>
            {item.to && !isLast ? (
              <Link
                to={item.to}
                className="transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span className="min-w-0 truncate font-medium text-foreground">
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
