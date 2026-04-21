/**
 * Per-mode judge call dispatcher.
 *
 * Each exported function takes the context needed for one mode's
 * judging work and returns either a parsed response + cost delta, or
 * a skip/fail reason. No DB writes happen here — the runner owns
 * persistence. Keeping judge-calls side-effect-free keeps the tests
 * honest (no DB mocks needed) and makes resume-after-failure trivial:
 * a missing response table row = "retry this seat".
 */
import { callOpenRouter, type OpenRouterCallResult } from '../openrouter.js';

// tsconfig has `strict: false`, so TS's narrowing of discriminated
// unions via `result.ok` doesn't carry through async callbacks
// reliably. Use an explicit Extract cast — matches the pattern in
// src/server/routes/campaigns/generate.ts.
type OpenRouterError = Extract<OpenRouterCallResult, { ok: false }>;
import { coinFlip } from '../tournament.js';
import { isJudgeAllowed } from './panel-assembly.js';
import { tournamentJudgePrompt, parseTournamentVerdict } from './prompts/tournament-judge.js';
import { sliderJudgePrompt, parseSliderScore } from './prompts/slider-judge.js';
import {
  approveRejectJudgePrompt,
  parseApproveRejectVerdict,
} from './prompts/approve-reject-judge.js';
import {
  bestOfNJudgePrompt,
  parseBestOfNChoice,
  letterLabels,
} from './prompts/best-of-n-judge.js';
import {
  multiAxisJudgePrompt,
  parseMultiAxisScores,
  type MultiAxisDimension,
} from './prompts/multi-axis-judge.js';
import {
  qualitativeJudgePrompt,
  cleanQualitativeFeedback,
} from './prompts/qualitative-judge.js';

export interface JudgeSeatContext {
  judgeModelId: string;
  personaSystemPrompt: string | null;
}

export interface JudgePromptContext {
  promptText: string;
  promptContext: string | null;
}

export type JudgeOutcome<T> =
  | { kind: 'ok'; payload: T; costUsd: number; latencyMs: number }
  | {
      kind: 'skipped';
      reason: 'cross_family_exclusion';
      message: string;
    }
  | {
      kind: 'failed';
      reason: 'parse' | 'http' | 'timeout' | 'empty' | 'network' | 'abort';
      message: string;
      latencyMs: number;
    };

/** Tournament single-battle verdict. Used once per bracket position. */
export interface TournamentBattleInput {
  seat: JudgeSeatContext;
  prompt: JudgePromptContext;
  a: { providerModelId: string; output: string };
  b: { providerModelId: string; output: string };
}

export async function judgeTournamentBattle(
  input: TournamentBattleInput,
  signal?: AbortSignal,
): Promise<JudgeOutcome<'A' | 'B' | 'tie' | 'both_bad'>> {
  if (
    !isJudgeAllowed(input.seat.judgeModelId, [
      input.a.providerModelId,
      input.b.providerModelId,
    ])
  ) {
    return {
      kind: 'skipped',
      reason: 'cross_family_exclusion',
      message: `judge ${input.seat.judgeModelId} shares a family with a candidate`,
    };
  }

  const { system, user } = tournamentJudgePrompt({
    personaSystemPrompt: input.seat.personaSystemPrompt,
    promptText: input.prompt.promptText,
    promptContext: input.prompt.promptContext,
    outputA: input.a.output,
    outputB: input.b.output,
  });
  const result = await callOpenRouter({
    providerModelId: input.seat.judgeModelId,
    context: system,
    prompt: user,
    signal,
  });
  if (!result.ok) return failedFrom(result as OpenRouterError);
  const verdict = parseTournamentVerdict(result.output);
  if (verdict === null) {
    return {
      kind: 'failed',
      reason: 'parse',
      message: `could not parse tournament verdict: ${result.output.slice(0, 80)}`,
      latencyMs: result.latencyMs,
    };
  }
  return {
    kind: 'ok',
    payload: verdict,
    costUsd: result.costUsd ?? 0,
    latencyMs: result.latencyMs,
  };
}

