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
      className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}
    >
      <Link
        to="/"
        className="transition-colors hover:text-foreground"
      >
        modelarena
      </Link>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        return (
          <span key={`${item.label}-${idx}`} className="flex items-center gap-2">
            <span aria-hidden className="text-border">/</span>
            {item.to && !isLast ? (
              <Link
                to={item.to}
                className="transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{item.label}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
