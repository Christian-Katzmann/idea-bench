import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { ParticipantShell } from '../layout/participant-shell';
import { PromptDisplay } from '../prompt/PromptDisplay';
import { Button } from '../ui/button';
import { apiFetch, type SliderStep } from '../../lib/api';

/**
 * Slider step view — participant rates one model's output on an N-point
 * scale. The server hands us one `target` at a time; after we submit, the
 * query invalidates and the next model (or next prompt) appears.
 *
 * Keyboard shortcuts: digits 1..9 map to scores within the configured
 * range; Enter submits the current score. The UI always reflects
 * `modeConfig` bounds (default 1..10 when the prompt has no explicit
 * config).
 */
export function SliderStepView({
  step,
  slug,
}: {
  step: SliderStep;
  slug: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const min = step.modeConfig?.min ?? 1;
  const max = step.modeConfig?.max ?? 10;
  const defaultScore = Math.round((min + max) / 2);

  // Reset the local score whenever we move to a new (prompt, model) pair.
  const targetKey = `${step.prompt.id}:${step.target.campaignModelId}`;
  const [score, setScore] = useState<number>(defaultScore);
  useEffect(() => {
    setScore(defaultScore);
    // Intentional: reset on every new step, not on score change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  const submit = useMutation({
    mutationFn: async (value: number) =>
      apiFetch<{ ok: true }>(`/api/vote/${slug}/submit-slider`, {
        method: 'POST',
        body: JSON.stringify({
          promptId: step.prompt.id,
          campaignModelId: step.target.campaignModelId,
          generationId: step.target.generation.id,
          score: value,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vote-next', slug] });
    },
  });

  const handleSubmit = useCallback(() => {
    if (submit.isPending) return;
    submit.mutate(score);
  }, [submit, score]);

  // Keyboard: digits set score (1..9 → literal, 0 → min if min=0 else max cap).
  // Enter submits.
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
      if (Number.isInteger(digit) && digit >= 0 && digit <= 9) {
        // Map: 1..9 → clamp to [min, max]; 0 → max if min≥1, else min.
        // This gives the voter a practical numeric shortcut on 1..10 scales.
        let candidate: number;
        if (digit === 0) candidate = min >= 1 ? 10 : min;
        else candidate = digit;
        if (candidate < min) candidate = min;
        if (candidate > max) candidate = max;
        setScore(candidate);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSubmit, min, max]);

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
        Rate response {withinDone + 1} of {withinTotal} for this prompt
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

          <SliderRating
            min={min}
            max={max}
            value={score}
            onChange={setScore}
            minLabel={step.modeConfig?.minLabel}
            maxLabel={step.modeConfig?.maxLabel}
            disabled={submit.isPending}
          />

          <Button
            onClick={handleSubmit}
            disabled={submit.isPending}
            size="lg"
            className="w-full justify-center gap-2"
          >
            {submit.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Submitting…
              </>
            ) : (
              <>
                Submit rating ({score})
              </>
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
              ? 'Submitting rating.'
              : `Rating response ${withinDone + 1} of ${withinTotal}. Current score ${score} of ${max}.`}
          </div>
        </div>
      </section>
    </ParticipantShell>
  );
}

/**
 * The slider control itself — a styled `<input type="range">` plus a
 * row of ticks with labeled extremes. Kept small and native-feeling
 * rather than trying to reinvent the control.
 */
function SliderRating({
  min,
  max,
  value,
  onChange,
  minLabel,
  maxLabel,
  disabled,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  minLabel?: string;
  maxLabel?: string;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Your rating
        </span>
        <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">
          {value}
          <span className="ml-1 text-sm text-muted-foreground">/ {max}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-border accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Rating"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span className="flex flex-col items-start">
          <span className="font-mono tabular-nums">{min}</span>
          {minLabel && <span className="text-[10px] uppercase">{minLabel}</span>}
        </span>
        <span className="flex flex-col items-end">
          <span className="font-mono tabular-nums">{max}</span>
          {maxLabel && <span className="text-[10px] uppercase">{maxLabel}</span>}
        </span>
      </div>
    </div>
  );
}