/** Slider judge — one score in [min, max]. */
export async function judgeSlider(
  input: {
    seat: JudgeSeatContext;
    prompt: JudgePromptContext;
    output: string;
    targetProviderModelId: string;
    min: number;
    max: number;
    minLabel?: string | null;
    maxLabel?: string | null;
  },
  signal?: AbortSignal,
): Promise<JudgeOutcome<number>> {
  if (!isJudgeAllowed(input.seat.judgeModelId, [input.targetProviderModelId])) {
    return crossFamilySkip(input.seat.judgeModelId, input.targetProviderModelId);
  }
  const { system, user } = sliderJudgePrompt({
    personaSystemPrompt: input.seat.personaSystemPrompt,
    promptText: input.prompt.promptText,
    promptContext: input.prompt.promptContext,
    output: input.output,
    min: input.min,
    max: input.max,
    minLabel: input.minLabel,
    maxLabel: input.maxLabel,
  });
  const result = await callOpenRouter({
    providerModelId: input.seat.judgeModelId,
    context: system,
    prompt: user,
    signal,
  });
  if (!result.ok) return failedFrom(result as OpenRouterError);
  const score = parseSliderScore(result.output, input.min, input.max);
  if (score === null) {
    return {
      kind: 'failed',
      reason: 'parse',
      message: `could not parse slider score in [${input.min},${input.max}]: ${result.output.slice(0, 80)}`,
      latencyMs: result.latencyMs,
    };
  }
  return {
    kind: 'ok',
    payload: score,
    costUsd: result.costUsd ?? 0,
    latencyMs: result.latencyMs,
  };
}

/** Approve/reject judge. */
export async function judgeApproveReject(
  input: {
    seat: JudgeSeatContext;
    prompt: JudgePromptContext;
    output: string;
    targetProviderModelId: string;
    approveLabel?: string | null;
    rejectLabel?: string | null;
  },
  signal?: AbortSignal,
): Promise<JudgeOutcome<boolean>> {
  if (!isJudgeAllowed(input.seat.judgeModelId, [input.targetProviderModelId])) {
    return crossFamilySkip(input.seat.judgeModelId, input.targetProviderModelId);
  }
  const { system, user } = approveRejectJudgePrompt({
    personaSystemPrompt: input.seat.personaSystemPrompt,
    promptText: input.prompt.promptText,
    promptContext: input.prompt.promptContext,
    output: input.output,
    approveLabel: input.approveLabel,
    rejectLabel: input.rejectLabel,
  });
  const result = await callOpenRouter({
    providerModelId: input.seat.judgeModelId,
    context: system,
    prompt: user,
    signal,
  });
  if (!result.ok) return failedFrom(result as OpenRouterError);
  const verdict = parseApproveRejectVerdict(result.output);
  if (verdict === null) {
    return {
      kind: 'failed',
      reason: 'parse',
      message: `could not parse approve/reject: ${result.output.slice(0, 80)}`,
      latencyMs: result.latencyMs,
    };
  }
  return {
    kind: 'ok',
    payload: verdict,
    costUsd: result.costUsd ?? 0,
    latencyMs: result.latencyMs,
  };
}

/** Best-of-N: judge sees all candidates, picks one label. */
export async function judgeBestOfN(
  input: {
    seat: JudgeSeatContext;
    prompt: JudgePromptContext;
    candidates: Array<{
      providerModelId: string;
      campaignModelId: string;
      output: string;
    }>;
  },
  signal?: AbortSignal,
): Promise<JudgeOutcome<{ chosenCampaignModelId: string }>> {
  if (
    !isJudgeAllowed(
      input.seat.judgeModelId,
      input.candidates.map((c) => c.providerModelId),
    )
  ) {
    return {
      kind: 'skipped',
      reason: 'cross_family_exclusion',
      message: `judge ${input.seat.judgeModelId} shares a family with at least one candidate`,
    };
  }
  const labels = letterLabels(input.candidates.length);
  const labeledCandidates = input.candidates.map((c, i) => ({
    label: labels[i],
    output: c.output,
  }));
  const { system, user } = bestOfNJudgePrompt({
    personaSystemPrompt: input.seat.personaSystemPrompt,
    promptText: input.prompt.promptText,
    promptContext: input.prompt.promptContext,
    candidates: labeledCandidates,
  });
  const result = await callOpenRouter({
    providerModelId: input.seat.judgeModelId,
    context: system,
    prompt: user,
    signal,
  });
  if (!result.ok) return failedFrom(result as OpenRouterError);
  const choice = parseBestOfNChoice(result.output, labels);
  if (choice === null) {
    return {
      kind: 'failed',
      reason: 'parse',
      message: `could not parse best-of-N label: ${result.output.slice(0, 80)}`,
      latencyMs: result.latencyMs,
    };
  }
  const idx = labels.indexOf(choice);
  const chosen = input.candidates[idx];
  return {
    kind: 'ok',
    payload: { chosenCampaignModelId: chosen.campaignModelId },
    costUsd: result.costUsd ?? 0,
    latencyMs: result.latencyMs,
  };
}

