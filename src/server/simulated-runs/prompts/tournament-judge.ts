/**
 * Tournament-mode judge prompt. One call per battle; the simulated
 * voter plays a 5-battle bracket per (voter, prompt) just like humans.
 *
 * The judge responds with exactly one token from the allowed set. We
 * parse that single token — anything longer is extracted heuristically
 * in judge-calls.ts. Keeping the answer vocabulary identical to human
 * voters (A / B / tie / both_bad) means the rest of the ratings
 * pipeline doesn't need a separate code path.
 */
export function tournamentJudgePrompt(args: {
  personaSystemPrompt?: string | null;
  promptText: string;
  promptContext: string | null;
  outputA: string;
  outputB: string;
}): { system: string; user: string } {
  const personaBlock = args.personaSystemPrompt?.trim()
    ? args.personaSystemPrompt.trim() + '\n\n'
    : '';

  const system =
    personaBlock +
    (args.personaSystemPrompt?.trim()
      ? `You are comparing two AI-generated responses to the same prompt, judging from the perspective described above.`
      : `You are a careful evaluator of AI model outputs. Judge overall quality — clarity, correctness, and usefulness. Keep opinions grounded in the content you see; do not speculate about which model produced which output.`) +
    `\n\nYou will see two responses (A and B) to the same prompt. Decide which is better. If they are roughly equal in quality, answer "tie". If both are unacceptable, answer "both_bad".\n\nAnswer with exactly one of: A, B, tie, both_bad. Do not explain. Do not quote.`;

  const ctx = args.promptContext?.trim()
    ? `\n\nContext:\n${args.promptContext.trim()}`
    : '';
  const user = `Prompt:\n${args.promptText}${ctx}\n\nResponse A:\n${args.outputA}\n\nResponse B:\n${args.outputB}\n\nAnswer:`;
  return { system, user };
}

/**
 * Parses the judge's single-word verdict. Lenient — models sometimes
 * wrap the answer in punctuation, quotes, or a short preamble. Returns
 * null on parse failure so the caller can record a `failed` vote
 * rather than writing bogus data.
 */
export function parseTournamentVerdict(
  raw: string,
): 'A' | 'B' | 'tie' | 'both_bad' | null {
  const t = raw.trim().toLowerCase().replace(/[`"'.]/g, '');
  // Try exact/leading match.
  if (t === 'a' || t.startsWith('a\n') || t.startsWith('a ') || t === 'a.') return 'A';
  if (t === 'b' || t.startsWith('b\n') || t.startsWith('b ') || t === 'b.') return 'B';
  if (t === 'tie' || t.startsWith('tie\n') || t.startsWith('tie ')) return 'tie';
  if (t === 'both_bad' || t.startsWith('both_bad') || t.includes('both bad'))
    return 'both_bad';
  // Fall back to first token.
  const first = t.split(/\s+/)[0];
  if (first === 'a') return 'A';
  if (first === 'b') return 'B';
  if (first === 'tie') return 'tie';
  return null;
}
