import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowRight, Check } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * First-run onboarding for operators landing on the Campaigns home
 * with no campaigns yet. Mirrors the visual language of arena-onboarding
 * (one declarative line + a concrete subline per card, quiet numerals,
 * 6 cards) but covers the operator's *first* journey through the
 * product — what ModelArena is, what a campaign is, and how the loop
 * runs end-to-end.
 *
 * Why a sibling component instead of extending arena-onboarding: the
 * arena variants live inside an already-created campaign and explain
 * how that specific arena kind works. This explains the operator's
 * own first traversal — different audience, different content shape,
 * different storage key. Keeping them separate avoids forcing
 * arena-onboarding's `kind` axis to also encode "first-time" mode.
 *
 * Dismissal model: any close — X, Esc, backdrop, "Got it" — persists
 * the suppress flag in localStorage. Help button in OperatorHome is
 * the always-available re-entry point.
 *
 * Persistence key is versioned (`v1`) so a major copy change can
 * force the whole user base to see the refreshed flow on next visit
 * by bumping to `v2`. Sweep old keys at that point — see
 * arena-onboarding for the pattern.
 */

export const OPERATOR_ONBOARDING_STORAGE_KEY =
  'operator-onboarding-dismissed-v1';

interface OnboardingStep {
  /** The headline — a short declarative sentence. */
  line: string;
  /** One sentence in plain language under the headline. */
  detail: string;
}

const STEPS: OnboardingStep[] = [
  {
    line: 'Welcome to ModelArena.',
    detail:
      'A blind evaluation platform for AI models, prompts, and system prompts. Pick what to test; let real voters decide what wins.',
  },
  {
    line: 'A campaign is one evaluation.',
    detail:
      'You set the question — which model? which prompt? — and the contestants. The platform handles the matchups.',
  },
  {
    line: 'Three arena kinds.',
    detail:
      'Vary the model (head-to-head between AIs), the prompt (which phrasing wins), or the system prompt (which persona wins). Pick one per campaign.',
  },
  {
    line: 'Generate before you launch.',
    detail:
      'ModelArena pre-generates every contestant’s answer for every prompt. Voting is fast and fair because outputs are cached.',
  },
  {
    line: 'Share a link. Watch the leaderboard.',
    detail:
      'Anyone with the link can vote anonymously. Bradley-Terry ratings, win rates, and recent vote pulse update live as people weigh in.',
  },
  {
    line: 'You stay in control.',
    detail:
      'Pause, edit, recompute, or close a campaign anytime. Personas, simulated runs, and exports are one click from the dashboard.',
  },
];

export type OperatorOnboardingEvent =
  | 'shown'
  | 'step_advanced'
  | 'step_back'
  | 'completed'
  | 'skipped'
  | 'reopened';

export interface OperatorOnboardingProps {
  open: boolean;
  /** Called when the modal closes for any reason. The parent persists
   *  the dismissed flag — this component just signals "I'm done." */
  onDismiss: () => void;
  /** Optional ref to the trigger element (the Help button) so focus
   *  restores there after dismiss instead of falling to <body>. */
  triggerRef?: RefObject<HTMLElement | null>;
  onEvent?: (
    event: OperatorOnboardingEvent,
    props?: Record<string, unknown>,
  ) => void;
}

const TEXT_LINK_CLASS =
  'rounded-sm text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:underline focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-muted-foreground';

export function OperatorOnboarding({
  open,
  onDismiss,
  triggerRef,
  onEvent,
}: OperatorOnboardingProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const wasLastRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setStepIndex(0);
      onEvent?.('shown');
    }
    wasOpenRef.current = open;
  }, [open, onEvent]);

  const total = STEPS.length;
  const step = STEPS[stepIndex];
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
    onEvent?.(reason, { atStep: stepIndex + 1 });
    onDismiss();
  };

  const handleNext = () => {
    onEvent?.('step_advanced', { from: stepIndex + 1, to: stepIndex + 2 });
    setStepIndex((i) => Math.min(total - 1, i + 1));
  };

  const handleBack = () => {
    onEvent?.('step_back', { from: stepIndex + 1, to: stepIndex });
    setStepIndex((i) => Math.max(0, i - 1));
  };

  const stepLineId = `operator-onboarding-step-line-${stepIndex}`;
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
        handleClose('skipped');
      }}
    >
      <DialogContent
        showCloseButton={true}
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
        <DialogTitle className="sr-only">
          How ModelArena works
        </DialogTitle>

        <div aria-live="polite" className="flex flex-col gap-3 sm:gap-4">
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
            >
              Next →
            </button>
          )}
        </div>

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