/** Multi-axis: judge emits per-dimension scores. */
export async function judgeMultiAxis(
  input: {
    seat: JudgeSeatContext;
    prompt: JudgePromptContext;
    output: string;
    targetProviderModelId: string;
    dimensions: readonly MultiAxisDimension[];
  },
  signal?: AbortSignal,
): Promise<JudgeOutcome<Record<string, number>>> {
  if (!isJudgeAllowed(input.seat.judgeModelId, [input.targetProviderModelId])) {
    return crossFamilySkip(input.seat.judgeModelId, input.targetProviderModelId);
  }
  const { system, user } = multiAxisJudgePrompt({
    personaSystemPrompt: input.seat.personaSystemPrompt,
    promptText: input.prompt.promptText,
    promptContext: input.prompt.promptContext,
    output: input.output,
    dimensions: input.dimensions,
  });
  const result = await callOpenRouter({
    providerModelId: input.seat.judgeModelId,
    context: system,
    prompt: user,
    signal,
  });
  if (!result.ok) return failedFrom(result as OpenRouterError);
  const scores = parseMultiAxisScores(result.output, input.dimensions);
  if (scores === null) {
    return {
      kind: 'failed',
      reason: 'parse',
      message: `could not parse multi-axis JSON: ${result.output.slice(0, 80)}`,
      latencyMs: result.latencyMs,
    };
  }
  return {
    kind: 'ok',
    payload: scores,
    costUsd: result.costUsd ?? 0,
    latencyMs: result.latencyMs,
  };
}

/** Qualitative: free-text feedback. Always returns a string (possibly empty). */
export async function judgeQualitative(
  input: {
    seat: JudgeSeatContext;
    prompt: JudgePromptContext;
    output: string;
    targetProviderModelId: string;
    qualitativePrompt?: string | null;
  },
  signal?: AbortSignal,
): Promise<JudgeOutcome<string>> {
  if (!isJudgeAllowed(input.seat.judgeModelId, [input.targetProviderModelId])) {
    return crossFamilySkip(input.seat.judgeModelId, input.targetProviderModelId);
  }
  const { system, user } = qualitativeJudgePrompt({
    personaSystemPrompt: input.seat.personaSystemPrompt,
    promptText: input.prompt.promptText,
    promptContext: input.prompt.promptContext,
    output: input.output,
    qualitativePrompt: input.qualitativePrompt,
  });
  const result = await callOpenRouter({
    providerModelId: input.seat.judgeModelId,
    context: system,
    prompt: user,
    signal,
  });
  if (!result.ok) return failedFrom(result as OpenRouterError);
  const cleaned = cleanQualitativeFeedback(result.output);
  return {
    kind: 'ok',
    payload: cleaned,
    costUsd: result.costUsd ?? 0,
    latencyMs: result.latencyMs,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────

function failedFrom(
  result: OpenRouterError,
): Extract<JudgeOutcome<never>, { kind: 'failed' }> {
  return {
    kind: 'failed',
    reason: result.kind,
    message: result.message,
    latencyMs: result.latencyMs,
  };
}

function crossFamilySkip(
  judgeId: string,
  candidateId: string,
): Extract<JudgeOutcome<never>, { kind: 'skipped' }> {
  return {
    kind: 'skipped',
    reason: 'cross_family_exclusion',
    message: `judge ${judgeId} shares a family with ${candidateId}`,
  };
}

/**
 * Re-exported for runner: coin-flip for tournament ties on b1/b2 rows
 * (mirrors the human-side behavior in submit.ts).
 */
export { coinFlip };
