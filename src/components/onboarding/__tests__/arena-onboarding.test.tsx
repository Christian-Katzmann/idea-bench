import { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ArenaOnboarding,
  arenaOnboardingStorageKey,
  type ArenaOnboardingEvent,
} from '../arena-onboarding';
import type { ArenaKind } from '@/lib/arena-kind';

/**
 * Test harness mirroring the CampaignDashboard wiring:
 *  - Renders a "How it works" trigger that mounts the modal on click.
 *  - Reads the dismissed flag on first mount and auto-opens.
 *  - Persists the flag on every dismiss (matches the production
 *    parent's contract — closing the modal is itself the suppression).
 *  - Wires the Help button as the focus-restoration target.
 */
function Harness({
  kind = 'model' as ArenaKind,
  onEvent,
}: {
  kind?: ArenaKind;
  onEvent?: (e: ArenaOnboardingEvent, props?: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(() => {
    return !window.localStorage.getItem(arenaOnboardingStorageKey(kind));
  });
  const helpRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={helpRef}
        type="button"
        aria-label="Show arena onboarding"
        onClick={() => setOpen(true)}
      >
        How it works
      </button>
      <ArenaOnboarding
        kind={kind}
        open={open}
        triggerRef={helpRef}
        onEvent={onEvent}
        onDismiss={() => {
          setOpen(false);
          window.localStorage.setItem(
            arenaOnboardingStorageKey(kind),
            new Date().toISOString(),
          );
        }}
      />
    </>
  );
}

const TOTAL_CARDS = 6;

/** Walks the user from the current card to the target card by
 *  repeatedly clicking the Next text-link. */
async function advanceTo(
  user: ReturnType<typeof userEvent.setup>,
  fromStep: number,
  targetStep: number,
) {
  for (let i = fromStep; i < targetStep; i++) {
    await user.click(screen.getByRole('button', { name: /^next →$/i }));
  }
}

describe('ArenaOnboarding', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the headline + detail subline pair on every card', async () => {
    const user = userEvent.setup();
    render(<Harness kind="model" />);

    // Card 1
    expect(await screen.findByText('Many AI models.')).toBeInTheDocument();
    expect(
      screen.getByText(
        /you pick the lineup — gpt-4, claude, gemini, anything on openrouter\./i,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^next →$/i }));

    // Card 2
    expect(screen.getByText('The same prompts.')).toBeInTheDocument();
    expect(
      screen.getByText(/you write the questions; every model answers every one\./i),
    ).toBeInTheDocument();
  });

  it('walks through all six cards and persists dismissal when "Got it" is clicked', async () => {
    const user = userEvent.setup();
    render(<Harness kind="model" />);

    expect(
      await screen.findByRole('heading', {
        name: /how a model arena works/i,
      }),
    ).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Many AI models.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^← back$/i })).toBeDisabled();

    await advanceTo(user, 1, TOTAL_CARDS);

    expect(within(dialog).getByText('Activate · Share · Watch.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /^got it$/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: /how a model arena works/i,
        }),
      ).not.toBeInTheDocument();
    });
    // Got it persists — operator won't see the modal next time.
    expect(
      window.localStorage.getItem(arenaOnboardingStorageKey('model')),
    ).not.toBeNull();
  });

  it('persists on X-close too, so reopening the dashboard does not auto-open the modal again', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness kind="model" />);

    await screen.findByRole('heading', { name: /how a model arena works/i });

    // Top-right X close (sr-only label "Close").
    await user.click(screen.getByRole('button', { name: /^close$/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: /how a model arena works/i,
        }),
      ).not.toBeInTheDocument();
    });
    // Closing via X persists too — this is the fix for "it keeps
    // appearing every time I open the dashboard."
    expect(
      window.localStorage.getItem(arenaOnboardingStorageKey('model')),
    ).not.toBeNull();

    // Simulate the operator returning to the dashboard later. The
    // modal should NOT auto-open because the previous X-close
    // persisted the flag.
    unmount();
    render(<Harness kind="model" />);
    expect(
      screen.queryByRole('heading', {
        name: /how a model arena works/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('Help button re-opens the onboarding even after a previous dismissal', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      arenaOnboardingStorageKey('model'),
      new Date().toISOString(),
    );

    render(<Harness kind="model" />);

    expect(
      screen.queryByRole('heading', {
        name: /how a model arena works/i,
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /show arena onboarding/i }),
    );

    expect(
      await screen.findByRole('heading', {
        name: /how a model arena works/i,
      }),
    ).toBeInTheDocument();
    // Re-opens at card 1.
    expect(screen.getByText('Many AI models.')).toBeInTheDocument();
  });

  it('places initial focus on the primary action (Next), not on a destructive close', async () => {
    render(<Harness kind="model" />);

    await screen.findByRole('heading', { name: /how a model arena works/i });

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: /^next →$/i }),
      );
    });
  });

  it('keyboard arrows advance and retreat through cards', async () => {
    render(<Harness kind="model" />);

    await screen.findByRole('heading', { name: /how a model arena works/i });
    expect(screen.getByText('Many AI models.')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(screen.getByText('The same prompts.')).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(screen.getByText('Voters pick the winner.')).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(screen.getByText('The same prompts.')).toBeInTheDocument();
  });

  it('uses a kind-scoped localStorage key so dismissing one kind does not affect another', () => {
    expect(arenaOnboardingStorageKey('model')).toBe(
      'arena-onboarding-dismissed-v1:model',
    );
    expect(arenaOnboardingStorageKey('prompt')).toBe(
      'arena-onboarding-dismissed-v1:prompt',
    );
    expect(arenaOnboardingStorageKey('system_prompt')).toBe(
      'arena-onboarding-dismissed-v1:system_prompt',
    );
  });

  it('renders six placeholder cards for not-yet-shipped arena kinds without crashing', () => {
    render(<Harness kind="prompt" />);
    expect(
      screen.getByRole('heading', { name: /how a prompt arena works/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^01\s*\/\s*06$/i)).toBeInTheDocument();
  });

  it('does not auto-open when the dismissed flag is already set', () => {
    window.localStorage.setItem(
      arenaOnboardingStorageKey('model'),
      new Date().toISOString(),
    );
    const onDismiss = vi.fn();
    render(
      <ArenaOnboarding kind="model" open={false} onDismiss={onDismiss} />,
    );
    expect(
      screen.queryByRole('heading', {
        name: /how a model arena works/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('fires lifecycle events for shown / step_advanced / completed', async () => {
    const user = userEvent.setup();
    const events: Array<{ name: ArenaOnboardingEvent; props?: unknown }> = [];
    render(
      <Harness
        kind="model"
        onEvent={(name, props) => {
          events.push({ name, props });
        }}
      />,
    );

    await screen.findByRole('heading', { name: /how a model arena works/i });
    await advanceTo(user, 1, TOTAL_CARDS);
    await user.click(screen.getByRole('button', { name: /^got it$/i }));

    const names = events.map((e) => e.name);
    expect(names).toEqual([
      'shown',
      'step_advanced',
      'step_advanced',
      'step_advanced',
      'step_advanced',
      'step_advanced',
      'completed',
    ]);
    expect(events.at(-1)?.props).toMatchObject({
      kind: 'model',
      atStep: TOTAL_CARDS,
    });
  });
});
