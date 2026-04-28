import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowRight, Check } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ArenaKind } from '@/lib/arena-kind';
import { cn } from '@/lib/utils';

/**
 * First-run onboarding for operators landing on a campaign dashboard.
 *
 * Six short cards, one short headline + one explanatory subline each.
 * The shape is "index cards on a desk": a big quiet numeral anchors
 * each card, a single declarative line carries the message, and a
 * smaller subline gives the operator the concrete fact they need.
 *
 * Dismissal model: any close — X, Esc, backdrop, "Got it" — persists
 * the suppress flag in localStorage. The operator only sees the
 * onboarding once per arena kind; the Help button in the page header
 * is the always-available re-entry. This matches the operator's
 * mental model ("I closed it; it should stay gone") and removes the
 * need for an explicit "Don't show again" affordance.
 *
 * Persistence key is versioned (`v1`) so a major copy change can force
 * the whole user base to see the refreshed flow on next visit by bumping
 * to `v2`. When you bump the version, also add a one-time sweep that
 * deletes any keys with the old prefix:
 *
 *   for (const key of Object.keys(localStorage)) {
 *     if (
 *       key.startsWith('arena-onboarding-dismissed-') &&
 *       !key.startsWith(ARENA_ONBOARDING_STORAGE_PREFIX)
 *     ) localStorage.removeItem(key);
 *   }
 */

export const ARENA_ONBOARDING_STORAGE_PREFIX = 'arena-onboarding-dismissed-v1';

export function arenaOnboardingStorageKey(kind: ArenaKind): string {
  return `${ARENA_ONBOARDING_STORAGE_PREFIX}:${kind}`;
}

interface OnboardingStep {
  /** The headline — a short declarative sentence. */
  line: string;
  /** One sentence in plain language under the headline; gives the
   *  operator the concrete "what does this actually mean for me" fact
   *  the headline can't carry on its own. */
  detail: string;
}

interface OnboardingContent {
  /** Friendly label for the arena kind, used in the sr-only title. */
  label: string;
  steps: OnboardingStep[];
}

/** 6 boilerplate cards for arena kinds whose copy hasn't shipped yet.
 *  Keeps the renderer kind-agnostic and gives the next session a single
 *  point of edit when the prompt / system-prompt arenas land. */
const placeholderSteps = (label: string): OnboardingStep[] =>
  Array.from({ length: 6 }, (_, i) => ({
    // TODO: copy lands when arena mode ships
    line: `Placeholder — ${label.toLowerCase()} card ${i + 1}.`,
    // TODO: copy lands when arena mode ships
    detail: 'Placeholder detail line — replace when copy lands.',
  }));

const ONBOARDING_CONTENT: Record<ArenaKind, OnboardingContent> = {
  model: {
    label: 'Model arena',
    steps: [
      {
        line: 'Many AI models.',
        detail:
          'You pick the lineup — GPT-4, Claude, Gemini, anything on OpenRouter.',
      },
      {
        line: 'The same prompts.',
        detail: 'You write the questions; every model answers every one.',
      },
      {
        line: 'Voters pick the winner.',
        detail:
          'Share a link. Voters see two answers and click the better one.',
      },
      {
        line: 'Anonymous comparisons.',
        detail: 'Voters never know which model wrote which answer.',
      },
      {
        line: 'The best rise to the top.',
        detail: 'Votes turn into a leaderboard you can sort and export.',
      },
      {
        line: 'Activate · Share · Watch.',
        detail: 'Open voting, send the link, watch results come in.',
      },
    ],
  },
  prompt: {
    label: 'Prompt arena',
    steps: [
      {
        line: 'Many prompt variants.',
        detail:
          'You write the candidates — different phrasings, different framings, side by side.',
      },
      {
        line: 'The same model.',
        detail: 'You pin one model; every variant runs through it.',
      },
      {
        line: 'Voters pick the winner.',
        detail:
          'Share a link. Voters see the answers and click the better one.',
      },
      {
        line: 'Anonymous comparisons.',
        detail: 'Voters never know which variant produced which answer.',
      },
      {
        line: 'The best phrasing rises to the top.',
        detail: 'Votes turn into a leaderboard you can sort and export.',
      },
      {
        line: 'Activate · Share · Watch.',
        detail: 'Open voting, send the link, watch results come in.',
      },
    ],
  },
  // TODO: copy lands when arena mode ships
  system_prompt: {
    label: 'System-prompt arena',
    steps: placeholderSteps('System-prompt arena'),
  },
};

