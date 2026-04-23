/**
 * Tests the seeded PRNG used to make simulated run bracket selection +
 * tie-break advancement reproducible. The end-to-end contract: same seed
 * → same sampleSeed() output → same bracket regardless of call order.
 */
import { describe, it, expect } from 'vitest';
import {
  freshRunSeed,
  hashString,
  mulberry32,
  prngFromString,
  seededShuffle,
} from '../lib/seeded-random/index.js';
import { sampleSeed, coinFlip } from '../tournament.js';

describe('seeded-random primitives', () => {
  it('hashString is stable and identical for identical inputs', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
    expect(hashString('hello')).not.toBe(hashString('world'));
  });

  it('mulberry32 produces the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('prngFromString derives the same sequence per string seed', () => {
    const a = prngFromString('run-1:seat-42:prompt-7');
    const b = prngFromString('run-1:seat-42:prompt-7');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('seededShuffle is deterministic under a seeded rng', () => {
    const rng1 = prngFromString('s');
    const rng2 = prngFromString('s');
    expect(seededShuffle([1, 2, 3, 4, 5], rng1)).toEqual(
      seededShuffle([1, 2, 3, 4, 5], rng2),
    );
  });

  it('freshRunSeed yields a non-empty unique string', () => {
    const a = freshRunSeed();
    const b = freshRunSeed();
    expect(a.length).toBeGreaterThan(4);
    expect(b.length).toBeGreaterThan(4);
    expect(a).not.toBe(b);
  });
});

describe('tournament with seeded RNG', () => {
  it('sampleSeed picks the same 4 ids twice for the same seed', () => {
    const pool = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];
    const rng1 = prngFromString('seed-A');
    const rng2 = prngFromString('seed-A');
    expect(sampleSeed(pool, rng1)).toEqual(sampleSeed(pool, rng2));
  });

  it('sampleSeed picks different sets for different seeds (most of the time)', () => {
    const pool = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];
    const rng1 = prngFromString('seed-A');
    const rng2 = prngFromString('seed-B');
    // Not a guarantee (small combinatorial space), but for these seeds
    // the sequences diverge. Sanity check that seeds matter.
    expect(sampleSeed(pool, rng1)).not.toEqual(sampleSeed(pool, rng2));
  });

  it('coinFlip is deterministic under a seeded rng', () => {
    const rng1 = prngFromString('flip');
    const rng2 = prngFromString('flip');
    const a1 = [coinFlip('a', 'b', rng1), coinFlip('a', 'b', rng1)];
    const a2 = [coinFlip('a', 'b', rng2), coinFlip('a', 'b', rng2)];
    expect(a1).toEqual(a2);
  });
});
