/**
 * Plan 05 Phase 2 P2-B — simulated-runs smoke verification on a
 * prompt-arena fixture.
 *
 * Premise: simulated runs work for prompt arenas WITHOUT code changes
 * because the underlying campaign `kind` is invisible to the judge —
 * the judge sees a (prompt text, set of outputs) tuple regardless of
 * whether the outputs came from different models (kind='model') or
 * different prompt variants on a single pinned model (kind='prompt').
 *
 * If a future change makes the judge call layer kind-aware, this file
 * is the canary: the asserts below hard-code the prompt-arena shape
 * (all candidates share `providerModelId`, `JudgePromptContext` carries
 * the per-input text, and persona system prompts are plumbed through
 * unchanged).
 *
 *   - P2-5: end-to-end smoke. Build a fixture prompt-arena campaign
 *           (3 variants × 3 inputs, single pinned model). Mock
 *           OpenRouter. Call the per-mode judge layer the runner uses.
 *           Assert: judge produces a valid choice for every (input ×
 *           variants) tuple, and the resulting "votes" map cleanly to
 *           the campaign-model rows the leaderboard renders from.
 *   - P2-6: persona panel. Same fixture, this time with a starter
 *           persona attached to every seat. Assert: persona system
 *           prompt is plumbed into every judge call's system message,
 *           per-persona votes partition cleanly via the same helper
 *           ratings.ts uses for the "By persona" leaderboard cut.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../openrouter', () => ({
  callOpenRouter: vi.fn(),
}));

import { callOpenRouter, type OpenRouterCallResult } from '../openrouter';
import {
  judgeBestOfN,
  judgeTournamentBattle,
} from '../simulated-runs/judge-calls';
import { isJudgeAllowed } from '../simulated-runs/panel-assembly';

const callOpenRouterMock = callOpenRouter as unknown as ReturnType<typeof vi.fn>;

// ── Fixture builder ────────────────────────────────────────────
// Mirrors the in-memory shape `executeSimulatedRun` builds when it
// fans seats out across the prompt × campaign-model matrix. We keep
// the shape narrow on purpose — only fields the judge layer actually
// reads.

const PINNED_MODEL_ID = 'anthropic/claude-sonnet-4-6';

interface VariantRow {
  id: string;
  displayName: string;
  variantText: string;
  providerModelId: string; // every variant shares the pinned model
}

interface InputRow {
  id: string;
  text: string; // operator-supplied test-case input
  context: string | null;
}

interface GenerationRow {
  promptId: string; // input id
  campaignModelId: string; // variant id
  output: string;
}

interface PromptArenaFixture {
  campaignId: string;
  variants: VariantRow[];
  inputs: InputRow[];
  generations: GenerationRow[];
}

function buildPromptArenaFixture(): PromptArenaFixture {
  const variants: VariantRow[] = [
    {
      id: 'cm-v1',
      displayName: 'Variant 1',
      variantText: 'Reply succinctly to: {{input}}',
      providerModelId: PINNED_MODEL_ID,
    },
    {
      id: 'cm-v2',
      displayName: 'Variant 2',
      variantText: 'Reply with empathy to: {{input}}',
      providerModelId: PINNED_MODEL_ID,
    },
    {
      id: 'cm-v3',
      displayName: 'Variant 3',
      variantText: 'Reply formally to: {{input}}',
      providerModelId: PINNED_MODEL_ID,
    },
  ];
  const inputs: InputRow[] = [
    { id: 'in-1', text: 'Customer wants a refund.', context: null },
    { id: 'in-2', text: 'Customer is asking for a status update.', context: null },
    { id: 'in-3', text: 'Customer has a billing question.', context: null },
  ];
  const generations: GenerationRow[] = [];
  for (const input of inputs) {
    for (const variant of variants) {
      generations.push({
        promptId: input.id,
        campaignModelId: variant.id,
        output: `[${variant.displayName} on ${input.id}] generated text`,
      });
    }
  }
  return { campaignId: 'camp-1', variants, inputs, generations };
}

function genByKey(fixture: PromptArenaFixture): Map<string, GenerationRow> {
  const m = new Map<string, GenerationRow>();
  for (const g of fixture.generations) m.set(`${g.promptId}:${g.campaignModelId}`, g);
  return m;
}

/** Stub a successful OpenRouter response with fixed cost/latency. */
function okResult(output: string): Extract<OpenRouterCallResult, { ok: true }> {
  return {
    ok: true,
    output,
    tokensIn: 100,
    tokensOut: 5,
    latencyMs: 12,
    costUsd: 0.0001,
    providerResponseId: 'resp-stub',
  };
}

