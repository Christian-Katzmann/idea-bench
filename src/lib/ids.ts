/**
 * Id helpers shared by client + server.
 *
 * - `pairKey` is the canonical form of an unordered pair of generation
 *   ids. It lets us enforce "one vote per pair per participant" with a
 *   unique index even when the display order flips.
 * - `generateShareSlug` produces an unguessable 16-char base62 slug used
 *   as the public URL segment (`/vote/:slug`). Campaigns also have an
 *   internal UUID; the slug is a separate column.
 */
import { customAlphabet } from 'nanoid';

const SHARE_SLUG_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const generateShareSlugImpl = customAlphabet(SHARE_SLUG_ALPHABET, 16);

/** 16-char base62 slug. Collision probability is negligible at our scale. */
export function generateShareSlug(): string {
  return generateShareSlugImpl();
}

/**
 * Canonical ordering of a pair of generation ids. Input order doesn't
 * matter — `pairKey("a", "b") === pairKey("b", "a")`.
 *
 * Format is deliberately simple (lexmin + ':' + lexmax) so it's
 * trivially reproducible in SQL if we ever need to.
 */
export function pairKey(generationAId: string, generationBId: string): string {
  if (generationAId === generationBId) {
    throw new Error('pairKey: ids must be distinct');
  }
  return generationAId < generationBId
    ? `${generationAId}:${generationBId}`
    : `${generationBId}:${generationAId}`;
}
