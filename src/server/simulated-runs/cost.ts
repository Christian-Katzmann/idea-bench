/**
 * Cost estimation and hard-ceiling enforcement for simulated runs.
 *
 * Why this is in Phase 1 and not Phase 3: a runaway judge loop is a
 * $1000 bill. The plan explicitly calls for the hard ceiling and abort
 * to ship alongside the feature itself, not bolted on later.
 *
 * Pricing: rough per-1K-token rates for the cheap-judge tier, sourced
 * from OpenRouter listings. These move occasionally; the numbers are
 * estimates for the pre-run display and the ceiling math. Actual cost
 * comes from OpenRouter's `usage.cost` in the response and is
 * accumulated on `simulated_runs.costActualUsd`. If the estimate is
 * wrong by > 25% on a typical run, update these numbers or migrate to
 * a live-rate fetch.
 *
 * Token assumptions: a judge call sees prompt text + 2×output text
 * (for tournament), or prompt + 1×output (for slider/approve-reject/
 * multi-axis/qualitative), or prompt + N×outputs (for best-of-n). We
 * estimate 800 input tokens + 40 output tokens per judge call as a
 * baseline, then scale by mode.
 */
import type { ProviderModelId } from '../../lib/models.js';
import type { PromptMode } from '../db/schema.js';

/** USD per 1M tokens, per provider. [inputPer1M, outputPer1M]. */
const PRICING: Record<ProviderModelId, { input: number; output: number }> = {
  // Cheap tier — preferred judges.
  'anthropic/claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'openai/gpt-5-mini': { input: 0.4, output: 1.6 },
  'google/gemini-2.5-flash': { input: 0.3, output: 1.2 },
  // Mid / flagship — available but expensive as judges.
  'anthropic/claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'anthropic/claude-opus-4-6': { input: 15.0, output: 75.0 },
  'openai/gpt-5': { input: 5.0, output: 20.0 },
  'google/gemini-2.5-pro': { input: 2.5, output: 10.0 },
  // Community / open.
  'meta-llama/llama-4': { input: 0.4, output: 1.2 },
  'deepseek/deepseek-v3.2': { input: 0.3, output: 1.1 },
};

/** Token budget estimates per mode, per judge call. */
const MODE_TOKENS: Record<PromptMode, { in: number; out: number; callsPerPrompt: number }> = {
  // Tournament runs a 5-battle bracket per (simulated voter, prompt).
  // Each battle fits in ~1500 in / 40 out.
  tournament: { in: 1500, out: 40, callsPerPrompt: 5 },
  // Single-generation modes: one judge call per campaign model.
  slider: { in: 800, out: 20, callsPerPrompt: 1 },
  approve_reject: { in: 800, out: 20, callsPerPrompt: 1 },
  multi_axis: { in: 800, out: 80, callsPerPrompt: 1 },
  qualitative: { in: 800, out: 200, callsPerPrompt: 1 },
  // Best-of-N shows all N outputs in a single judge call.
  best_of_n: { in: 2500, out: 40, callsPerPrompt: 1 },
};

export interface CostEstimateInput {
  voterCount: number;
  promptsByMode: Record<PromptMode, number>;
  campaignModelCount: number;
  /** Judge pool — weights must sum to 1.0. */
  modelMix: Array<{ providerModelId: string; weight: number }>;
}

export interface CostEstimateOutput {
  estimatedUsd: number;
  /** Lower/upper bounds, ±25% around the point estimate. Feeds the UI. */
  lowUsd: number;
  highUsd: number;
  /** Per-mode breakdown for debugging / UI hover. */
  perMode: Record<PromptMode, { calls: number; usd: number }>;
  /** Blended $/1K input and output across the mix. */
  blended: { inputPer1M: number; outputPer1M: number };
  /** Total call count (voters × sum of per-prompt calls across all prompts). */
  totalCalls: number;
}

/**
 * Point estimate + ±25% bands. Matches the acceptance criterion "within
 * 25% of actual on typical runs"; operators see the range, not just
 * the midpoint, so the ceiling-hit surprise factor is smaller.
 */
export function estimateRunCost(input: CostEstimateInput): CostEstimateOutput {
  const blended = blendedPricing(input.modelMix);

  const perMode = {} as Record<PromptMode, { calls: number; usd: number }>;
  const modes: PromptMode[] = [
    'tournament',
    'slider',
    'approve_reject',
    'best_of_n',
    'multi_axis',
    'qualitative',
  ];

  let totalUsd = 0;
  let totalCalls = 0;
  for (const mode of modes) {
    const prompts = input.promptsByMode[mode] ?? 0;
    if (prompts === 0) {
      perMode[mode] = { calls: 0, usd: 0 };
      continue;
    }
    const tokens = MODE_TOKENS[mode];
    // `slider`, `approve_reject`, `multi_axis`, `qualitative` — one call
    // per campaign model. `tournament` is 5 battles between sampled
    // pairs regardless of campaign model count. `best_of_n` is one call
    // that shows all models.
    const callsPerPromptPerSeat =
      mode === 'slider' ||
      mode === 'approve_reject' ||
      mode === 'multi_axis' ||
      mode === 'qualitative'
        ? tokens.callsPerPrompt * input.campaignModelCount
        : tokens.callsPerPrompt;
    const calls = prompts * input.voterCount * callsPerPromptPerSeat;
    totalCalls += calls;
    const usd =
      (calls * tokens.in * blended.inputPer1M) / 1_000_000 +
      (calls * tokens.out * blended.outputPer1M) / 1_000_000;
    perMode[mode] = { calls, usd };
    totalUsd += usd;
  }

  return {
    estimatedUsd: round4(totalUsd),
    lowUsd: round4(totalUsd * 0.75),
    highUsd: round4(totalUsd * 1.25),
    perMode,
    blended,
    totalCalls,
  };
}

/**
 * Default hard ceiling for a run: 2× the estimate, with a minimum
 * floor so tiny runs aren't capped below reasonable noise. The
 * operator can override on the launch endpoint.
 */
export function defaultCostCeiling(estimateUsd: number): number {
  return round4(Math.max(estimateUsd * 2, 0.5));
}

/**
 * Ceiling check — called by the runner after each judge call's actual
 * cost lands. Returns `exceeded` when the run should stop.
 */
export function checkCostCeiling(
  ceilingUsd: number | null,
  costActualUsd: number,
): { status: 'ok' | 'exceeded'; ceilingUsd: number | null } {
  if (ceilingUsd == null) return { status: 'ok', ceilingUsd };
  if (costActualUsd > ceilingUsd) return { status: 'exceeded', ceilingUsd };
  return { status: 'ok', ceilingUsd };
}

function blendedPricing(
  modelMix: Array<{ providerModelId: string; weight: number }>,
): { inputPer1M: number; outputPer1M: number } {
  let input = 0;
  let output = 0;
  for (const m of modelMix) {
    const p = PRICING[m.providerModelId as ProviderModelId];
    if (!p) {
      // Unknown model defaults to the cheap-tier average so the
      // estimate doesn't understate cost.
      input += m.weight * 1.0;
      output += m.weight * 3.0;
      continue;
    }
    input += m.weight * p.input;
    output += m.weight * p.output;
  }
  return { inputPer1M: input, outputPer1M: output };
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
