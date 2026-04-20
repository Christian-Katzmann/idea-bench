import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { ParticipantShell } from '../layout/participant-shell';
import { PromptDisplay } from '../prompt/PromptDisplay';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { ModeIndicator } from './ModeIndicator';
import { apiFetch, type QualitativeStep } from '../../lib/api';

const MAX_CHARS = 4000;

/**
 * Qualitative step view — participant leaves free-text feedback on one
 * model's output. The operator can mark the text field as required; if
 * not required, the voter can skip with a zero-length submission.
 *
 * No keyboard shortcuts (the field is typing-heavy; voters are already
 * interacting with the textarea). Cmd/Ctrl+Enter submits.
 */
export function QualitativeStepView({
  step,
  slug,
}: {
  step: QualitativeStep;
  slug: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const required = step.modeConfig?.required ?? false;
  const promptQuestion =
    step.modeConfig?.prompt ?? 'What did you think of this response?';

  const targetKey = `${step.prompt.id}:${step.target.campaignModelId}`;
  const [text, setText] = useState('');
  useEffect(() => {
    setText('');
  }, [targetKey]);

  const submit = useMutation({
    mutationFn: async () =>
      apiFetch<{ ok: true }>(`/api/vote/${slug}/submit-qualitative`, {
        method: 'POST',
        body: JSON.stringify({
          promptId: step.prompt.id,
          campaignModelId: step.target.campaignModelId,
          generationId: step.target.generation.id,
          text,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vote-next', slug] });
    },
  });

  const canSubmit =
    !submit.isPending && (!required || text.trim().length > 0);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    submit.mutate();
  }, [canSubmit, submit]);

  // Cmd/Ctrl+Enter from the textarea submits.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSubmit]);

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

  const shellLabel = (
    <>
      <span className="hidden sm:inline">
        Feedback on response {withinDone + 1} of {withinTotal}
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
      <ModeIndicator mode="qualitative" />
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

      <section className="flex-1 bg-background px-4 pt-6 pb-28 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface-highlight/40 px-4 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Response {withinDone + 1} / {withinTotal}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {step.target.generation.tokensOut != null
                  ? step.target.generation.tokensOut.toLocaleString()
                  : '—'}
                <span className="ml-1 opacity-70">tokens</span>
              </span>
            </header>
            <div className="whitespace-pre-wrap px-4 py-4 text-[14px] leading-[1.65] text-foreground">
              {step.target.generation.output}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
            <label
              htmlFor={`qual-${targetKey}`}
              className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              {promptQuestion}
              {required && (
                <span className="ml-1 normal-case text-destructive">
                  *required
                </span>
              )}
            </label>
            <Textarea
              id={`qual-${targetKey}`}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
              placeholder="Share your thoughts…"
              className="min-h-32 bg-background text-sm"
              disabled={submit.isPending}
              maxLength={MAX_CHARS}
              aria-required={required}
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>⌘+Enter to submit</span>
              <span className="font-mono tabular-nums">
                {text.length} / {MAX_CHARS}
              </span>
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            size="lg"
            className="w-full justify-center gap-2"
          >
            {submit.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Submitting…
              </>
            ) : required ? (
              'Submit feedback'
            ) : text.trim().length > 0 ? (
              'Submit feedback'
            ) : (
              'Skip'
            )}
          </Button>

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
              ? 'Submitting feedback.'
              : `Writing feedback on response ${withinDone + 1} of ${withinTotal}.`}
          </div>
        </div>
      </section>
    </ParticipantShell>
  );
}
