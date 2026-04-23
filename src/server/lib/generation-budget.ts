/**
 * Per-run budget enforcement for generation fan-outs and simulated runs.
 *
 * Scope: operator sets a single USD cap per run. In-memory tracker
 * scoped to the Function invocation — no DB persistence (the cap is
 * passed per-request, not stored on campaigns). The run's "identity"
 * within the BudgetTracker is the run id; we enforce via
 * `limits.perUserUsd` and the single userId slot.
 *
 * Preflight is intentionally conservative (over-estimate to avoid
 * blowing the cap on unexpectedly long completions). Commit uses the
 * authoritative `usage.cost` returned by OpenRouter.
 */

import {
  BudgetTracker,
  estimateCostUSD,
  estimateTokensFromText,
  type BudgetContext,
} from './budget/index.js';

export interface RunBudgetContext {
  /** Unique id for this run (e.g. `gen:<campaignId>:<startedAt>`). */
  runId: string;
  /** Operator-set cap in USD. Undefined / null / ≤0 → no enforcement. */
  capUsd: number | null | undefined;
}

export interface SlotBudgetInput {
  /** Provider model id, e.g. "anthropic/claude-opus-4-6". */
  providerModelId: string;
  /** The composed prompt text (system + user merged). */
  promptText: string;
  /** Reserved completion length for estimation. Defaults to 512 tokens. */
  reservedOutputTokens?: number;
}

export interface PreflightAllowed {
  allow: true;
  /** The estimated USD reserved against the cap. Passed back to commit(). */
  reservedUsd: number;
}
export interface PreflightDenied {
  allow: false;
  reason: string;
  estimatedUsd: number;
}

export interface RunBudget {
  readonly enabled: boolean;
  readonly capUsd: number | null;
  /**
   * Reserve the estimated cost against the cap. If allowed, the estimate
   * is committed immediately to prevent concurrent fan-out slots from
   * oversubscribing. The caller must invoke commit() once the real cost
   * is known — the delta (actual − estimate) is reconciled at that time.
   */
  preflight(slot: SlotBudgetInput): PreflightAllowed | PreflightDenied;
  /**
   * Reconcile the reservation. `reservedUsd` must be the value returned
   * by the matching preflight(). Tokens are credited here (preflight
   * credits zero tokens; only USD is reserved).
   */
  commit(
    slot: SlotBudgetInput,
    reservedUsd: number,
    actual: { tokensIn: number; tokensOut: number; usd: number },
  ): void;
  spentUsd(): number;
}

/**
 * Parse the OpenRouter provider-model id into a (provider, model) pair
 * for the pricing lookup. `anthropic/claude-opus-4-6` →
 * `{ provider: 'anthropic', model: 'claude-opus-4-6' }`.
 */
function splitProviderModel(
  providerModelId: string,
): { provider: string; model: string } {
  const slash = providerModelId.indexOf('/');
  if (slash < 0) return { provider: providerModelId, model: '' };
  return {
    provider: providerModelId.slice(0, slash),
    model: providerModelId.slice(slash + 1),
  };
}

/**
 * Create a per-run budget instance. When `capUsd` is nullish or ≤0,
 * returns a no-op budget that always allows and never commits.
 */
export function createRunBudget(ctx: RunBudgetContext): RunBudget {
  const cap =
    typeof ctx.capUsd === 'number' && ctx.capUsd > 0 ? ctx.capUsd : null;

  if (cap === null) {
    return {
      enabled: false,
      capUsd: null,
      preflight: () => ({ allow: true, reservedUsd: 0 }),
      commit: () => {
        /* no-op */
      },
      spentUsd: () => 0,
    };
  }

  const tracker = new BudgetTracker({
    limits: { perUserUsd: cap },
  });

  const makeBudgetCtx = (providerModelId: string): BudgetContext => {
    const { provider, model } = splitProviderModel(providerModelId);
    return { userId: ctx.runId, provider, model };
  };

  const preflightEstimate = (slot: SlotBudgetInput): number => {
    const { provider, model } = splitProviderModel(slot.providerModelId);
    return estimateCostUSD(
      provider,
      model,
      estimateTokensFromText(slot.promptText),
      slot.reservedOutputTokens ?? 512,
    );
  };

  return {
    enabled: true,
    capUsd: cap,
    preflight(slot) {
      const estimated = preflightEstimate(slot);
      const budgetCtx = makeBudgetCtx(slot.providerModelId);
      const decision = tracker.preflightAllow(budgetCtx, {
        tokensIn: estimateTokensFromText(slot.promptText),
        tokensOut: slot.reservedOutputTokens ?? 512,
      });
      if (!decision.allow) {
        // Non-strict tsconfig loses discriminated-union narrowing; pick
        // the denied variant explicitly.
        const denied = decision as { allow: false; reason: string };
        return {
          allow: false,
          reason: denied.reason,
          estimatedUsd: estimated,
        };
      }
      // Reserve the estimate immediately. Concurrent preflights see
      // this reservation and a later slot's preflight will correctly
      // fail once the running total exceeds the cap. The caller must
      // call commit() with the same `reservedUsd` to reconcile.
      tracker.commitUsage(budgetCtx, {
        tokensIn: 0,
        tokensOut: 0,
        usd: estimated,
      });
      return { allow: true, reservedUsd: estimated };
    },
    commit(slot, reservedUsd, actual) {
      // Reconcile: we already added `reservedUsd` at preflight; now add
      // the delta (actual − reserved). Token counts are credited here
      // in full since preflight reserved zero tokens.
      tracker.commitUsage(makeBudgetCtx(slot.providerModelId), {
        tokensIn: actual.tokensIn,
        tokensOut: actual.tokensOut,
        usd: actual.usd - reservedUsd,
      });
    },
    spentUsd() {
      return tracker.getUsage('user', ctx.runId).usd;
    },
  };
}