/** Lifecycle events the parent can subscribe to for analytics. Names
 *  are stable; props are typed loosely so adding new fields later
 *  doesn't churn the contract. */
export type ArenaOnboardingEvent =
  | 'shown'
  | 'step_advanced'
  | 'step_back'
  | 'completed'
  | 'skipped'
  | 'reopened';

export interface ArenaOnboardingProps {
  kind: ArenaKind;
  /** Controls visibility. Parent decides when to mount based on the
   *  dismissed flag (first-visit) or an on-demand trigger (Help button). */
  open: boolean;
  /** Called when the modal closes for any reason. The parent is
   *  responsible for persisting the dismissed flag — this component
   *  just signals "I'm done." */
  onDismiss: () => void;
  /** Optional ref to the trigger element (the Help button) so focus
   *  restores there after dismiss instead of falling to <body>. Only
   *  matters when the modal opened via auto-open with no clicked
   *  trigger; for click-triggered opens Base UI restores naturally. */
  triggerRef?: RefObject<HTMLElement | null>;
  /** Optional analytics hook — wire to whatever client-side telemetry
   *  the project adopts. Component fires events at known transitions. */
  onEvent?: (event: ArenaOnboardingEvent, props?: Record<string, unknown>) => void;
}

/** Shared classes for the two raw-button text links (Back / Next).
 *  These are deliberately not the project's `<Button>` component —
 *  text-link weight is the entire point of the new design. */
const TEXT_LINK_CLASS =
  'rounded-sm text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:underline focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-muted-foreground';

