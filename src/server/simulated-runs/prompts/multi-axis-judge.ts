/**
 * Multi-axis judge prompt. The judge emits a JSON object mapping
 * dimension keys to integer scores in each dimension's [min, max].
 */
export interface MultiAxisDimension {
  key: string;
  label: string;
  min: number;
  max: number;
}

export function multiAxisJudgePrompt(args: {
  personaSystemPrompt?: string | null;
  promptText: string;
  promptContext: string | null;
  output: string;
  dimensions: readonly MultiAxisDimension[];
}): { system: string; user: string } {
  const personaBlock = args.personaSystemPrompt?.trim()
    ? args.personaSystemPrompt.trim() + '\n\n'
    : '';

  const dimLines = args.dimensions
    .map((d) => `  - "${d.key}" (${d.label}) on ${d.min}–${d.max}`)
    .join('\n');
  const example = args.dimensions
    .map((d) => `"${d.key}": ${Math.round((d.min + d.max) / 2)}`)
    .join(', ');

  const system =
    personaBlock +
    (args.personaSystemPrompt?.trim()
      ? `You are rating an AI-generated response across several dimensions from the perspective described above.`
      : `You are a careful evaluator of AI model outputs. Rate the response on each dimension separately. Grade strictly; max scores are reserved for genuinely excellent work on that specific dimension.`) +
    `\n\nRate the response on:\n${dimLines}\n\nAnswer with exactly one JSON object — keys are the dimension keys above, values are integers in the stated range. Example: {${example}}. Do not include any other text.`;

  const ctx = args.promptContext?.trim()
    ? `\n\nContext:\n${args.promptContext.trim()}`
    : '';
  const user = `Prompt:\n${args.promptText}${ctx}\n\nResponse:\n${args.output}\n\nJSON:`;
  return { system, user };
}

/**
 * Extracts a JSON object from the raw reply. Tolerant of leading/
 * trailing prose — a model that can't resist explaining still often
 * emits a clean object somewhere in the response.
 *
 * Returns null if no object can be found or if any dimension key is
 * missing / out-of-range.
 */
export function parseMultiAxisScores(
  raw: string,
  dimensions: readonly MultiAxisDimension[],
): Record<string, number> | null {
  const trimmed = raw.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Fall back: find the first { ... } block.
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const scores: Record<string, number> = {};
  for (const d of dimensions) {
    const raw = obj[d.key];
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : NaN;
    if (!Number.isFinite(n)) return null;
    const rounded = Math.round(n);
    if (rounded < d.min || rounded > d.max) return null;
    scores[d.key] = rounded;
  }
  return scores;
}
