import { useEffect, useState, useSyncExternalStore } from "react"
import { AlertCircle, CheckCircle, ExternalLink, Info, X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * GitSlip-style toast system.
 *
 * Fixed bottom-right stack, fade-in-up entry, auto-dismiss after 5s.
 * Call `toast.success("...")`, `toast.error("...")`, `toast.info("...")`
 * from anywhere — a module-level store drives a single <Toaster />
 * mounted at the app root.
 *
 * Replaces ïdea Bench's ad-hoc red alert divs. Inline validation
 * errors on individual form fields stay inline; transient feedback
 * (save succeeded, network failed, action applied) goes here.
 */

export type ToastType = "success" | "error" | "info"

export interface ToastRecord {
  id: string
  type: ToastType
  message: string
  details?: string
  link?: { url: string; label: string }
  durationMs?: number
}

// --- Module-level store --------------------------------------------------

type Listener = (toasts: ToastRecord[]) => void

class ToastStore {
  private toasts: ToastRecord[] = []
  private listeners = new Set<Listener>()

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.toasts

  push(t: Omit<ToastRecord, "id">) {
    const id = Math.random().toString(36).slice(2, 10)
    this.toasts = [...this.toasts, { id, ...t }]
    this.emit()
  }

  dismiss = (id: string) => {
    this.toasts = this.toasts.filter((t) => t.id !== id)
    this.emit()
  }

  private emit() {
    this.listeners.forEach((l) => l(this.toasts))
  }
}

const store = new ToastStore()

export const toast = {
  success: (message: string, opts?: Partial<Omit<ToastRecord, "id" | "type" | "message">>) =>
    store.push({ type: "success", message, ...opts }),
  error: (message: string, opts?: Partial<Omit<ToastRecord, "id" | "type" | "message">>) =>
    store.push({ type: "error", message, ...opts }),
  info: (message: string, opts?: Partial<Omit<ToastRecord, "id" | "type" | "message">>) =>
    store.push({ type: "info", message, ...opts }),
  dismiss: store.dismiss,
}

// --- UI ------------------------------------------------------------------

const typeStyles: Record<ToastType, { wrapper: string; icon: string; Icon: React.ComponentType<{ className?: string }> }> = {
  success: {
    wrapper: "border-success/25 bg-card",
    icon: "text-success",
    Icon: CheckCircle,
  },
  error: {
    wrapper: "border-destructive/30 bg-card",
    icon: "text-destructive",
    Icon: AlertCircle,
  },
  info: {
    wrapper: "border-border bg-card",
    icon: "text-muted-foreground",
    Icon: Info,
  },
}

function ToastItem({ toast: t }: { toast: ToastRecord }) {
  const [leaving, setLeaving] = useState(false)
  const { wrapper, icon, Icon } = typeStyles[t.type]

  useEffect(() => {
    const timer = setTimeout(() => {
      setLeaving(true)
      setTimeout(() => store.dismiss(t.id), 120)
    }, t.durationMs ?? 5000)
    return () => clearTimeout(timer)
  }, [t.id, t.durationMs])

  return (
    <div
      role="status"
      data-leaving={leaving || undefined}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-4 shadow-lg transition-all",
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
        "data-[leaving]:animate-out data-[leaving]:fade-out data-[leaving]:slide-out-to-right-2",
        wrapper
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", icon)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{t.message}</p>
        {t.details && (
          <p className="mt-0.5 text-xs text-muted-foreground">{t.details}</p>
        )}
        {t.link && (
          <a
            href={t.link.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            {t.link.label}
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={() => store.dismiss(t.id)}
        aria-label="Dismiss"
        className="mt-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

export function Toaster() {
  const toasts = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => [] as ToastRecord[]
  )

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 pointer-events-none [&>*]:pointer-events-auto"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
