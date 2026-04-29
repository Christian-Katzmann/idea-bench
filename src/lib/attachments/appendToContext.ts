/**
 * Pure helper for inlining extracted file text into the per-prompt
 * Context field on the campaign wizard. Files themselves are not
 * persisted — only their extracted text is, so the API contract stays
 * "context is one text column".
 *
 * Total cap defaults to 50,000 chars (~12.5k tokens). That keeps a single
 * prompt's context comfortably inside the 128k window of every model we
 * route to today, even after the system prompt, the prompt body, the
 * variant, and the model's own output budget. Operators can still hand-edit
 * the textarea, so this is a guardrail, not a hard limit on what they can
 * type in directly.
 */
export const DEFAULT_TOTAL_CHAR_CAP = 50_000;

export interface AppendResult {
  /** New textarea value after insertion. */
  next: string;
  /**
   * How many characters of the incoming `extracted` text were dropped
   * because the cap was reached. 0 if everything fit.
   */
  truncated: number;
  /**
   * True if the cap was hit before any of the new text could be appended
   * (caller should surface "Context is full" instead of a silent no-op).
   */
  rejected: boolean;
}

function makeSeparator(filename: string): string {
  return `--- [${filename}] ---`;
}

/**
 * Append a file's extracted text to an existing context blob, with a
 * separator header. Truncates if the combined length would exceed `cap`.
 */
export function appendToContext(
  existing: string,
  filename: string,
  extracted: string,
  cap: number = DEFAULT_TOTAL_CHAR_CAP,
): AppendResult {
  const separator = makeSeparator(filename);
  const prefix = existing.length > 0 ? `${existing}\n\n` : '';
  const block = `${separator}\n${extracted}`;

  const overhead = prefix.length + separator.length + 1; // 1 for the \n after separator
  const room = cap - overhead;

  if (room <= 0) {
    return { next: existing, truncated: extracted.length, rejected: true };
  }

  if (extracted.length <= room) {
    return {
      next: `${prefix}${block}`,
      truncated: 0,
      rejected: false,
    };
  }

  const kept = extracted.slice(0, room);
  return {
    next: `${prefix}${separator}\n${kept}`,
    truncated: extracted.length - room,
    rejected: false,
  };
}
