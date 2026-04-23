/**
 * Substitutes `@pN` prompt references in a prompt's text with the
 * resolved content of the campaign's Nth prompt (1-indexed, to match
 * how operators count prompts in the UI).
 *
 * Example:
 *   prompts = [ { orderIndex: 0, text: "Given a style guide, review code" },
 *               { orderIndex: 1, text: "@p1 — apply strictly." } ]
 *   substitutePromptRefs(prompts[1].text, promptMap)
 *   → "Given a style guide, review code — apply strictly."
 *
 * Semantics:
 *   - @p1 = prompt at orderIndex 0 (1-indexed in the UI).
 *   - Unresolved refs (out of range, non-numeric) are left as literal
 *     "@pX" in the output — predictable for operators authoring
 *     references that don't yet resolve.
 *   - Substitution is single-level: if @p1 expands to text containing
 *     @p2, the @p2 is NOT re-expanded. Prevents cycles and keeps
 *     cost/token estimates bounded.
 *   - Other @-patterns (e.g. @file.md) are left untouched so future
 *     reference namespaces can coexist.
 *
 * The generator wires this in before every call to callOpenRouter so
 * the model sees the substituted prompt; the original is preserved in
 * the prompts table for authoring/editing.
 */

import {
  parseAllAtCommands,
  hasAtReferences,
  reconstructQuery,
} from './at-path/index.js';

export interface PromptRefLookup {
  /** 0-based: text by prompt orderIndex. */
  byOrderIndex: Map<number, string>;
}

const PROMPT_REF_PATTERN = /^p(\d+)$/;

export function substitutePromptRefs(
  promptText: string,
  lookup: PromptRefLookup,
): string {
  if (!hasAtReferences(promptText)) return promptText;
  const parts = parseAllAtCommands(promptText);
  return reconstructQuery(parts, (refContent) => {
    const m = PROMPT_REF_PATTERN.exec(refContent);
    if (!m) return `@${refContent}`; // not a prompt ref → leave literal
    const n = Number.parseInt(m[1], 10);
    if (!Number.isInteger(n) || n <= 0) return `@${refContent}`;
    const target = lookup.byOrderIndex.get(n - 1);
    return target ?? `@${refContent}`;
  });
}

/** Build the lookup used by substitutePromptRefs from a campaign's prompts. */
export function buildPromptRefLookup(
  prompts: ReadonlyArray<{ orderIndex: number; text: string }>,
): PromptRefLookup {
  const byOrderIndex = new Map<number, string>();
  for (const p of prompts) byOrderIndex.set(p.orderIndex, p.text);
  return { byOrderIndex };
}