export function ArenaOnboarding({
  kind,
  open,
  onDismiss,
  triggerRef,
  onEvent,
}: ArenaOnboardingProps) {
  const content = ONBOARDING_CONTENT[kind];
  const [stepIndex, setStepIndex] = useState(0);
  // Initial focus target — the primary action (Next text-link or the
  // Got-it button on the final card). Keeps first-keystroke Enter on
  // the constructive path, not on the X close.
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  // Tracks the previous open value so we only fire `shown` on the
  // closed→open transition (not on every re-render while open).
  const wasOpenRef = useRef(false);
  // Tracks the previous "is final card" boolean so we can refocus the
  // primary action when crossing the boundary between intermediate
  // steps (Next text-link) and the final card (Got-it filled button).
  // Without this, React's reconciler unmounts one element type and
  // mounts another, dropping focus to <body>.
  const wasLastRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setStepIndex(0);
      onEvent?.('shown', { kind });
    }
    wasOpenRef.current = open;
  }, [open, kind, onEvent]);

  const total = content.steps.length;
  const step = content.steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === total - 1;

  useEffect(() => {
    if (!open) return;
    if (isLast !== wasLastRef.current) {
      // Boundary crossed (intermediate ↔ final). The conditional
      // rendering swaps button element types, so React loses focus.
      // Restore it to the freshly-mounted primary action.
      primaryActionRef.current?.focus();
    }
    wasLastRef.current = isLast;
  }, [open, isLast]);

  const handleClose = (reason: 'completed' | 'skipped') => {
    onEvent?.(reason, { kind, atStep: stepIndex + 1 });
    onDismiss();
  };

  const handleNext = () => {
    onEvent?.('step_advanced', {
      kind,
      from: stepIndex + 1,
      to: stepIndex + 2,
    });
    setStepIndex((i) => Math.min(total - 1, i + 1));
  };

  const handleBack = () => {
    onEvent?.('step_back', {
      kind,
      from: stepIndex + 1,
      to: stepIndex,
    });
    setStepIndex((i) => Math.max(0, i - 1));
  };

  const stepLineId = `arena-onboarding-step-line-${stepIndex}`;

  // Big anchor at top-left: a quiet numeral on intermediate cards, a
  // Check glyph on the final card. Both occupy the same visual slot
  // so the rhythm holds across the whole stack.
  const marker = isLast ? (
    <Check className="size-9 sm:size-12" strokeWidth={1.25} />
  ) : (
    (stepIndex + 1).toString().padStart(2, '0')
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        // X / Esc / backdrop all funnel here. Treated as a "skipped"
        // event but always persists — the parent doesn't have the
        // information to differentiate, and the operator's mental
        // model is "I closed it; it should stay gone."
        handleClose('skipped');
      }}
    >
      <DialogContent
        showCloseButton={true}
        // p-8 on desktop earns the breathing room the design wants;
        // p-6 keeps mobile from feeling sparse.
        className="relative p-6 sm:max-w-lg sm:p-8 motion-reduce:animate-none"
        aria-describedby={stepLineId}
        initialFocus={primaryActionRef}
        finalFocus={triggerRef}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' && !isLast) {
            e.preventDefault();
            handleNext();
          } else if (e.key === 'ArrowLeft' && !isFirst) {
            e.preventDefault();
            handleBack();
          }
        }}
      >
        {/* SR-only title — the visual design has no header, but Base
            UI's Dialog needs an accessible name. Keeps SR users oriented
            without adding chrome for sighted users. */}
        <DialogTitle className="sr-only">
          How a {content.label.toLowerCase()} works
        </DialogTitle>

        {/* Body region: number (or check) + headline + detail subline.
            The aria-live wrapper ensures SR users hear the headline +
            detail on each transition. */}
        <div
          aria-live="polite"
          className="flex flex-col gap-3 sm:gap-4"
        >
          <div
            key={`marker-${stepIndex}`}
            aria-hidden="true"
            className="font-heading text-4xl font-light tabular-nums text-foreground/80 animate-in fade-in-0 duration-150 motion-reduce:animate-none sm:text-5xl"
          >
            {marker}
          </div>
          <div
            key={`content-${stepIndex}`}
            className="flex flex-col gap-1.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-150 [animation-delay:60ms] motion-reduce:animate-none"
          >
            <p
              id={stepLineId}
              className="text-lg font-normal leading-snug text-foreground sm:text-xl"
            >
              {step.line}
            </p>
            <p className="text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
              {step.detail}
            </p>
          </div>
        </div>

        {/* Footer: minimal. Back text-link on the left (greyed on
            card 1), Next text-link OR Got-it button on the right.
            The bottom-right counter floats outside this row. */}
        <div className="mt-10 flex items-end justify-between sm:mt-12">
          <button
            type="button"
            onClick={handleBack}
            disabled={isFirst}
            className={TEXT_LINK_CLASS}
          >
            ← Back
          </button>

          {isLast ? (
            <Button
              ref={primaryActionRef}
              type="button"
              variant="default"
              size="sm"
              onClick={() => handleClose('completed')}
            >
              Got it
              <ArrowRight className="size-3.5" />
            </Button>
          ) : (
            <button
              ref={primaryActionRef}
              type="button"
              onClick={handleNext}
              className={cn(TEXT_LINK_CLASS, 'pr-12')}
              // pr-12 reserves room for the bottom-right counter so
              // Next never visually crowds the "01 / 06" marker.
            >
              Next →
            </button>
          )}
        </div>

        {/* Bottom-right step counter. Absolutely positioned in the
            corner — peer to the X-close in the top corner. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 right-4 font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-muted-foreground/70 sm:bottom-4 sm:right-6"
        >
          {(stepIndex + 1).toString().padStart(2, '0')} /{' '}
          {total.toString().padStart(2, '0')}
        </span>
      </DialogContent>
    </Dialog>
  );
}
