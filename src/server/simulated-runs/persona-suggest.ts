/**
 * Plan 06 P1-11 — pre-filter helper for the persona suggestion card.
 *
 * Given a campaign's `categories` and the operator's persona library,
 * rank each persona by how well its `tags` overlap with the campaign's
 * categories. The launch-step UI uses this to pre-filter the picker
 * (operator still selects explicitly — nothing is auto-checked).
 *
 * Algorithm: simple case-insensitive set intersection, sort by match
 * count descending, then by `updatedAt` descending (newest persona
 * breaks ties). Personas with zero matches are still returned — the UI
 * surfaces them via a "Refine" search field rather than dropping them
 * silently. The PRD's "personas without category tags should still
 * appear in refine" rule lives in this contract.
 *
 * The signature is deliberately pure (no DB) so it can run on the
 * server (e.g., a future `/api/personas/suggest` endpoint) or
 * client-side once the personas list has been fetched. V1 mounts it
 * client-side from the launch step.
 */
import type { Persona } from '../../lib/api.js';

export interface PersonaSuggestion {
  persona: Persona;
  /** Number of campaign categories that overlap the persona's tags. */
  matchCount: number;
}

export interface SuggestPersonasInput {
  /** The campaign's `categories` (operator-defined topic tags). */
  campaignCategories: string[];
  personas: Persona[];
}

/**
 * Rank `personas` by tag overlap with `campaignCategories`. Returns
 * every input persona with its match count attached.
 *
 * Comparison is case-insensitive and trims whitespace, so 'Brand Voice'
 * matches 'brand voice'. Empty inputs return empty arrays (or
 * zero-match arrays) without throwing — the UI handles the empty-state
 * presentation, this helper just does the math.
 */
export function suggestPersonas(
  input: SuggestPersonasInput,
): PersonaSuggestion[] {
  const { campaignCategories, personas } = input;
  const wanted = new Set(
    campaignCategories.map((c) => c.trim().toLowerCase()).filter(Boolean),
  );

  const scored = personas.map((persona) => ({
    persona,
    matchCount: countMatches(persona.tags, wanted),
  }));

  // Stable sort: matchCount desc, then updatedAt desc (newest first).
  // Drizzle returns `updatedAt` as an ISO string when fetched via the
  // JSON API — Date.parse handles both ISO and the rare numeric case.
  scored.sort((a, b) => {
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
    const ta = Date.parse(a.persona.updatedAt) || 0;
    const tb = Date.parse(b.persona.updatedAt) || 0;
    return tb - ta;
  });

  return scored;
}

function countMatches(tags: string[], wanted: Set<string>): number {
  if (wanted.size === 0) return 0;
  let n = 0;
  for (const tag of tags) {
    if (wanted.has(tag.trim().toLowerCase())) n++;
  }
  return n;
}
