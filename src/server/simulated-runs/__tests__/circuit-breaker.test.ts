/**
 * Pure-function tests for the circuit-breaker contract.
 *
 * The real `trackJudgeOutcome` is internal to runner.ts; this test
 * replicates its shape as a contract. If the runner version drifts
 * (different threshold, different "hard failure" set), these tests
 * should fail first — update both sides in lockstep.
 *
 * The breaker has four invariants:
 *   - only hard failure reasons (timeout / http / network) count
 *   - parse / empty / abort outcomes are NOT counted
 *   - skipped outcomes (cross-family exclusion) are NOT counted
 *   - any 'ok' outcome resets the counter to zero
 */
import { describe, it, expect } from 'vitest';

type Reason = 'timeout' | 'http' | 'network' | 'parse' | 'empty' | 'abort';

interface Outcome {
  kind: 'ok' | 'skipped' | 'failed';
  reason?: Reason;
}

interface BreakerState {
  consecutiveFailures: { count: number };
  runAborted: { flag: boolean; reason: string };
}

const THRESHOLD = 10;

function trackJudgeOutcome(state: BreakerState, outcome: Outcome): void {
  if (outcome.kind === 'ok') {
    state.consecutiveFailures.count = 0;
    return;
  }
  if (outcome.kind !== 'failed') return;
  const hard =
    outcome.reason === 'timeout' ||
    outcome.reason === 'http' ||
    outcome.reason === 'network';
  if (!hard) return;
  state.consecutiveFailures.count += 1;
  if (
    state.consecutiveFailures.count >= THRESHOLD &&
    !state.runAborted.flag
  ) {
    state.runAborted.flag = true;
    state.runAborted.reason = `openrouter circuit broken after ${THRESHOLD} consecutive failures`;
  }
}

function freshState(): BreakerState {
  return {
    consecutiveFailures: { count: 0 },
    runAborted: { flag: false, reason: '' },
  };
}

describe('circuit breaker: trackJudgeOutcome', () => {
  it('resets the counter on a successful outcome', () => {
    const state = freshState();
    for (let i = 0; i < 5; i++)
      trackJudgeOutcome(state, { kind: 'failed', reason: 'timeout' });
    expect(state.consecutiveFailures.count).toBe(5);
    trackJudgeOutcome(state, { kind: 'ok' });
    expect(state.consecutiveFailures.count).toBe(0);
    expect(state.runAborted.flag).toBe(false);
  });

  it('ignores cross-family skipped outcomes', () => {
    const state = freshState();
    for (let i = 0; i < 20; i++) trackJudgeOutcome(state, { kind: 'skipped' });
    expect(state.consecutiveFailures.count).toBe(0);
    expect(state.runAborted.flag).toBe(false);
  });

  it('ignores parse failures', () => {
    const state = freshState();
    for (let i = 0; i < 20; i++)
      trackJudgeOutcome(state, { kind: 'failed', reason: 'parse' });
    expect(state.consecutiveFailures.count).toBe(0);
    expect(state.runAborted.flag).toBe(false);
  });

  it('trips at exactly the threshold for timeout failures', () => {
    const state = freshState();
    for (let i = 0; i < THRESHOLD - 1; i++)
      trackJudgeOutcome(state, { kind: 'failed', reason: 'timeout' });
    expect(state.runAborted.flag).toBe(false);
    trackJudgeOutcome(state, { kind: 'failed', reason: 'timeout' });
    expect(state.runAborted.flag).toBe(true);
    expect(state.runAborted.reason).toMatch(/circuit broken/);
  });

  it('trips on a mixed run of timeout + http + network failures', () => {
    const state = freshState();
    const reasons: Reason[] = ['timeout', 'http', 'network'];
    for (let i = 0; i < THRESHOLD; i++)
      trackJudgeOutcome(state, {
        kind: 'failed',
        reason: reasons[i % 3],
      });
    expect(state.runAborted.flag).toBe(true);
  });

  it('does NOT trip if a success lands in the middle of the failure streak', () => {
    const state = freshState();
    for (let i = 0; i < THRESHOLD - 1; i++)
      trackJudgeOutcome(state, { kind: 'failed', reason: 'http' });
    trackJudgeOutcome(state, { kind: 'ok' });
    for (let i = 0; i < THRESHOLD - 1; i++)
      trackJudgeOutcome(state, { kind: 'failed', reason: 'http' });
    expect(state.runAborted.flag).toBe(false);
    expect(state.consecutiveFailures.count).toBe(THRESHOLD - 1);
  });

  it('sets runAborted.reason exactly once; later failures do not overwrite', () => {
    const state = freshState();
    for (let i = 0; i < THRESHOLD; i++)
      trackJudgeOutcome(state, { kind: 'failed', reason: 'timeout' });
    const firstReason = state.runAborted.reason;
    for (let i = 0; i < 5; i++)
      trackJudgeOutcome(state, { kind: 'failed', reason: 'http' });
    expect(state.runAborted.reason).toBe(firstReason);
  });
});
