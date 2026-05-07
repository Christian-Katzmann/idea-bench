/**
 * Unit tests for cost estimation + ceiling. Cost is the load-bearing
 * guardrail — a runaway loop is a $1000 bill. These cover the happy
 * path for estimation scale (should be roughly linear in voters) and
 * the ceiling-triggering arithmetic.
 */
import { describe, it, expect } from 'vitest';
import {
  checkCostCeiling,
  defaultCostCeiling,
  estimateGenerationCost,
  estimateRunCost,
} from '../cost.js';
import { defaultGenericMix } from '../panel-assembly.js';
import type { PromptMode } from '../../db/schema.js';

function buildPromptsByMode(partial: Partial<Record<PromptMode, number>>): Record<PromptMode, number> {
  return {
    tournament: 0,
    slider: 0,
    approve_reject: 0,
    best_of_n: 0,
    multi_axis: 0,
    qualitative: 0,
    ...partial,
  };
}

describe('estimateRunCost', () => {
  it('returns zero for zero prompts', () => {
    const result = estimateRunCost({
      voterCount: 30,
      promptsByMode: buildPromptsByMode({}),
      campaignModelCount: 4,
      modelMix: defaultGenericMix(),
    });
    expect(result.estimatedUsd).toBe(0);
    expect(result.totalCalls).toBe(0);
  });

  it('scales roughly linearly with voter count', () => {
    const ten = estimateRunCost({
      voterCount: 10,
      promptsByMode: buildPromptsByMode({ slider: 5 }),
      campaignModelCount: 4,
      modelMix: defaultGenericMix(),
    });
    const forty = estimateRunCost({
      voterCount: 40,
      promptsByMode: buildPromptsByMode({ slider: 5 }),
      campaignModelCount: 4,
      modelMix: defaultGenericMix(),
    });
    const ratio = forty.estimatedUsd / ten.estimatedUsd;
    expect(ratio).toBeGreaterThan(3.9);
    expect(ratio).toBeLessThan(4.1);
  });

  it('tournament mode costs more per prompt than slider (5 battles × 1500 tokens)', () => {
    const tournament = estimateRunCost({
      voterCount: 30,
      promptsByMode: buildPromptsByMode({ tournament: 10 }),
      campaignModelCount: 4,
      modelMix: defaultGenericMix(),
    });
    const slider = estimateRunCost({
      voterCount: 30,
      promptsByMode: buildPromptsByMode({ slider: 10 }),
      campaignModelCount: 4,
      modelMix: defaultGenericMix(),
    });
    // Tournament: 10 prompts × 30 voters × 5 battles = 1500 calls
    // Slider:     10 prompts × 30 voters × 4 models  = 1200 calls
    // Plus tournament tokens are ~1.9× slider, so tournament wins big.
    expect(tournament.estimatedUsd).toBeGreaterThan(slider.estimatedUsd);
    expect(tournament.totalCalls).toBe(1500);
    expect(slider.totalCalls).toBe(1200);
  });

  it('emits low/high bands at ±25%', () => {
    const result = estimateRunCost({
      voterCount: 30,
      promptsByMode: buildPromptsByMode({ slider: 5 }),
      campaignModelCount: 4,
      modelMix: defaultGenericMix(),
    });
    expect(result.lowUsd).toBeCloseTo(result.estimatedUsd * 0.75, 3);
    expect(result.highUsd).toBeCloseTo(result.estimatedUsd * 1.25, 3);
  });

  it('reports per-mode breakdown with zero entries for unused modes', () => {
    const result = estimateRunCost({
      voterCount: 10,
      promptsByMode: buildPromptsByMode({ slider: 5, tournament: 2 }),
      campaignModelCount: 3,
      modelMix: defaultGenericMix(),
    });
    expect(result.perMode.slider.calls).toBe(10 * 5 * 3);
    expect(result.perMode.tournament.calls).toBe(10 * 2 * 5);
    expect(result.perMode.best_of_n.calls).toBe(0);
    expect(result.perMode.qualitative.calls).toBe(0);
  });

  // Plan 06 P1-23 — per-kind input-token surcharge.
  describe('per-kind input-token surcharge (P1-17)', () => {
    const baseInput = {
      voterCount: 10,
      promptsByMode: buildPromptsByMode({ slider: 5 }),
      campaignModelCount: 2,
      modelMix: defaultGenericMix(),
    };

    it('omits the surcharge for kind=model (default)', () => {
      const noKind = estimateRunCost(baseInput);
      const explicitModel = estimateRunCost({ ...baseInput, kind: 'model' });
      expect(noKind.estimatedUsd).toBeCloseTo(explicitModel.estimatedUsd, 6);
    });

    it('omits the surcharge for kind=prompt (no system-message inflation)', () => {
      const promptKind = estimateRunCost({ ...baseInput, kind: 'prompt' });
      const noKind = estimateRunCost(baseInput);
      expect(promptKind.estimatedUsd).toBeCloseTo(noKind.estimatedUsd, 6);
    });

    it('inflates kind=system_prompt cost vs. kind=prompt baseline', () => {
      const promptKind = estimateRunCost({ ...baseInput, kind: 'prompt' });
      const systemPromptKind = estimateRunCost({
        ...baseInput,
        kind: 'system_prompt',
      });
      expect(systemPromptKind.estimatedUsd).toBeGreaterThan(
        promptKind.estimatedUsd,
      );
      // Surcharge of 1500 input tokens on top of slider's 800 baseline
      // means system_prompt is ~2.875× the prompt-kind input cost.
      // Output cost is unchanged so the total bump sits below 2.875×.
      expect(systemPromptKind.estimatedUsd / promptKind.estimatedUsd)
        .toBeGreaterThan(1.3);
      expect(systemPromptKind.estimatedUsd / promptKind.estimatedUsd)
        .toBeLessThan(3);
    });

    it('preserves call counts under per-kind branching (only token math shifts)', () => {
      const promptKind = estimateRunCost({ ...baseInput, kind: 'prompt' });
      const systemPromptKind = estimateRunCost({
        ...baseInput,
        kind: 'system_prompt',
      });
      expect(systemPromptKind.totalCalls).toBe(promptKind.totalCalls);
      expect(systemPromptKind.perMode.slider.calls).toBe(
        promptKind.perMode.slider.calls,
      );
    });
  });
});

