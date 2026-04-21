import { describe, it, expect } from 'vitest';
import {
  wilsonInterval,
  computeBestOfNAggregates,
  computeMultiAxisAggregates,
  BEST_OF_N_CATEGORY_PREFIX,
  MULTI_AXIS_CATEGORY_PREFIX,
} from '../ratings.js';
import type {
  BestOfNResponse,
  MultiAxisResponse,
} from '../db/schema.js';

/**
 * Unit tests for the per-mode signal helpers. Bradley-Terry already has
 * its own coverage in `bradley-terry.test.ts`; this file focuses on the
 * Wilson CI formula used by approve/reject aggregates.
 *
 * References for expected values:
 *   - Newcombe, R.G. (1998). "Two-sided confidence intervals for the
 *     single proportion: comparison of seven methods." Wilson intervals
 *     at 95% for standard test cases.
 *   - Scipy `statsmodels.stats.proportion.proportion_confint(method='wilson')`.
 */
describe('wilsonInterval', () => {
  const Z95 = 1.96;

  it('returns [0, 0] for empty sample', () => {
    const { low, high } = wilsonInterval(0, 0, Z95);
    expect(low).toBe(0);
    expect(high).toBe(0);
  });

  it('has bounds at exactly 0 and 1 for clamps', () => {
    // 0 successes out of N should have low bound at 0.
    const zeroOutOf10 = wilsonInterval(0, 10, Z95);
    expect(zeroOutOf10.low).toBe(0);
    expect(zeroOutOf10.high).toBeGreaterThan(0);
    expect(zeroOutOf10.high).toBeLessThan(1);

    // N successes out of N should have high bound at 1.
    const tenOutOf10 = wilsonInterval(10, 10, Z95);
    expect(tenOutOf10.high).toBe(1);
    expect(tenOutOf10.low).toBeLessThan(1);
    expect(tenOutOf10.low).toBeGreaterThan(0);
  });

  it('is symmetric around 0.5 at p=0.5', () => {
    // 5/10 Wilson 95% CI ≈ (0.237, 0.763)
    const { low, high } = wilsonInterval(5, 10, Z95);
    expect(low).toBeCloseTo(0.237, 2);
    expect(high).toBeCloseTo(0.763, 2);
    // Distances from 0.5 should match within floating-point noise.
    expect(0.5 - low).toBeCloseTo(high - 0.5, 6);
  });

  it('matches canonical values for p=0.8 at n=100', () => {
    // 80/100 → Wilson 95% CI ≈ (0.711, 0.868)
    const { low, high } = wilsonInterval(80, 100, Z95);
    expect(low).toBeCloseTo(0.711, 2);
    expect(high).toBeCloseTo(0.868, 2);
  });

  it('produces wider intervals as n shrinks', () => {
    const wide = wilsonInterval(1, 2, Z95);
    const narrow = wilsonInterval(50, 100, Z95);
    expect(wide.high - wide.low).toBeGreaterThan(narrow.high - narrow.low);
  });

  it('shifts toward 0.5 for small samples (conservative)', () => {
    // 1/2: observed p=0.5, but Wilson center is exactly 0.5 (symmetric).
    // 2/2: observed p=1.0, but Wilson center is << 1.0 (pulled toward 0.5).
    const { low, high } = wilsonInterval(2, 2, Z95);
    // Lower bound should be noticeably less than 1.0 — Wilson refuses to
    // claim 100% certainty from 2 successes.
    expect(low).toBeLessThan(0.9);
    expect(high).toBe(1);
  });

  it('bounds are always within [0, 1]', () => {
    const cases: Array<[number, number]> = [
      [0, 1],
      [1, 1],
      [3, 7],
      [19, 50],
      [99, 100],
      [100, 100],
    ];
    for (const [s, n] of cases) {
      const { low, high } = wilsonInterval(s, n, Z95);
      expect(low).toBeGreaterThanOrEqual(0);
      expect(high).toBeLessThanOrEqual(1);
      expect(low).toBeLessThanOrEqual(high);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Best-of-N aggregation — verify win rate math and category encoding.
// The aggregator is pure: responses in, rating rows out. DB access lives
// in the caller (recomputeCampaignRatings).
// ─────────────────────────────────────────────────────────────────────────

describe('computeBestOfNAggregates', () => {
  const CAMPAIGN = 'campaign-1';
  const M_A = 'model-a';
  const M_B = 'model-b';
  const M_C = 'model-c';
  const modelIds = [M_A, M_B, M_C];
  const now = new Date('2026-01-01T00:00:00Z');

  const resp = (
    promptId: string,
    chosen: string,
    id: string = `r-${Math.random()}`,
  ): BestOfNResponse => ({
    id,
    campaignId: CAMPAIGN,
    participantId: `p-${id}`,
    simulatedParticipantId: null,
    promptId,
    chosenCampaignModelId: chosen,
    sessionId: `s-${id}`,
    createdAt: now,
  });

  it('returns [] for empty responses', () => {
    const rows = computeBestOfNAggregates({
      campaignId: CAMPAIGN,
      responses: [],
      modelIds,
      promptCategoryTags: new Map(),
      now,
    });
    expect(rows).toEqual([]);
  });

  it('computes win rates for a simple all-overall campaign', () => {
    // 4 responses, one prompt, no tags.
    // A wins 2, B wins 1, C wins 1 → A=50%, B=25%, C=25%.
    // Every model was shown on every response, so eligible=4 for each.
    const responses = [
      resp('p1', M_A, 'r1'),
      resp('p1', M_A, 'r2'),
      resp('p1', M_B, 'r3'),
      resp('p1', M_C, 'r4'),
    ];
    const rows = computeBestOfNAggregates({
      campaignId: CAMPAIGN,
      responses,
      modelIds,
      promptCategoryTags: new Map([['p1', []]]),
      now,
    });
    // Expect one row per (model, category=overall).
    const overall = rows.filter(
      (r) => r.category === `${BEST_OF_N_CATEGORY_PREFIX}overall`,
    );
    expect(overall).toHaveLength(3);
    const byModel = new Map(overall.map((r) => [r.campaignModelId, r]));
    expect(byModel.get(M_A)?.rating).toBe(50);
    expect(byModel.get(M_A)?.gameCount).toBe(4);
    expect(byModel.get(M_B)?.rating).toBe(25);
    expect(byModel.get(M_B)?.gameCount).toBe(4);
    expect(byModel.get(M_C)?.rating).toBe(25);
    expect(byModel.get(M_C)?.gameCount).toBe(4);
  });

  it('buckets per tag and skips the overall sentinel as a user tag', () => {
    // One response, one prompt, tag "creative". Should produce rows for
    // both the overall bucket and the creative bucket.
    const responses = [resp('p1', M_A, 'r1')];
    const rows = computeBestOfNAggregates({
      campaignId: CAMPAIGN,
      responses,
      modelIds,
      // Simulate an accidental 'overall' tag — must be skipped.
      promptCategoryTags: new Map([['p1', ['creative', 'overall']]]),
      now,
    });
    const categories = new Set(rows.map((r) => r.category));
    expect(categories.has(`${BEST_OF_N_CATEGORY_PREFIX}overall`)).toBe(true);
    expect(categories.has(`${BEST_OF_N_CATEGORY_PREFIX}creative`)).toBe(true);
    // The reserved 'overall' tag should NOT produce a duplicate row
    // (would show up as 2x the eligible count otherwise).
    const aOverall = rows.find(
      (r) =>
        r.category === `${BEST_OF_N_CATEGORY_PREFIX}overall` &&
        r.campaignModelId === M_A,
    );
    expect(aOverall?.gameCount).toBe(1);
  });

  it('emits empty rows for models with no wins (so leaderboard lists them)', () => {
    const responses = [resp('p1', M_A, 'r1')];
    const rows = computeBestOfNAggregates({
      campaignId: CAMPAIGN,
      responses,
      modelIds,
      promptCategoryTags: new Map([['p1', []]]),
      now,
    });
    const overall = rows.filter(
      (r) => r.category === `${BEST_OF_N_CATEGORY_PREFIX}overall`,
    );
    const b = overall.find((r) => r.campaignModelId === M_B);
    expect(b?.rating).toBe(0);
    expect(b?.gameCount).toBe(1); // eligible but didn't win
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Multi-axis aggregation
// ─────────────────────────────────────────────────────────────────────────

describe('computeMultiAxisAggregates', () => {
  const CAMPAIGN = 'campaign-1';
  const M_A = 'model-a';
  const M_B = 'model-b';
  const modelIds = [M_A, M_B];
  const now = new Date('2026-01-01T00:00:00Z');

  const resp = (
    promptId: string,
    modelId: string,
    scores: Record<string, number>,
    id: string = `r-${Math.random()}`,
  ): MultiAxisResponse => ({
    id,
    campaignId: CAMPAIGN,
    participantId: `p-${id}`,
    simulatedParticipantId: null,
    promptId,
    campaignModelId: modelId,
    sessionId: `s-${id}`,
    scores,
    createdAt: now,
  });

  it('returns [] for empty responses', () => {
    const rows = computeMultiAxisAggregates({
      campaignId: CAMPAIGN,
      responses: [],
      prompts: [],
      modelIds,
      promptCategoryTags: new Map(),
      now,
    });
    expect(rows).toEqual([]);
  });

  it('computes per-dimension means and encodes category as multi_axis:<dim>:<cat>', () => {
    // Model A: [4, 5] for correctness, [3] for tone → mean=4.5 / 3
    // Model B: [2] for correctness, [5] for tone → mean=2 / 5
    const responses = [
      resp('p1', M_A, { correctness: 4, tone: 3 }, 'r1'),
      resp('p1', M_A, { correctness: 5 }, 'r2'),
      resp('p1', M_B, { correctness: 2, tone: 5 }, 'r3'),
    ];
    const rows = computeMultiAxisAggregates({
      campaignId: CAMPAIGN,
      responses,
      prompts: [],
      modelIds,
      promptCategoryTags: new Map([['p1', []]]),
      now,
    });

    const get = (modelId: string, category: string) =>
      rows.find(
        (r) => r.campaignModelId === modelId && r.category === category,
      );

    const aCorrect = get(
      M_A,
      `${MULTI_AXIS_CATEGORY_PREFIX}correctness:overall`,
    );
    expect(aCorrect?.rating).toBe(450); // 4.5 × 100
    expect(aCorrect?.gameCount).toBe(2);

    const aTone = get(M_A, `${MULTI_AXIS_CATEGORY_PREFIX}tone:overall`);
    expect(aTone?.rating).toBe(300); // 3.0 × 100
    expect(aTone?.gameCount).toBe(1);

    const bCorrect = get(
      M_B,
      `${MULTI_AXIS_CATEGORY_PREFIX}correctness:overall`,
    );
    expect(bCorrect?.rating).toBe(200);
    expect(bCorrect?.gameCount).toBe(1);

    const bTone = get(M_B, `${MULTI_AXIS_CATEGORY_PREFIX}tone:overall`);
    expect(bTone?.rating).toBe(500);
    expect(bTone?.gameCount).toBe(1);
  });

  it('fans out to category tags alongside overall', () => {
    // Tag 'creative' should produce its own rows alongside overall.
    const responses = [
      resp('p1', M_A, { correctness: 5 }, 'r1'),
      resp('p1', M_A, { correctness: 3 }, 'r2'),
    ];
    const rows = computeMultiAxisAggregates({
      campaignId: CAMPAIGN,
      responses,
      prompts: [],
      modelIds,
      promptCategoryTags: new Map([['p1', ['creative']]]),
      now,
    });
    const overall = rows.find(
      (r) =>
        r.campaignModelId === M_A &&
        r.category === `${MULTI_AXIS_CATEGORY_PREFIX}correctness:overall`,
    );
    const creative = rows.find(
      (r) =>
        r.campaignModelId === M_A &&
        r.category === `${MULTI_AXIS_CATEGORY_PREFIX}correctness:creative`,
    );
    expect(overall?.rating).toBe(400); // (5+3)/2 × 100
    expect(creative?.rating).toBe(400);
    expect(creative?.gameCount).toBe(2);
  });

  it('ignores non-numeric values in scores jsonb defensively', () => {
    const responses = [
      resp(
        'p1',
        M_A,
        {
          correctness: 4,
          // these would come from a malformed client; simulate via cast
          nonsense: NaN,
          infinite: Infinity,
        },
        'r1',
      ),
    ];
    const rows = computeMultiAxisAggregates({
      campaignId: CAMPAIGN,
      responses,
      prompts: [],
      modelIds,
      promptCategoryTags: new Map([['p1', []]]),
      now,
    });
    const correctness = rows.find(
      (r) =>
        r.campaignModelId === M_A &&
        r.category === `${MULTI_AXIS_CATEGORY_PREFIX}correctness:overall`,
    );
    expect(correctness?.rating).toBe(400);
    // Nonsense dimensions should not produce rows.
    const bad = rows.find((r) =>
      r.category.startsWith(`${MULTI_AXIS_CATEGORY_PREFIX}nonsense`),
    );
    expect(bad).toBeUndefined();
  });

  it('emits empty rows for models that weren\'t rated on a dimension', () => {
    // Only model A has a 'tone' rating; B should still get a 0 row so
    // the leaderboard lists it.
    const responses = [resp('p1', M_A, { tone: 4 }, 'r1')];
    const rows = computeMultiAxisAggregates({
      campaignId: CAMPAIGN,
      responses,
      prompts: [],
      modelIds,
      promptCategoryTags: new Map([['p1', []]]),
      now,
    });
    const bTone = rows.find(
      (r) =>
        r.campaignModelId === M_B &&
        r.category === `${MULTI_AXIS_CATEGORY_PREFIX}tone:overall`,
    );
    expect(bTone?.rating).toBe(0);
    expect(bTone?.gameCount).toBe(0);
  });
});
