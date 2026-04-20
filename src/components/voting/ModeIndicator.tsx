import type { PromptMode } from '../../lib/api';

/**
 * Small mode-identifier pill rendered at the top of every voter view.
 * In mixed-mode campaigns the interaction shape changes from prompt to
 * prompt — this pill tells voters "this one is different" at a glance
 * without them having to parse the new UI to figure it out.
 *
 * Design decisions
 *   - Tiny, high contrast, placed immediately before the prompt strip
 *     so it reads as "headline" rather than "decoration".
 *   - Brief "how to respond" hint follows the mode name — a voter
 *     arriving mid-campaign shouldn't need to stop and figure out the
 *     UI if they haven't seen this mode before.
 *   - Same component used across every mode so the PLACE never changes;
 *     only the label and hint change.
 */
export function ModeIndicator({ mode }: { mode: PromptMode }) {
  const spec = MODE_SPECS[mode];
  return (
    <div className="mx-auto w-full max-w-5xl px-4 md:px-6">
      <div className="flex flex-wrap items-center gap-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <span className="inline-flex items-center rounded-full border border-border bg-surface-highlight px-2 py-0.5 text-foreground">
          {spec.label}
        </span>
        <span className="text-muted-foreground normal-case font-normal tracking-normal">
          {spec.hint}
        </span>
      </div>
    </div>
  );
}

const MODE_SPECS: Record<PromptMode, { label: string; hint: string }> = {
  tournament: {
    label: 'Tournament',
    hint: 'Pick the output you prefer for each matchup.',
  },
  slider: {
    label: 'Slider',
    hint: 'Rate each response on the scale.',
  },
  approve_reject: {
    label: 'Approve / reject',
    hint: 'Mark each response as acceptable or not.',
  },
  best_of_n: {
    label: 'Best of N',
    hint: 'Read every response, then pick one.',
  },
  multi_axis: {
    label: 'Multi-axis',
    hint: 'Score each response on every dimension.',
  },
  qualitative: {
    label: 'Qualitative',
    hint: 'Leave a short comment on each response.',
  },
};
