/**
 * Id helpers shared by client + server.
 *
 * `generateShareSlug` produces an unguessable 16-char base62 slug used
 * as the public URL segment (`/vote/:slug`). Campaigns also have an
 * internal UUID; the slug is a separate column.
 *
 * Pair-level dedup keys are intentionally NOT in this file anymore —
 * with the tournament bracket, uniqueness is enforced per
 * (tournament_id, bracket_position), which subsumes the old pair-key
 * mechanism. See src/server/db/schema.ts votes table comment.
 */
import { customAlphabet } from 'nanoid';

const SHARE_SLUG_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const generateShareSlugImpl = customAlphabet(SHARE_SLUG_ALPHABET, 16);

/** 16-char base62 slug. Collision probability is negligible at our scale. */
export function generateShareSlug(): string {
  return generateShareSlugImpl();
}
