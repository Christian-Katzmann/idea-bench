/**
 * Qualitative judge prompt. Free-text feedback, capped in length by
 * the judge's output budget. No structured parsing — the raw response
 * is the value, after whitespace normalization and a length cap.
 */
const MAX_FEEDBACK_LENGTH = 2000;

export function qualitativeJudgePrompt(args: {
  personaSystemPrompt?: string | null;
  promptText: string;
  promptContext: string | null;
  output: string;
  qualitativePrompt?: string | null;
}): { system: string; user: string } {
  const personaBlock = args.personaSystemPrompt?.trim()
    ? args.personaSystemPrompt.trim() + '\n\n'
    : '';

  const question =
    args.qualitativePrompt?.trim() ||
    (args.personaSystemPrompt?.trim()
      ? `What's your reaction to this response, from your perspective?`
      : `What did the model do well or poorly here? Be specific.`);

  const system =
    personaBlock +
    (args.personaSystemPrompt?.trim()
      ? `You are giving written feedback on an AI-generated response from the perspective described above. Be concrete; cite what you saw.`
      : `You are a careful evaluator of AI model outputs. Give concrete, useful feedback — what worked, what didn't, what a better response would look like.`) +
    `\n\nKeep your reply under 1000 characters. Do not use bullet points; write in prose.`;

  const ctx = args.promptContext?.trim()
    ? `\n\nContext:\n${args.promptContext.trim()}`
    : '';
  const user = `Prompt:\n${args.promptText}${ctx}\n\nResponse:\n${args.output}\n\n${question}`;
  return { system, user };
}

/** Normalizes whitespace and caps length. Always returns a string (possibly empty). */
export function cleanQualitativeFeedback(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= MAX_FEEDBACK_LENGTH) return trimmed;
  return trimmed.slice(0, MAX_FEEDBACK_LENGTH - 12) + '… [trunc]';
}
