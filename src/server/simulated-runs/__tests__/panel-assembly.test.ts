/**
 * Unit tests for panel assembly. Covers:
 *   - validateModelMix happy paths + every rejection branch
 *   - assignSeats deterministic largest-remainder allocation
 *   - isJudgeAllowed cross-family exclusion with known + unknown models
 *
 * Panel assembly is the first gate a simulated run passes through —
 * bugs here leak straight into biased ratings, so tests cover both
 * behavior and the explanation strings the UI surfaces back.
 */
import { describe, it, expect } from 'vitest';
import {
  assignSeats,
  defaultGenericMix,
  displayNameFor,
  isJudgeAllowed,
  MAX_FAMILY_WEIGHT,
  MIN_FAMILY_COUNT,
  validateModelMix,
} from '../panel-assembly.js';

describe('validateModelMix', () => {
  it('accepts the default generic mix', () => {
    const result = validateModelMix(defaultGenericMix());
    expect(result.ok).toBe(true);
  });

  it('rejects an empty array', () => {
    const result = validateModelMix([]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/non-empty/);
  });

  it('rejects an unknown providerModelId', () => {
    const result = validateModelMix([
      { providerModelId: 'fake/made-up-1', weight: 0.5 },
      { providerModelId: 'openai/gpt-5-mini', weight: 0.5 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown providerModelId/);
  });

  it('rejects weights that do not sum to 1.0', () => {
    const result = validateModelMix([
      { providerModelId: 'anthropic/claude-haiku-4-5', weight: 0.3 },
      { providerModelId: 'openai/gpt-5-mini', weight: 0.3 },
      { providerModelId: 'google/gemini-2.5-flash', weight: 0.3 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/weights must sum/);
  });

  it('rejects duplicate providerModelIds', () => {
    const result = validateModelMix([
      { providerModelId: 'anthropic/claude-haiku-4-5', weight: 0.5 },
      { providerModelId: 'anthropic/claude-haiku-4-5', weight: 0.5 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/duplicate/);
  });

  it('rejects zero or negative weights', () => {
    const result = validateModelMix([
      { providerModelId: 'anthropic/claude-haiku-4-5', weight: 0 },
      { providerModelId: 'openai/gpt-5-mini', weight: 1 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/must be > 0/);
  });

  it('rejects panels with fewer than 3 distinct families', () => {
    const result = validateModelMix([
      { providerModelId: 'anthropic/claude-haiku-4-5', weight: 0.5 },
      { providerModelId: 'anthropic/claude-sonnet-4-6', weight: 0.5 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(new RegExp(`${MIN_FAMILY_COUNT} distinct`));
  });

  it('rejects panels where one family exceeds 40%', () => {
    // anthropic × 2 at 0.3+0.3 = 0.6 → domination.
    const result = validateModelMix([
      { providerModelId: 'anthropic/claude-haiku-4-5', weight: 0.3 },
      { providerModelId: 'anthropic/claude-sonnet-4-6', weight: 0.3 },
      { providerModelId: 'openai/gpt-5-mini', weight: 0.2 },
      { providerModelId: 'google/gemini-2.5-flash', weight: 0.2 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/anthropic/);
    expect(result.error).toMatch(new RegExp(`${Math.round(MAX_FAMILY_WEIGHT * 100)}%`));
  });

  it('accepts a valid 4-way mix exactly at the diversity bounds', () => {
    // Four families, each < 40%.
    const result = validateModelMix([
      { providerModelId: 'anthropic/claude-haiku-4-5', weight: 0.25 },
      { providerModelId: 'openai/gpt-5-mini', weight: 0.25 },
      { providerModelId: 'google/gemini-2.5-flash', weight: 0.25 },
      { providerModelId: 'meta-llama/llama-4', weight: 0.25 },
    ]);
    expect(result.ok).toBe(true);
  });
});

describe('assignSeats', () => {
  it('returns empty list for voterCount=0', () => {
    const seats = assignSeats({
      voterCount: 0,
      modelMix: defaultGenericMix(),
    });
    expect(seats).toEqual([]);
  });

  it('assigns seats in proportion to weights (exact split)', () => {
    const seats = assignSeats({
      voterCount: 30,
      modelMix: defaultGenericMix(),
    });
    expect(seats).toHaveLength(30);
    const counts = new Map<string, number>();
    for (const s of seats) {
      counts.set(s.judgeModelId, (counts.get(s.judgeModelId) ?? 0) + 1);
    }
    // 30 voters at 1/3 each → 10 apiece.
    expect(counts.get('anthropic/claude-haiku-4-5')).toBe(10);
    expect(counts.get('openai/gpt-5-mini')).toBe(10);
    expect(counts.get('google/gemini-2.5-flash')).toBe(10);
  });

  it('allocates leftover seats by largest remainder, deterministically', () => {
    // 10 seats at equal thirds: 3.33 each → floor=3,3,3 + 1 remainder.
    // The remainder goes to the largest fractional part, tie-broken by
    // providerModelId (alphabetical). All three have frac = 0.333, so
    // anthropic/… wins the tie-break.
    const seats = assignSeats({
      voterCount: 10,
      modelMix: defaultGenericMix(),
    });
    expect(seats).toHaveLength(10);
    const counts = new Map<string, number>();
    for (const s of seats) {
      counts.set(s.judgeModelId, (counts.get(s.judgeModelId) ?? 0) + 1);
    }
    expect(counts.get('anthropic/claude-haiku-4-5')).toBe(4);
    expect(counts.get('openai/gpt-5-mini')).toBe(3);
    expect(counts.get('google/gemini-2.5-flash')).toBe(3);
  });

  it('is fully deterministic — same inputs give same seat table', () => {
    const a = assignSeats({ voterCount: 17, modelMix: defaultGenericMix() });
    const b = assignSeats({ voterCount: 17, modelMix: defaultGenericMix() });
    expect(a).toEqual(b);
  });

  it('assigns seatIndex sequentially 0..N-1', () => {
    const seats = assignSeats({ voterCount: 5, modelMix: defaultGenericMix() });
    expect(seats.map((s) => s.seatIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('round-robins persona assignments when provided', () => {
    const seats = assignSeats({
      voterCount: 6,
      modelMix: defaultGenericMix(),
      personaIds: ['persona-a', 'persona-b'],
    });
    expect(seats[0].personaId).toBe('persona-a');
    expect(seats[1].personaId).toBe('persona-b');
    expect(seats[2].personaId).toBe('persona-a');
    expect(seats[3].personaId).toBe('persona-b');
    expect(seats[4].personaId).toBe('persona-a');
    expect(seats[5].personaId).toBe('persona-b');
  });

  it('leaves persona null when not provided', () => {
    const seats = assignSeats({ voterCount: 3, modelMix: defaultGenericMix() });
    for (const s of seats) expect(s.personaId).toBeNull();
  });
});

describe('isJudgeAllowed', () => {
  it('blocks anthropic judge from evaluating anthropic-only outputs', () => {
    expect(
      isJudgeAllowed('anthropic/claude-haiku-4-5', [
        'anthropic/claude-opus-4-6',
      ]),
    ).toBe(false);
  });

  it('allows anthropic judge for openai-only outputs', () => {
    expect(
      isJudgeAllowed('anthropic/claude-haiku-4-5', ['openai/gpt-5']),
    ).toBe(true);
  });

  it('blocks anthropic judge when ANY candidate is anthropic (best-of-N case)', () => {
    expect(
      isJudgeAllowed('anthropic/claude-haiku-4-5', [
        'openai/gpt-5',
        'google/gemini-2.5-pro',
        'anthropic/claude-sonnet-4-6',
      ]),
    ).toBe(false);
  });

  it('allows unknown judge models (no family → can\u2019t self-prefer)', () => {
    expect(
      isJudgeAllowed('fake/unknown-model', ['anthropic/claude-opus-4-6']),
    ).toBe(true);
  });

  it('allows known judge against unknown candidate (unknown family)', () => {
    expect(
      isJudgeAllowed('anthropic/claude-haiku-4-5', ['fake/unknown-model']),
    ).toBe(true);
  });
});

describe('displayNameFor', () => {
  it('returns catalog display name for known id', () => {
    expect(displayNameFor('anthropic/claude-haiku-4-5')).toBe('Claude Haiku 4.5');
  });

  it('falls back to the id for unknown models', () => {
    expect(displayNameFor('fake/unknown-model')).toBe('fake/unknown-model');
  });
});
