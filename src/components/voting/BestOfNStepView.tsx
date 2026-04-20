import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, X } from 'lucide-react';
import { ParticipantShell } from '../layout/participant-shell';
import { PromptDisplay } from '../prompt/PromptDisplay';
import { Button } from '../ui/button';
import { apiFetch, type BestOfNStep } from '../../lib/api';
import { cn } from '../../lib/utils';

/**
 * Best-of-N step view — all N outputs shown at once, participant picks
 * one winner. The order of targets is the server-side order (stable for
 * the lifetime of the response but not necessarily sorted by anything
 * semantic). Models are never labeled by name on the voter surface.
 *
 * Keyboard shortcuts: digits 1..N select the corresponding card;
 * Enter submits the current selection.
 */
export function BestOfNStepView({
  step,
  slug,
}: {
  step: BestOfNStep;
  slug: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Reset selection on new prompt.
  useEffect(() => {
    setSelectedIdx(null);
  }, [step.prompt.id]);

  const submit = useMutation({
    mutationFn: async (idx: number) => {
      const target = step.targets[idx];
      if (!target) throw new Error('invalid selection');
      return apiFetch<{ ok: true }>(`/api/vote/${slug}/submit-best-of-n`, {
        method: 'POST',
        body: JSON.stringify({
          promptId: step.prompt.id,
          chosenCampaignModelId: target.campaignModelId,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vote-next', slug] });
    },
  });

  const handleSubmit = useCallback(() => {
    if (selectedIdx === null || submit.isPending) return;
    submit.mutate(selectedIdx);
  }, [selectedIdx, submit]);

  // Keyboard: digits pick; Enter submits.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
        return;
      }
      const digit = Number(e.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= step.targets.length) {
        setSelectedIdx(digit - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSubmit, step.targets.length]);

  const promptsTotal = step.progress.promptsTotal;
  const promptsCurrent = Math.min(step.progress.promptsDone + 1, promptsTotal);
  const progressPct =
    promptsTotal > 0
      ? Math.round(((step.progress.promptsDone + 0.5) / promptsTotal) * 100)
      : 0;

  const shellLabel = (
    <>
      <span className="hidden sm:inline">
        Pick the best response
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
      contentClassName="flex flex-col"
    >
      <section className="border-b border-border bg-card px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-2.5">
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

      <section className="flex-1 bg-background px-4 pt-6 pb-28 md:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {step.targets.map((target, idx) => {
              const selected = selectedIdx === idx;
              return (
                <button
                  key={target.campaignModelId}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  className={cn(
                    'flex flex-col overflow-hidden rounded-xl border text-left shadow-sm transition-all',
                    selected
                      ? 'border-foreground ring-2 ring-foreground/20'
                      : 'border-border hover:border-foreground/40',
                  )}
                  aria-pressed={selected}
                >
                  <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface-highlight/40 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex size-5 items-center justify-center rounded-md font-mono text-[11px] font-semibold',
                          selected
                            ? 'bg-foreground text-background'
                            : 'bg-surface-highlight text-foreground',
                        )}
                      >
                        {idx + 1}
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        Response {idx + 1}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {target.generation.tokensOut != null
                        ? target.generation.tokensOut.toLocaleString()
                        : '—'}
                      <span className="ml-1 opacity-70">tokens</span>
                    </span>
                  </header>
                  <div className="whitespace-pre-wrap px-4 py-4 text-[14px] leading-[1.65] text-foreground">
                    {target.generation.output}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded-xl border border-border bg-card/95 p-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {selectedIdx === null
                  ? 'Pick one response to continue.'
                  : `You picked response ${selectedIdx + 1}.`}
              </span>
              <Button
                onClick={handleSubmit}
                disabled={selectedIdx === null || submit.isPending}
                size="lg"
                className="gap-2"
              >
                {submit.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Submitting…
                  </>
                ) : (
                  <>
                    <Check className="size-4" /> Submit pick
                  </>
                )}
              </Button>
            </div>
            {submit.error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {submit.error instanceof Error
                  ? submit.error.message
                  : 'Submit failed'}
              </div>
            )}
          </div>

          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {submit.isPending
              ? 'Submitting pick.'
              : selectedIdx === null
              ? `Pick one of ${step.targets.length} responses.`
              : `Response ${selectedIdx + 1} selected. Press Enter to submit.`}
          </div>
        </div>
      </section>
    </ParticipantShell>
  );
}
