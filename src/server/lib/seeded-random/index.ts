export {
  hashString,
  mulberry32,
  prngFromString,
  seededShuffle,
  seededPick,
  seededRangeInt,
} from './prng.js';

/**
 * Generate a fresh seed string for a new simulated run. Uses
 * crypto.randomUUID when available, otherwise a timestamp + random
 * fallback. This seed is meant to be logged + displayed — it doesn't
 * need to be cryptographically secure, just unique-enough.
 */
export function freshRunSeed(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xfffffff).toString(36)}`;
  }
}
