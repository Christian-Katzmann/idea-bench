// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/seeded-reproducible-prng/src/prng.ts
// Seeded, deterministic PRNG + string-seeded helpers.
// Not cryptographic — do not use for secrets/IDs.

export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function prngFromString(seed: string): () => number {
  return mulberry32(hashString(seed));
}

export function seededShuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function seededPick<T>(
  arr: readonly T[],
  rng: () => number,
): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

export function seededRangeInt(
  minInclusive: number,
  maxExclusive: number,
  rng: () => number,
): number {
  const lo = Math.ceil(minInclusive);
  const hi = Math.floor(maxExclusive);
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo));
}
