/**
 * Best-of-N judge prompt. The judge sees all N outputs and picks
 * exactly one — responding with the letter label (A, B, C, …).
 *
 * Cross-family exclusion is tricky here: the judge sees every
 * candidate at once, so if any candidate is same-family as the judge
 * we abstain from the whole prompt. That exclusion runs before this
 * prompt is ever built — see judge-calls.ts.
 */
export function bestOfNJudgePrompt(args: {
  personaSystemPrompt?: string | null;
  promptText: string;
  promptContext: string | null;
  candidates: Array<{ label: string; output: string }>;
}): { system: string; user: string } {
  const personaBlock = args.personaSystemPrompt?.trim()
    ? args.personaSystemPrompt.trim() + '\n\n'
    : '';

  const labels = args.candidates.map((c) => c.label).join(', ');
  const system =
    personaBlock +
    (args.personaSystemPrompt?.trim()
      ? `You are choosing the single best AI response to a prompt, from the perspective described above.`
      : `You are a careful evaluator of AI model outputs. Choose the single best response to the prompt — favor clarity, correctness, and usefulness. Ties are not allowed; pick the best even when the margin is small.`) +
    `\n\nAnswer with exactly one label from: ${labels}. Do not explain.`;

  const ctx = args.promptContext?.trim()
    ? `\n\nContext:\n${args.promptContext.trim()}`
    : '';
  const body = args.candidates
    .map((c) => `Response ${c.label}:\n${c.output}`)
    .join('\n\n');
  const user = `Prompt:\n${args.promptText}${ctx}\n\n${body}\n\nBest (${labels}):`;
  return { system, user };
}

/** Returns the chosen label or null on parse failure. */
export function parseBestOfNChoice(
  raw: string,
  allowedLabels: readonly string[],
): string | null {
  const t = raw.trim().toUpperCase().replace(/[`"'.:]/g, '');
  for (const label of allowedLabels) {
    // Exact single-letter match, or "Response <label>" style.
    if (t === label || t.startsWith(label + ' ') || t.startsWith(label + '\n'))
      return label;
  }
  // Last-resort: search for any allowed label as a standalone token.
  const tokens = t.split(/\s+/);
  for (const tok of tokens) {
    if (allowedLabels.includes(tok)) return tok;
  }
  return null;
}

/**
 * Letter labels A, B, C, ... for up to 26 candidates. Cap matches the
 * max campaign model count (realistically < 10).
 */
export function letterLabels(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(String.fromCharCode(65 + i));
  return out;
}
