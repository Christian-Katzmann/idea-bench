import { useEffect, useId, useState, type ReactNode } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Destructive-action confirmation modal.
 *
 * Ported in spirit from gitslip/frontend/components/modals/DeleteConfirmation.tsx,
 * but following the ModelArena brand rule (Q4): dark pill confirm + typed-name
 * guard, no red buttons. Red is reserved for inline validation and error
 * surfaces only. The subdued warning chip beside the title carries the
 * "this is permanent" cue without escalating to alarm.
 *
 * Controlled via `open` + `onOpenChange`. The typed word resets on close.
 *
 * Typical use:
 *
 *   const [open, setOpen] = useState(false)
 *   <ConfirmDestructive
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Close campaign"
 *     description="New participants will no longer be able to start voting."
 *     confirmWord={campaign.name}
 *     confirmLabel="Close campaign"
 *     isPending={closeCampaign.isPending}
 *     onConfirm={() => closeCampaign.mutate()}
 *   />
 */
export interface ConfirmDestructiveProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Dialog title, e.g. "Close campaign". */
  title: string
  /** Explanatory body. Supports rich content for bolded names, etc. */
  description?: ReactNode
  /** Exact string the user must type to unlock the confirm button. */
  confirmWord: string
  /** Primary button label. Defaults to `title`. */
  confirmLabel?: string
  /** Cancel button label. */
  cancelLabel?: string
  /** Called when the typed word matches and the user clicks confirm. */
  onConfirm: () => void
  /** Shows a spinner + disables both buttons while the mutation runs. */
  isPending?: boolean
}

export function ConfirmDestructive({
  open,
  onOpenChange,
  title,
  description,
  confirmWord,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  isPending = false,
}: ConfirmDestructiveProps) {
  const [input, setInput] = useState("")
  const labelId = useId()
  const isMatch = input === confirmWord

  useEffect(() => {
    if (!open) setInput("")
  }, [open])

  const handleConfirm = () => {
    if (!isMatch || isPending) return
    onConfirm()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let the user close the dialog mid-mutation — it would leave
        // state inconsistent and the spinner would vanish unexpectedly.
        if (isPending && !next) return
        onOpenChange(next)
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-warning/20 bg-warning/5 text-warning"
            >
              <AlertTriangle className="size-5" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <DialogTitle>{title}</DialogTitle>
              {description ? (
                <DialogDescription className="mt-1">
                  {description}
                </DialogDescription>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label
            id={labelId}
            htmlFor={`${labelId}-input`}
            className="text-xs text-muted-foreground"
          >
            Type{" "}
            <span className="select-all font-mono font-medium text-foreground">
              {confirmWord}
            </span>{" "}
            to confirm
          </label>
          <Input
            id={`${labelId}-input`}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- confirmation dialog UX
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                handleConfirm()
              }
            }}
            placeholder={confirmWord}
            disabled={isPending}
            aria-labelledby={labelId}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleConfirm}
            disabled={!isMatch || isPending}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel ?? title}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
