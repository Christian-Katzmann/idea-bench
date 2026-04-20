import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, X } from 'lucide-react';
import { ParticipantShell } from '../layout/participant-shell';
import { PromptDisplay } from '../prompt/PromptDisplay';
import { Button } from '../ui/button';
import { KeyHint } from '../ui/key-hint';
import { ModeIndicator } from './ModeIndicator';
import { apiFetch, type ApproveRejectStep } from '../../lib/api';
import { cn } from '../../lib/utils';

/**
 * Approve / Reject step view — participant marks one model's output as
 * acceptable or not. Server serves one target at a time.
 *
 * Keyboard shortcuts: Y/A for approve, N/R for reject.
 */
export function ApproveRejectStepView({
  step,
  slug,
}: {
  step: ApproveRejectStep;
  slug: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: async (approved: boolean) =>
      apiFetch<{ ok: true }>(`/api/vote/${slug}/submit-approve-reject`, {
        method: 'POST',
        body: JSON.stringify({
          promptId: step.prompt.id,
          campaignModelId: step.target.campaignModelId,
          generationId: step.target.generation.id,
          approved,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vote-next', slug] });
    },
  });

  const handleDecide = useCallback(
    (approved: boolean) => {
      if (submit.isPending) return;
      submit.mutate(approved);
    },
    [submit],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === 'y' || e.key === 'Y' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleDecide(true);
      } else if (
        e.key === 'n' ||
        e.key === 'N' ||
        e.key === 'r' ||
        e.key === 'R'
      ) {
        e.preventDefault();
        handleDecide(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDecide]);

  const withinTotal = step.progress.withinPrompt.total;
  const withinDone = step.progress.withinPrompt.done;
  const promptsTotal = step.progress.promptsTotal;
  const promptsCurrent = Math.min(step.progress.promptsDone + 1, promptsTotal);
  const progressPct =
    promptsTotal > 0
      ? Math.round(
          ((step.progress.promptsDone + (withinDone + 0.5) / withinTotal) /
            promptsTotal) *
            100,
        )
      : 0;

  const approveLabel = step.modeConfig?.approveLabel ?? 'Approve';
  const rejectLabel = step.modeConfig?.rejectLabel ?? 'Reject';

  const shellLabel = (
    <>
      <span className="hidden sm:inline">
        Review response {withinDone + 1} of {withinTotal} for this prompt
      </span>
      <span className="flex items-center gap-2 sm:hidden">
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
          Prompt <span className="text-foreground">{promptsCurrent}</span> of{' '}
          {promptsTotal}
        </span>
        <div className="h-1 w-16 overflow-hidden rounded-full bg-border/60">
          <div
            className="h-full bg-foreground transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </span>
    </>
  );

  return (
    <ParticipantShell
      label={shellLabel}
      rightSlot={
        <>
          <div className="hidden min-w-40 items-center gap-2 sm:flex">
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
              Prompt <span className="text-foreground">{promptsCurrent}</span>{' '}
              of {promptsTotal}
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full bg-foreground transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/vote/${slug}/results`)}
            aria-label="Quit early"
            title="Quit and see your results"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-highlight hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </>
      }
      contentClassName="flex flex-col md:overflow-hidden"
    >
      <ModeIndicator mode="approve_reject" />
      <section className="border-b border-border bg-card px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Prompt
            </span>
            {step.prompt.categoryTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {step.prompt.categoryTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex h-5 items-center rounded-full border border-border bg-surface-highlight px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="max-w-[72ch]">
            <PromptDisplay prompt={step.prompt} collapsible />
          </div>
        </div>
      </section>

      <section className="flex-1 bg-background px-4 pt-6 pb-28 md:overflow-hidden md:px-6 md:pb-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 md:h-full">
          <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm md:flex-1 md:min-h-0">
            <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface-highlight/40 px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Response {withinDone + 1} / {withinTotal}
                </span>
                <span className="text-sm text-muted-foreground">
                  (model hidden)
                </span>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {step.target.generation.tokensOut != null
                  ? step.target.generation.tokensOut.toLocaleString()
                  : '—'}
                <span className="ml-1 opacity-70">tokens</span>
              </span>
            </header>
            <div className="flex-1 whitespace-pre-wrap px-4 py-4 text-[14px] leading-[1.65] text-foreground md:overflow-y-auto">
              {step.target.generation.output}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleDecide(true)}
              disabled={submit.isPending}
              size="lg"
              className={cn('w-full justify-center gap-2')}
            >
              <Check className="size-4" />
              <span>{approveLabel}</span>
              <KeyHint className="border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground/80">
                Y
              </KeyHint>
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDecide(false)}
              disabled={submit.isPending}
              size="lg"
              className="w-full justify-center gap-2"
            >
              <X className="size-4" />
              <span>{rejectLabel}</span>
              <KeyHint>N</KeyHint>
            </Button>
          </div>

          {submit.isPending && (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Submitting…
            </div>
          )}
          {submit.error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive"
            >
              {submit.error instanceof Error
                ? submit.error.message
                : 'Submit failed'}
            </div>
          )}

          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {submit.isPending
              ? 'Submitting decision.'
              : `Reviewing response ${withinDone + 1} of ${withinTotal}. Press Y to approve or N to reject.`}
          </div>
        </div>
      </section>
    </ParticipantShell>
  );
}
