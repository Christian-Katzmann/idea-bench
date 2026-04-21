/**
 * Slider-mode judge prompt. One call per (voter, prompt, model). The
 * judge emits an integer in [min, max].
 */
export function sliderJudgePrompt(args: {
  personaSystemPrompt?: string | null;
  promptText: string;
  promptContext: string | null;
  output: string;
  min: number;
  max: number;
  minLabel?: string | null;
  maxLabel?: string | null;
}): { system: string; user: string } {
  const personaBlock = args.personaSystemPrompt?.trim()
    ? args.personaSystemPrompt.trim() + '\n\n'
    : '';

  const scaleHint =
    args.minLabel && args.maxLabel
      ? ` (${args.min} = ${args.minLabel}; ${args.max} = ${args.maxLabel})`
      : '';

  const system =
    personaBlock +
    (args.personaSystemPrompt?.trim()
      ? `You are rating an AI-generated response from the perspective described above.`
      : `You are a careful evaluator of AI model outputs. Rate the response on overall quality — clarity, correctness, usefulness. Grade strictly; ${args.max} is reserved for genuinely excellent output.`) +
    `\n\nAnswer with a single integer from ${args.min} to ${args.max}${scaleHint}. Do not explain. Do not add units or punctuation.`;

  const ctx = args.promptContext?.trim()
    ? `\n\nContext:\n${args.promptContext.trim()}`
    : '';
  const user = `Prompt:\n${args.promptText}${ctx}\n\nResponse:\n${args.output}\n\nScore (${args.min}–${args.max}):`;
  return { system, user };
}

/** Returns an integer within [min, max] or null if the raw reply can't be parsed cleanly. */
export function parseSliderScore(
  raw: string,
  min: number,
  max: number,
): number | null {
  // Extract the first integer from the reply.
  const m = raw.trim().match(/-?\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}
