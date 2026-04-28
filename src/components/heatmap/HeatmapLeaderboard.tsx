/**
 * Plan 06 P2-A — heatmap leaderboard for system-prompt arenas.
 *
 * Pure presentational. Rows are variants; columns are suite prompts.
 * Each cell shows the mean slider score with a coloured background
 * encoding which 5-step bucket the score falls into.
 *
 * Why discrete 5-step palette over a continuous gradient: per the
 * PRD's "don't manufacture a single winner if the data doesn't
 * support one" framing, gradients trick the eye into seeing precision
 * that isn't there. Buckets are honest about how confident the
 * comparison really is.
 *
 * Sparse-cell handling: a cell with no responses renders greyed-out
 * with a "—" — never a 0. Operators distinguish "this combination
 * hasn't been voted on" from "this combination scored zero".
 */
import { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';

export interface HeatmapVariant {
  id: string;
  displayName: string;
}

export interface HeatmapPrompt {
  id: string;
  /** Operator-facing label (often the prompt's first line, truncated). */
  label: string;
  /** Full prompt text shown in the column-header tooltip. */
  text: string;
  orderIndex: number;
}

export interface HeatmapCell {
  variantId: string;
  promptId: string;
  /** Mean score for this (variant, prompt) cell. */
  score: number;
  /** Lower 95% CI bound. Null when sample size < 2. */
  ciLow: number | null;
  /** Upper 95% CI bound. Null when sample size < 2. */
  ciHigh: number | null;
  sampleSize: number;
}

export interface HeatmapScoreRange {
  /** Inclusive lower bound of the slider range. */
  min: number;
  /** Inclusive upper bound. */
  max: number;
}

export interface HeatmapLeaderboardProps {
  variants: HeatmapVariant[];
  suitePrompts: HeatmapPrompt[];
  cells: HeatmapCell[];
  /**
   * Score-range bounds the colour mapping normalises against. Defaults
   * to slider's standard 1–10 if omitted.
   */
  scoreRange?: HeatmapScoreRange;
  /**
   * Optional click handler for the "View generation" link inside each
   * cell's tooltip. Receives the cell's `variantId` and `promptId`.
   * When omitted, no link is rendered (the tooltip stays informational).
   */
  onViewGeneration?: (input: { variantId: string; promptId: string }) => void;
}

const DEFAULT_RANGE: HeatmapScoreRange = { min: 1, max: 10 };

/**
 * Five discrete colour buckets. Tailwind classes pulled from the
 * existing palette so the heatmap stays on-theme in light + dark mode.
 * The neutral middle bucket is intentionally muted — operators
 * naturally focus on the red/green extremes, which is the right
 * default for "where does this variant excel or break" reading.
 */
const BUCKET_CLASS = [
  'bg-destructive/20 text-foreground', // 0.0  – 0.22
  'bg-destructive/10 text-foreground', // 0.22 – 0.44
  'bg-card text-muted-foreground',     // 0.44 – 0.61
  'bg-success/15 text-foreground',     // 0.61 – 0.78
  'bg-success/30 text-foreground',     // 0.78 – 1.0
] as const;
const BUCKET_BREAKPOINTS = [0.22, 0.44, 0.61, 0.78];

/**
 * Map a normalised [0, 1] score to one of 5 colour buckets.
 * Out-of-range scores (e.g., a slider 1–10 cell at 11) clamp.
 */
function bucketIndex(normalised: number): number {
  for (let i = 0; i < BUCKET_BREAKPOINTS.length; i++) {
    if (normalised < BUCKET_BREAKPOINTS[i]) return i;
  }
  return BUCKET_CLASS.length - 1;
}

export function HeatmapLeaderboard({
  variants,
  suitePrompts,
  cells,
  scoreRange = DEFAULT_RANGE,
  onViewGeneration,
}: HeatmapLeaderboardProps) {
  // Index cells by (variantId, promptId) so the grid lookup is O(1)
  // per render. Variants × prompts can hit ~120 cells in V1 (4 × 30);
  // a flat scan would still be fast, but the lookup makes the empty-
  // cell branch (P2-3) trivial.
  const cellIndex = useMemo(() => {
    const m = new Map<string, HeatmapCell>();
    for (const cell of cells) {
      m.set(`${cell.variantId}::${cell.promptId}`, cell);
    }
    return m;
  }, [cells]);

  const sortedPrompts = useMemo(
    () => [...suitePrompts].sort((a, b) => a.orderIndex - b.orderIndex),
    [suitePrompts],
  );

  if (variants.length === 0 || sortedPrompts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
        Heatmap fills in once at least one variant and one suite prompt
        have responses.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table
        className="w-full border-separate border-spacing-0 text-sm"
        role="grid"
        aria-label="Per-prompt variant scores"
      >
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 bg-card px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              Variant
            </th>
            {sortedPrompts.map((prompt) => (
              <th
                key={prompt.id}
                scope="col"
                title={prompt.text}
                className="max-w-[10rem] truncate border-l border-border px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                {prompt.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => (
            <tr key={variant.id}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-t border-border bg-card px-4 py-3 text-left align-top text-[12px] font-medium text-foreground"
              >
                {variant.displayName}
              </th>
              {sortedPrompts.map((prompt) => {
                const cell = cellIndex.get(`${variant.id}::${prompt.id}`);
                return (
                  <HeatmapCellView
                    key={`${variant.id}::${prompt.id}`}
                    cell={cell ?? null}
                    variant={variant}
                    prompt={prompt}
                    scoreRange={scoreRange}
                    onViewGeneration={onViewGeneration}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeatmapCellView({
  cell,
  variant,
  prompt,
  scoreRange,
  onViewGeneration,
}: {
  cell: HeatmapCell | null;
  variant: HeatmapVariant;
  prompt: HeatmapPrompt;
  scoreRange: HeatmapScoreRange;
  onViewGeneration?: (input: { variantId: string; promptId: string }) => void;
}) {
  const [hoverOpen, setHoverOpen] = useState(false);

  // P2-3 — sparse: no responses → greyed cell, never inferred 0.
  if (!cell || cell.sampleSize === 0) {
    return (
      <td
        className="border-l border-t border-border bg-surface-highlight/20 px-3 py-3 text-center text-[12px] font-mono text-muted-foreground/50"
        aria-label={`${variant.displayName} on ${prompt.label}: no responses yet`}
      >
        —
      </td>
    );
  }

  const range = Math.max(scoreRange.max - scoreRange.min, 1);
  const normalised = Math.max(
    0,
    Math.min(1, (cell.score - scoreRange.min) / range),
  );
  const bucket = bucketIndex(normalised);
  const bucketClass = BUCKET_CLASS[bucket];

  const ciLabel =
    cell.ciLow != null && cell.ciHigh != null
      ? `${cell.ciLow.toFixed(1)} – ${cell.ciHigh.toFixed(1)}`
      : 'n < 2';

  return (
    <td
      className={cn(
        'relative border-l border-t border-border px-3 py-3 text-center align-middle text-[12px] font-mono tabular-nums transition-colors',
        bucketClass,
      )}
      aria-label={`${variant.displayName} on ${prompt.label}: ${cell.score.toFixed(1)}, ${cell.sampleSize} response${cell.sampleSize === 1 ? '' : 's'}`}
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
      onFocus={() => setHoverOpen(true)}
      onBlur={() => setHoverOpen(false)}
      tabIndex={0}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-sm font-semibold">
          {cell.score.toFixed(1)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          n={cell.sampleSize}
        </span>
      </div>
      {hoverOpen && (
        <div
          role="tooltip"
          className="absolute left-1/2 top-full z-20 mt-1 flex min-w-[14rem] -translate-x-1/2 flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2 text-left text-[11px] leading-snug shadow-lg"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold text-foreground">
              {variant.displayName}
            </span>
            <span className="font-mono text-foreground">
              {cell.score.toFixed(2)}
            </span>
          </div>
          <div className="text-muted-foreground" title={prompt.text}>
            {prompt.label}
          </div>
          <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
            <span>95% CI</span>
            <span className="font-mono">{ciLabel}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
            <span>Sample</span>
            <span className="font-mono">n = {cell.sampleSize}</span>
          </div>
          {onViewGeneration && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewGeneration({
                  variantId: variant.id,
                  promptId: prompt.id,
                });
              }}
              className="mt-1 self-start text-[11px] font-medium uppercase tracking-wide text-foreground underline-offset-2 hover:underline"
            >
              View generation →
            </button>
          )}
        </div>
      )}
    </td>
  );
}
