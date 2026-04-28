/**
 * Tiny templating helper for Plan 04 (Arena Modes Foundation) and
 * Plan 05 (Prompt Arena). The substitution rules are intentionally
 * narrow — operators get one well-defined behavior, no surprises.
 *
 * Rules (single, exact):
 *   1. `standalone === true` → return `template` verbatim. Used by Plan
 *      05's "Advanced: standalone variants" mode where the variant IS
 *      the prompt and test-case text is ignored.
 *   2. Otherwise, if `template` contains the literal token `{{input}}`,
 *      a SINGLE replacement is performed (only the first occurrence)
 *      and the result is returned. No regex flexibility, no whitespace
 *      tolerance: `{{ input }}` does NOT match — operators must use
 *      `{{input}}` exactly.
 *   3. Otherwise (no `{{input}}` in `template`), `input` is appended
 *      after a blank line: `${template}\n\n${input}`. This matches the
 *      PRD's "If `template` contains no `{{input}}`, input is appended
 *      after a newline" behavior — a blank line keeps the variant body
 *      and the test-case content visually separated.
 *
 * What this is NOT:
 *   - Not a Mustache/Handlebars implementation. No `{{#each}}`, no
 *     conditionals, no nested expressions, no helpers.
 *   - Not whitespace-tolerant. The token must be `{{input}}`,
 *     character for character.
 *   - Not multi-token. Only `{{input}}`. Other braces pass through.
 *
 * The narrowness is deliberate: any expansion would couple Plan 04's
 * runtime to a templating mental model the operator UI doesn't yet
 * teach. Revisit if/when operators ask for more.
 */

/** Single literal token recognized by `renderTemplate`. */
const INPUT_TOKEN = '{{input}}';

export interface RenderTemplateOptions {
  /**
   * When true, ignore `input` entirely and return `template` verbatim.
   * Plan 05 wires this for the "standalone variants" advanced mode
   * where the variant body is the full prompt.
   */
  standalone?: boolean;
}

export function renderTemplate(
  template: string,
  input: string,
  opts?: RenderTemplateOptions,
): string {
  if (opts?.standalone) return template;
  const idx = template.indexOf(INPUT_TOKEN);
  if (idx !== -1) {
    return (
      template.slice(0, idx) + input + template.slice(idx + INPUT_TOKEN.length)
    );
  }
  return `${template}\n\n${input}`;
}
