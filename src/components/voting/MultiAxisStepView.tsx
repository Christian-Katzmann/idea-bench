import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { ParticipantShell } from '../layout/participant-shell';
import { PromptDisplay } from '../prompt/PromptDisplay';
import { Button } from '../ui/button';
import { apiFetch, type MultiAxisStep } from '../../lib/api';

/**
 * Multi-axis step view — participant rates one model's output on N
 * independent dimensions (configurable per prompt). Sliders per
 * dimension, all submitted together. Every dimension starts at the
 * midpoint; the voter must touch each slider or keep the default.
 *
 * No keyboard shortcuts for individual dimensions (would conflict with
 * each other at N>1); Enter submits the whole form.
 */
export function MultiAxisStepView({
  step,
  slug,
}: {
  step: MultiAxisStep;
  slug: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const dimensions = step.modeConfig?.dimensions ?? [];
  const targetKey = `${step.prompt.id}:${step.target.campaignModelId}`;

  // Local scores keyed by dimension.key. Reset on new target.
  const [scores, setScores] = useState<Record<string, number>>(() =>
    defaultScores(dimensions),
  );
  useEffect(() => {
    setScores(defaultScores(dimensions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  const submit = useMutation({
    mutationFn: async () =>
      apiFetch<{ ok: true }>(`/api/vote/${slug}/submit-multi-axis`, {
        method: 'POST',
        body: JSON.stringify({
          promptId: step.prompt.id,
          campaignModelId: step.target.campaignModelId,
          generationId: step.target.generation.id,
          scores,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vote-next', slug] });
    },
  });

  const handleSubmit = useCallback(() => {
    if (submit.isPending) return;
    submit.mutate();
  }, [submit]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === 'Enter') {
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
        Rate response {withinDone + 1} of {withinTotal} on {dimensions.length}{' '}
        dimensions
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

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Rate on {dimensions.length}{' '}
              dimension{dimensions.length === 1 ? '' : 's'}
            </span>
            {dimensions.length === 0 ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                This prompt has no dimensions configured — contact the
                campaign operator.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {dimensions.map((dim) => (
                  <DimensionSlider
                    key={dim.key}
                    dim={dim}
                    value={scores[dim.key] ?? midpoint(dim)}
                    onChange={(v) =>
                      setScores((prev) => ({ ...prev, [dim.key]: v }))
                    }
                    disabled={submit.isPending}
                  />
                ))}
              </div>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submit.isPending || dimensions.length === 0}
            size="lg"
            className="w-full justify-center gap-2"
          >
            {submit.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Submitting…
              </>
            ) : (
              <>Submit ratings</>
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
              ? 'Submitting ratings.'
              : `Rating response ${withinDone + 1} of ${withinTotal} on ${dimensions.length} dimensions.`}
          </div>
        </div>
      </section>
    </ParticipantShell>
  );
}

function midpoint(dim: { min: number; max: number }): number {
  return Math.round((dim.min + dim.max) / 2);
}

function defaultScores(
  dimensions: Array<{ key: string; min: number; max: number }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of dimensions) out[d.key] = midpoint(d);
  return out;
}

function DimensionSlider({
  dim,
  value,
  onChange,
  disabled,
}: {
  dim: { key: string; label: string; min: number; max: number };
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">
          {dim.label}
        </span>
        <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
          {value}
          <span className="ml-1 text-xs text-muted-foreground">
            / {dim.max}
          </span>
        </span>
      </div>
      <input
        type="range"
        min={dim.min}
        max={dim.max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-border accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={dim.label}
        aria-valuemin={dim.min}
        aria-valuemax={dim.max}
        aria-valuenow={value}
      />
      <div className="flex justify-between text-[10px] font-mono tabular-nums text-muted-foreground">
        <span>{dim.min}</span>
        <span>{dim.max}</span>
      </div>
    </div>
  );
}
