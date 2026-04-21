/**
 * Approve/reject judge prompt. The judge emits exactly "approve" or
 * "reject" — the rest of the pipeline translates that into a boolean.
 */
export function approveRejectJudgePrompt(args: {
  personaSystemPrompt?: string | null;
  promptText: string;
  promptContext: string | null;
  output: string;
  approveLabel?: string | null;
  rejectLabel?: string | null;
}): { system: string; user: string } {
  const personaBlock = args.personaSystemPrompt?.trim()
    ? args.personaSystemPrompt.trim() + '\n\n'
    : '';

  const labels =
    args.approveLabel && args.rejectLabel
      ? ` (${args.approveLabel.toLowerCase()} / ${args.rejectLabel.toLowerCase()})`
      : '';

  const system =
    personaBlock +
    (args.personaSystemPrompt?.trim()
      ? `You are deciding whether to approve or reject this AI-generated response from the perspective described above.`
      : `You are a careful evaluator of AI model outputs. Decide whether this response is good enough to approve${labels}. Treat "approve" as "I would use this" and "reject" as "I would not".`) +
    `\n\nAnswer with exactly one word: approve or reject. Do not explain.`;

  const ctx = args.promptContext?.trim()
    ? `\n\nContext:\n${args.promptContext.trim()}`
    : '';
  const user = `Prompt:\n${args.promptText}${ctx}\n\nResponse:\n${args.output}\n\nAnswer:`;
  return { system, user };
}

export function parseApproveRejectVerdict(raw: string): boolean | null {
  const t = raw.trim().toLowerCase().replace(/[`"'.]/g, '');
  if (t.startsWith('approve')) return true;
  if (t.startsWith('reject')) return false;
  // Occasional "yes" / "no" style — treat generously.
  if (t.startsWith('yes') || t.startsWith('pass')) return true;
  if (t.startsWith('no') || t.startsWith('fail')) return false;
  return null;
}