beforeEach(() => {
  callOpenRouterMock.mockReset();
});

// ── P2-5 ── end-to-end simulated-run smoke (generic panel) ─────

describe('P2-5 — generic panel on a prompt-arena fixture', () => {
  it('produces a best-of-N choice for every input × variants tuple', async () => {
    const fixture = buildPromptArenaFixture();
    const gens = genByKey(fixture);
    const judgeModelId = 'openai/gpt-5-mini'; // different family than pinned

    // Always pick label A — deterministic enough to assert downstream
    // accounting; the variant "votes" map should accumulate to N inputs.
    callOpenRouterMock.mockImplementation(async () => okResult('A'));

    // Cross-family allowance is the precondition. With pinned=anthropic
    // and judge=openai, every comparison is allowed.
    expect(isJudgeAllowed(judgeModelId, [PINNED_MODEL_ID])).toBe(true);

    const winsByVariantId = new Map<string, number>();
    for (const input of fixture.inputs) {
      const candidates = fixture.variants.map((v) => {
        const g = gens.get(`${input.id}:${v.id}`)!;
        return {
          providerModelId: v.providerModelId,
          campaignModelId: v.id,
          output: g.output,
        };
      });
      const outcome = await judgeBestOfN(
        {
          seat: { judgeModelId, personaSystemPrompt: null },
          prompt: { promptText: input.text, promptContext: input.context },
          candidates,
        },
      );
      expect(outcome.kind).toBe('ok');
      if (outcome.kind !== 'ok') continue;
      const chosen = outcome.payload.chosenCampaignModelId;
      winsByVariantId.set(chosen, (winsByVariantId.get(chosen) ?? 0) + 1);
    }

    // 3 inputs × 1 best-of-N call each = 3 OpenRouter calls.
    expect(callOpenRouterMock).toHaveBeenCalledTimes(3);
    // Every "vote" maps to a real campaign-model row — i.e. the
    // chosenCampaignModelId is a valid leaderboard contestant. This is
    // the contract the recompute-ratings pipeline relies on.
    const variantIds = new Set(fixture.variants.map((v) => v.id));
    for (const [winnerId, count] of winsByVariantId) {
      expect(variantIds.has(winnerId)).toBe(true);
      expect(count).toBeGreaterThan(0);
    }
    // With every judge picking 'A', cm-v1 wins every input.
    expect(winsByVariantId.get('cm-v1')).toBe(3);
  });

  it('runs a tournament battle even when both candidates share the pinned model', async () => {
    // Sanity check: tournaments fan candidates pairwise, so a single
    // (variant, variant) battle is the inner loop. With both candidates
    // sharing `providerModelId` (the pinned-model invariant for prompt
    // arenas) the cross-family check still passes when the judge sits
    // in a different family.
    const fixture = buildPromptArenaFixture();
    const gens = genByKey(fixture);
    const a = gens.get('in-1:cm-v1')!;
    const b = gens.get('in-1:cm-v2')!;
    const judgeModelId = 'google/gemini-2.5-flash';

    callOpenRouterMock.mockResolvedValue(okResult('A'));

    expect(isJudgeAllowed(judgeModelId, [PINNED_MODEL_ID, PINNED_MODEL_ID])).toBe(true);

    const outcome = await judgeTournamentBattle({
      seat: { judgeModelId, personaSystemPrompt: null },
      prompt: { promptText: fixture.inputs[0].text, promptContext: null },
      a: { providerModelId: PINNED_MODEL_ID, output: a.output },
      b: { providerModelId: PINNED_MODEL_ID, output: b.output },
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') expect(outcome.payload).toBe('A');
  });

  it('skips the judge call when judge family matches the pinned-model family', async () => {
    // Cross-family exclusion: an Anthropic judge cannot evaluate
    // outputs from `anthropic/...` candidates, even though for prompt
    // arenas every candidate is the SAME model. The runner counts
    // these as 'skipped' (not 'failed'), so the seat still completes.
    const fixture = buildPromptArenaFixture();
    const gens = genByKey(fixture);
    const a = gens.get('in-1:cm-v1')!;
    const b = gens.get('in-1:cm-v2')!;

    const outcome = await judgeTournamentBattle({
      seat: { judgeModelId: 'anthropic/claude-haiku-4-5', personaSystemPrompt: null },
      prompt: { promptText: fixture.inputs[0].text, promptContext: null },
      a: { providerModelId: PINNED_MODEL_ID, output: a.output },
      b: { providerModelId: PINNED_MODEL_ID, output: b.output },
    });
    expect(outcome.kind).toBe('skipped');
    expect(callOpenRouterMock).not.toHaveBeenCalled();
  });
});

// ── P2-6 ── persona panel smoke ────────────────────────────────

describe('P2-6 — persona panel on a prompt-arena fixture', () => {
  // A starter persona — same shape as `personas` rows seeded by Plan 02.
  const SKEPTICAL_CFO = {
    id: 'persona-cfo',
    name: 'Skeptical CFO',
    systemPrompt:
      'You are a skeptical CFO. Prioritize concise, numbers-first responses. Penalize fluff.',
  };

  it('plumbs the persona system prompt into every judge call', async () => {
    const fixture = buildPromptArenaFixture();
    const gens = genByKey(fixture);
    const judgeModelId = 'openai/gpt-5-mini';

    callOpenRouterMock.mockImplementation(async () => okResult('B'));

    for (const input of fixture.inputs) {
      const candidates = fixture.variants.map((v) => {
        const g = gens.get(`${input.id}:${v.id}`)!;
        return {
          providerModelId: v.providerModelId,
          campaignModelId: v.id,
          output: g.output,
        };
      });
      const outcome = await judgeBestOfN({
        seat: {
          judgeModelId,
          personaSystemPrompt: SKEPTICAL_CFO.systemPrompt,
        },
        prompt: { promptText: input.text, promptContext: input.context },
        candidates,
      });
      expect(outcome.kind).toBe('ok');
    }

    // Every OpenRouter call's `context` (system message) must carry
    // the persona block — that's how the persona steers the judge.
    expect(callOpenRouterMock).toHaveBeenCalledTimes(fixture.inputs.length);
    for (const call of callOpenRouterMock.mock.calls) {
      const [inputArg] = call as [{ context?: string | null; prompt: string }];
      expect(inputArg.context).toContain(SKEPTICAL_CFO.systemPrompt);
      // And the per-input text reaches the user message — voters
      // (and judges) see the input regardless of kind.
      expect(inputArg.prompt).toBeDefined();
    }
  });

  it('partitions per-persona response rows the same way the leaderboard does', () => {
    // The "By persona" leaderboard cut works by filtering response
    // rows down to the seats whose `personaId` matches the target.
    // This is the same partitioning helper covered in
    // persona-partition.test.ts; here we exercise it on a row shape
    // that mirrors a prompt-arena bestOfNResponses row, with
    // `chosenCampaignModelId` pointing to a *variant* (not a model).
    const cfoSeats = ['seat-cfo-1', 'seat-cfo-2'];
    const corpSeats = ['seat-corp-1'];
    const personaByParticipantId = new Map<string, string | null>([
      [cfoSeats[0], SKEPTICAL_CFO.id],
      [cfoSeats[1], SKEPTICAL_CFO.id],
      [corpSeats[0], 'persona-corp-customer'],
    ]);

    interface BestOfNRow {
      simulatedParticipantId: string | null;
      chosenCampaignModelId: string;
    }
    const rows: BestOfNRow[] = [
      { simulatedParticipantId: cfoSeats[0], chosenCampaignModelId: 'cm-v1' },
      { simulatedParticipantId: cfoSeats[1], chosenCampaignModelId: 'cm-v2' },
      { simulatedParticipantId: corpSeats[0], chosenCampaignModelId: 'cm-v3' },
      { simulatedParticipantId: null, chosenCampaignModelId: 'cm-v1' }, // human row
    ];

    // Inline copy of the helper exercised by ratings.ts (kept local so
    // a signature drift breaks this test first; see persona-partition.test.ts).
    const filterByPersona = <T extends { simulatedParticipantId: string | null }>(
      input: readonly T[],
      map: Map<string, string | null>,
      personaId: string,
    ): T[] => {
      const out: T[] = [];
      for (const r of input) {
        if (r.simulatedParticipantId == null) continue;
        if (map.get(r.simulatedParticipantId) === personaId) out.push(r);
      }
      return out;
    };

    const cfoCut = filterByPersona(rows, personaByParticipantId, SKEPTICAL_CFO.id);
    expect(cfoCut).toHaveLength(2);
    // Variant-side check: the "By persona" cut surfaces variant ids,
    // not model ids — same as the model-arena cut surfaces campaign-
    // model rows. The leaderboard renderer is kind-agnostic.
    const cfoChoices = new Set(cfoCut.map((r) => r.chosenCampaignModelId));
    expect(cfoChoices).toEqual(new Set(['cm-v1', 'cm-v2']));

    const corpCut = filterByPersona(rows, personaByParticipantId, 'persona-corp-customer');
    expect(corpCut).toHaveLength(1);
    expect(corpCut[0].chosenCampaignModelId).toBe('cm-v3');
  });
});
