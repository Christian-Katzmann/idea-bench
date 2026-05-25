import { describe, expect, it } from 'vitest';
import {
  computeBradleyTerry,
  invertSquareMatrix,
  votesToComparisons,
  type BTComparison,
} from '../bradley-terry.js';

describe('computeBradleyTerry', () => {
  it('orders a connected comparison graph by pairwise strength', () => {
    const modelIds = ['model-a', 'model-b', 'model-c'];
    const comparisons: BTComparison[] = [
      ...repeat({ winner: 'model-a', loser: 'model-b', weight: 1 }, 10),
      ...repeat({ winner: 'model-b', loser: 'model-a', weight: 1 }, 2),
      ...repeat({ winner: 'model-a', loser: 'model-c', weight: 1 }, 8),
      ...repeat({ winner: 'model-c', loser: 'model-a', weight: 1 }, 4),
      ...repeat({ winner: 'model-b', loser: 'model-c', weight: 1 }, 10),
      ...repeat({ winner: 'model-c', loser: 'model-b', weight: 1 }, 2),
    ];

    const result = computeBradleyTerry(modelIds, comparisons);

    expect(result.converged).toBe(true);
    expect(result.ratings['model-a']).toBeGreaterThan(
      result.ratings['model-b'],
    );
    expect(result.ratings['model-b']).toBeGreaterThan(
      result.ratings['model-c'],
    );

    for (const id of modelIds) {
      expect(result.gameCount[id]).toBe(24);
      expect(result.seRatings[id]).toBeGreaterThan(0);
      expect(result.ciLow[id]).toBeLessThan(result.ratings[id]);
      expect(result.ciHigh[id]).toBeGreaterThan(result.ratings[id]);
    }
  });

  it('keeps unseen models neutral and explicit', () => {
    const result = computeBradleyTerry(['model-a', 'model-b', 'model-c'], [
      { winner: 'model-a', loser: 'model-b', weight: 1 },
      { winner: 'model-a', loser: 'model-b', weight: 1 },
    ]);

    expect(result.ratings['model-c']).toBe(1000);
    expect(result.gameCount['model-c']).toBe(0);
    expect(result.winRate['model-c']).toBeNull();
    expect(result.seRatings['model-c']).toBeNull();
    expect(result.ciLow['model-c']).toBeNull();
    expect(result.ciHigh['model-c']).toBeNull();
  });

  it('treats symmetric ties as half wins in both directions', () => {
    const comparisons = votesToComparisons([
      {
        winnerModelId: 'model-a',
        loserModelId: 'model-b',
        outcome: 'tie',
      },
      {
        winnerModelId: 'model-a',
        loserModelId: 'model-b',
        outcome: 'both_bad',
      },
    ]);

    expect(comparisons).toEqual([
      { winner: 'model-a', loser: 'model-b', weight: 0.5 },
      { winner: 'model-b', loser: 'model-a', weight: 0.5 },
      { winner: 'model-a', loser: 'model-b', weight: 0.5 },
      { winner: 'model-b', loser: 'model-a', weight: 0.5 },
    ]);

    const result = computeBradleyTerry(['model-a', 'model-b'], comparisons);
    expect(result.ratings['model-a']).toBeCloseTo(1000, 6);
    expect(result.ratings['model-b']).toBeCloseTo(1000, 6);
    expect(result.winRate['model-a']).toBe(0.5);
    expect(result.winRate['model-b']).toBe(0.5);
  });
});

describe('invertSquareMatrix', () => {
  it('inverts a small nonsingular matrix', () => {
    const inverse = invertSquareMatrix([
      [4, 7],
      [2, 6],
    ]);

    expect(inverse).not.toBeNull();
    expect(inverse![0][0]).toBeCloseTo(0.6, 6);
    expect(inverse![0][1]).toBeCloseTo(-0.7, 6);
    expect(inverse![1][0]).toBeCloseTo(-0.2, 6);
    expect(inverse![1][1]).toBeCloseTo(0.4, 6);
  });

  it('returns null for singular matrices', () => {
    expect(
      invertSquareMatrix([
        [1, 2],
        [2, 4],
      ]),
    ).toBeNull();
  });
});

function repeat<T>(value: T, count: number): T[] {
  return Array.from({ length: count }, () => value);
}
