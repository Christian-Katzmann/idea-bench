/**
 * Tests for the per-run USD budget wrapper that sits between generate.ts
 * / simulated-runs and the BudgetTracker primitive. Covers the reserve-
 * and-reconcile pattern that makes concurrent fan-out correct.
 */
import { describe, it, expect } from 'vitest';
import { createRunBudget } from '../lib/generation-budget.js';

const SLOT = {
  providerModelId: 'anthropic/claude-opus-4-6',
  promptText: 'hello world',
};

describe('createRunBudget', () => {
  it('returns a no-op budget when cap is null/undefined/≤0', () => {
    for (const cap of [null, undefined, 0, -1]) {
      const b = createRunBudget({ runId: 'r1', capUsd: cap });
      expect(b.enabled).toBe(false);
      const pre = b.preflight(SLOT);
      expect(pre.allow).toBe(true);
      b.commit(SLOT, 0, { tokensIn: 100, tokensOut: 100, usd: 0.5 });
      expect(b.spentUsd()).toBe(0);
    }
  });

  it('allows slots under the cap and reserves the estimate', () => {
    const b = createRunBudget({ runId: 'r1', capUsd: 10 });
    const pre = b.preflight(SLOT);
    expect(pre.allow).toBe(true);
    const allowed = pre as { allow: true; reservedUsd: number };
    expect(allowed.reservedUsd).toBeGreaterThan(0);
    // spent reflects the reservation before commit lands
    expect(b.spentUsd()).toBeCloseTo(allowed.reservedUsd, 6);
  });

  it('denies slots that would push spend over the cap', () => {
    // Tiny cap forces denial on a normal-sized prompt.
    const b = createRunBudget({ runId: 'r1', capUsd: 0.0000001 });
    const pre = b.preflight(SLOT);
    expect(pre.allow).toBe(false);
    // Non-strict tsconfig loses narrowing here; cast to the denied variant.
    const denied = pre as { allow: false; reason: string; estimatedUsd: number };
    expect(denied.reason).toContain('USD');
    expect(denied.estimatedUsd).toBeGreaterThan(0);
    // Denied slot does NOT reserve, so spent stays zero.
    expect(b.spentUsd()).toBe(0);
  });

  it('reconciles on commit: spent ≈ actual cost, not the estimate', () => {
    const b = createRunBudget({ runId: 'r1', capUsd: 10 });
    const pre = b.preflight(SLOT);
    expect(pre.allow).toBe(true);
    const allowed = pre as { allow: true; reservedUsd: number };
    // Actual cost came in HIGHER than estimate.
    b.commit(SLOT, allowed.reservedUsd, {
      tokensIn: 100,
      tokensOut: 100,
      usd: 0.5,
    });
    expect(b.spentUsd()).toBeCloseTo(0.5, 6);
  });

  it('reconciles downward when actual < estimate (no leaked reservation)', () => {
    const b = createRunBudget({ runId: 'r1', capUsd: 10 });
    const pre = b.preflight(SLOT);
    expect(pre.allow).toBe(true);
    const allowed = pre as { allow: true; reservedUsd: number };
    // Cheaper than expected.
    b.commit(SLOT, allowed.reservedUsd, {
      tokensIn: 10,
      tokensOut: 10,
      usd: 0.0001,
    });
    expect(b.spentUsd()).toBeCloseTo(0.0001, 6);
  });

  it('reconciles a failed slot to zero actual cost', () => {
    const b = createRunBudget({ runId: 'r1', capUsd: 10 });
    const pre = b.preflight(SLOT);
    expect(pre.allow).toBe(true);
    const allowed = pre as { allow: true; reservedUsd: number };
    // Slot failed → no cost committed. Reconcile with usd=0.
    b.commit(SLOT, allowed.reservedUsd, { tokensIn: 0, tokensOut: 0, usd: 0 });
    expect(b.spentUsd()).toBe(0);
  });

  it('concurrent preflights cannot oversubscribe the cap (reservation)', () => {
    // Cap is set so TWO preflights fit but a third does not.
    const b = createRunBudget({ runId: 'r1', capUsd: 0.01 });
    const small = { ...SLOT, promptText: 'hi' };
    const first = b.preflight(small);
    const second = b.preflight(small);
    const third = b.preflight(small);

    // At least one of the first two allows; at some point a preflight
    // must deny because reservations pile up. We assert the monotonic
    // property: total denied at some point rather than exact ordering
    // (tokens-from-characters could round either way per slot).
    const decisions = [first, second, third];
    const deniedCount = decisions.filter((d) => !d.allow).length;
    expect(deniedCount).toBeGreaterThanOrEqual(1);
  });
});