describe('estimateGenerationCost', () => {
  it('returns zero when there are no prompts or no contestants', () => {
    expect(
      estimateGenerationCost({ promptCount: 0, providerModelIds: ['anthropic/claude-haiku-4-5'] }),
    ).toEqual({ estimatedUsd: 0, lowUsd: 0, highUsd: 0 });
    expect(
      estimateGenerationCost({ promptCount: 5, providerModelIds: [] }),
    ).toEqual({ estimatedUsd: 0, lowUsd: 0, highUsd: 0 });
  });

  it('scales linearly with prompt count', () => {
    const five = estimateGenerationCost({
      promptCount: 5,
      providerModelIds: ['anthropic/claude-haiku-4-5'],
    });
    const twenty = estimateGenerationCost({
      promptCount: 20,
      providerModelIds: ['anthropic/claude-haiku-4-5'],
    });
    expect(twenty.estimatedUsd / five.estimatedUsd).toBeCloseTo(4, 4);
  });

  it('scales linearly with contestant count when models are identical', () => {
    const one = estimateGenerationCost({
      promptCount: 10,
      providerModelIds: ['anthropic/claude-haiku-4-5'],
    });
    const four = estimateGenerationCost({
      promptCount: 10,
      providerModelIds: Array(4).fill('anthropic/claude-haiku-4-5'),
    });
    expect(four.estimatedUsd / one.estimatedUsd).toBeCloseTo(4, 4);
  });

  it('costs more for premium models than cheap-tier', () => {
    const cheap = estimateGenerationCost({
      promptCount: 10,
      providerModelIds: ['anthropic/claude-haiku-4-5'],
    });
    const premium = estimateGenerationCost({
      promptCount: 10,
      providerModelIds: ['anthropic/claude-opus-4-6'],
    });
    expect(premium.estimatedUsd).toBeGreaterThan(cheap.estimatedUsd * 5);
  });

  it('emits 0.5x / 2x bands around the point estimate', () => {
    const result = estimateGenerationCost({
      promptCount: 10,
      providerModelIds: ['anthropic/claude-haiku-4-5'],
    });
    expect(result.lowUsd).toBeCloseTo(result.estimatedUsd * 0.5, 4);
    expect(result.highUsd).toBeCloseTo(result.estimatedUsd * 2, 4);
  });

  it('falls through to cheap-tier average for unknown model ids', () => {
    const known = estimateGenerationCost({
      promptCount: 10,
      providerModelIds: ['anthropic/claude-haiku-4-5'],
    });
    const unknown = estimateGenerationCost({
      promptCount: 10,
      providerModelIds: ['fictional-provider/imaginary-model'],
    });
    // Unknown rates are conservative ($1 in / $3 out per 1M) — close
    // enough to Haiku that the estimate sits in a sane order of magnitude
    // and never returns zero.
    expect(unknown.estimatedUsd).toBeGreaterThan(0);
    expect(unknown.estimatedUsd).toBeLessThan(known.estimatedUsd * 5);
  });
});

describe('defaultCostCeiling', () => {
  it('returns 2x the estimate when above the floor', () => {
    expect(defaultCostCeiling(5)).toBe(10);
  });

  it('floors at $0.50 for tiny estimates', () => {
    expect(defaultCostCeiling(0.1)).toBe(0.5);
    expect(defaultCostCeiling(0)).toBe(0.5);
  });
});

describe('checkCostCeiling', () => {
  it('passes when actual is under ceiling', () => {
    expect(checkCostCeiling(10, 5)).toEqual({ status: 'ok', ceilingUsd: 10 });
  });

  it('flags exceeded when actual > ceiling', () => {
    expect(checkCostCeiling(10, 12)).toEqual({
      status: 'exceeded',
      ceilingUsd: 10,
    });
  });

  it('is ok when ceiling is null (no limit)', () => {
    expect(checkCostCeiling(null, 9999)).toEqual({
      status: 'ok',
      ceilingUsd: null,
    });
  });
});
