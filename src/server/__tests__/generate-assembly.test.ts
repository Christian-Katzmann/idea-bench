/**
 * Tests for the Plan 04 per-kind generation assembly. `assembleCall`
 * is a pure function — no DB, no OpenRouter — so we exercise the
 * three kinds against minimal fixtures and assert the resulting
 * `OpenRouterCallInput` has the expected `providerModelId`, `context`,
 * and `prompt`.
 *
 * The `kind='model'` branch is the legacy path; if it diverges, the
 * existing model-arena flow regresses.
 */
import { describe, it, expect } from 'vitest';
import {
  assembleCall,
  type AssembleCallInput,
} from '../routes/campaigns/generate.js';

type Campaign = AssembleCallInput['campaign'];
type Contestant = AssembleCallInput['contestant'];
type TestCase = AssembleCallInput['testCase'];

const modelCampaign = (): Campaign => ({
  kind: 'model',
  pinnedProviderModelId: null,
  pinnedSystemPrompt: null,
  standaloneVariants: false,
});

const modelContestant = (): Contestant => ({
  providerModelId: 'anthropic/claude-opus-4-6',
  variantText: null,
  params: { temperature: 0.7 },
});

const promptContestant = (variantText: string): Contestant => ({
  providerModelId: null,
  variantText,
  params: {},
});

const tc = (text: string, context: string | null = null): TestCase => ({
  text,
  context,
});

describe('assembleCall — kind=model (legacy)', () => {
  it('assembles a model call from contestant + test case', () => {
    const out = assembleCall({
      campaign: modelCampaign(),
      contestant: modelContestant(),
      testCase: tc('hello', 'be brief'),
    });
    expect(out).toEqual({
      providerModelId: 'anthropic/claude-opus-4-6',
      context: 'be brief',
      prompt: 'hello',
      params: { temperature: 0.7 },
    });
  });

  it('passes a null context through when the test case has none', () => {
    const out = assembleCall({
      campaign: modelCampaign(),
      contestant: modelContestant(),
      testCase: tc('hello'),
    });
    expect(out.context).toBeNull();
    expect(out.params).toEqual({ temperature: 0.7 });
  });

  it('coerces null params to undefined (matches the legacy call shape)', () => {
    const out = assembleCall({
      campaign: modelCampaign(),
      contestant: { ...modelContestant(), params: null },
      testCase: tc('hi'),
    });
    expect(out.params).toBeUndefined();
  });
});

describe('assembleCall — kind=prompt', () => {
  const promptCampaign = (
    pinnedSystemPrompt: string | null = null,
    standaloneVariants = false,
  ): Campaign => ({
    kind: 'prompt',
    pinnedProviderModelId: 'openai/gpt-5',
    pinnedSystemPrompt,
    standaloneVariants,
  });

  it('uses the pinned model and substitutes {{input}} into the variant', () => {
    const out = assembleCall({
      campaign: promptCampaign(),
      contestant: promptContestant('Translate: {{input}}'),
      testCase: tc('hello world'),
    });
    expect(out.providerModelId).toBe('openai/gpt-5');
    expect(out.prompt).toBe('Translate: hello world');
  });

  it('appends test-case text after a blank line when variant has no token', () => {
    const out = assembleCall({
      campaign: promptCampaign(),
      contestant: promptContestant('Standalone variant body.'),
      testCase: tc('extra input'),
    });
    expect(out.prompt).toBe('Standalone variant body.\n\nextra input');
  });

  it('uses pinnedSystemPrompt as the system message when set', () => {
    const out = assembleCall({
      campaign: promptCampaign('You are a translator.'),
      contestant: promptContestant('Variant: {{input}}'),
      testCase: tc('hi', 'per-test context'),
    });
    expect(out.context).toBe('You are a translator.');
  });

  it('falls back to the test-case context when no pinnedSystemPrompt', () => {
    const out = assembleCall({
      campaign: promptCampaign(null),
      contestant: promptContestant('Variant: {{input}}'),
      testCase: tc('hi', 'per-test context'),
    });
    expect(out.context).toBe('per-test context');
  });

  it('handles a missing test case (Plan 05 standalone-variants fallback)', () => {
    // PRD: "a campaign with kind='prompt' and zero `prompts` rows is
    // treated as a single synthetic case" — assembleCall accepts a
    // null testCase; the variant body becomes the prompt with empty
    // input substituted (or appended as blank line).
    const out = assembleCall({
      campaign: promptCampaign(),
      contestant: promptContestant('Variant: {{input}}'),
      testCase: null,
    });
    expect(out.prompt).toBe('Variant: ');
  });

  it('appends an empty line for a tokenless variant when test case is missing', () => {
    // Counterpart to the {{input}}-bearing case above. With no test
    // case and no token, the renderTemplate fallback still appends —
    // this is the empty-input edge that Plan 05 will replace once the
    // standalone-variants flag is wired through assembleCall (Phase 1).
    const out = assembleCall({
      campaign: promptCampaign(),
      contestant: promptContestant('Standalone variant body.'),
      testCase: null,
    });
    expect(out.prompt).toBe('Standalone variant body.\n\n');
  });

  // System-message resolution chain (PRD → "Held-constant context"):
  //   pinnedSystemPrompt → testCase.context → null
  // assembleCall returns it as `context`. Each rung verified once.
  describe('system message fallback chain', () => {
    it('rung 1: pinnedSystemPrompt wins over per-test-case context', () => {
      const out = assembleCall({
        campaign: promptCampaign('Pinned persona.'),
        contestant: promptContestant('V: {{input}}'),
        testCase: tc('hi', 'per-test context'),
      });
      expect(out.context).toBe('Pinned persona.');
    });

    it('rung 2: falls through to testCase.context when pinnedSystemPrompt is null', () => {
      const out = assembleCall({
        campaign: promptCampaign(null),
        contestant: promptContestant('V: {{input}}'),
        testCase: tc('hi', 'per-test context'),
      });
      expect(out.context).toBe('per-test context');
    });

    it('rung 3: returns null when neither rung is set', () => {
      const out = assembleCall({
        campaign: promptCampaign(null),
        contestant: promptContestant('V: {{input}}'),
        testCase: tc('hi', null),
      });
      expect(out.context).toBeNull();
    });

    it('rung 3: returns null when test case itself is missing', () => {
      const out = assembleCall({
        campaign: promptCampaign(null),
        contestant: promptContestant('V: {{input}}'),
        testCase: null,
      });
      expect(out.context).toBeNull();
    });
  });

  // Plan 05 P1-C — Standalone-variants wiring through assembleCall.
  // When the campaign flag is on, `renderTemplate({ standalone: true })`
  // is called: variant body passes through verbatim including any
  // literal `{{input}}` token; test-case text is ignored.
  describe('standaloneVariants flag', () => {
    it('returns the variant body verbatim when standaloneVariants is true', () => {
      const out = assembleCall({
        campaign: promptCampaign(null, true),
        contestant: promptContestant('Translate: {{input}}'),
        testCase: tc('hello world'),
      });
      // No substitution; literal `{{input}}` preserved.
      expect(out.prompt).toBe('Translate: {{input}}');
    });

    it('preserves a tokenless variant verbatim instead of appending input', () => {
      const out = assembleCall({
        campaign: promptCampaign(null, true),
        contestant: promptContestant('You are concise.'),
        testCase: tc('extra input'),
      });
      // Without the flag this would be 'You are concise.\n\nextra input'.
      expect(out.prompt).toBe('You are concise.');
    });

    it('still resolves the system message normally under standalone', () => {
      // standaloneVariants only affects the user prompt; system context
      // resolution (pinnedSystemPrompt → testCase.context → null) is
      // unchanged.
      const out = assembleCall({
        campaign: promptCampaign('Pinned persona.', true),
        contestant: promptContestant('V: {{input}}'),
        testCase: tc('hi', 'per-test context'),
      });
      expect(out.context).toBe('Pinned persona.');
      expect(out.prompt).toBe('V: {{input}}');
    });
  });
});

describe('assembleCall — kind=system_prompt', () => {
  const sysCampaign = (
    overrides: Partial<Campaign> = {},
  ): Campaign => ({
    kind: 'system_prompt',
    pinnedProviderModelId: 'anthropic/claude-sonnet-4-6',
    standaloneVariants: false,
    pinnedSystemPrompt: null,
    ...overrides,
  });

  it("uses the variant text as the system message and the test case as the prompt", () => {
    const out = assembleCall({
      campaign: sysCampaign(),
      contestant: promptContestant('You are concise.'),
      testCase: tc('explain entropy'),
    });
    expect(out).toEqual({
      providerModelId: 'anthropic/claude-sonnet-4-6',
      context: 'You are concise.',
      prompt: 'explain entropy',
    });
  });

  it('does not substitute {{input}} inside the system-prompt variant', () => {
    // System-prompt arenas test the system message verbatim — there's
    // no template substitution inside it.
    const out = assembleCall({
      campaign: sysCampaign(),
      contestant: promptContestant('Use {{input}} as the placeholder.'),
      testCase: tc('hello'),
    });
    expect(out.context).toBe('Use {{input}} as the placeholder.');
    expect(out.prompt).toBe('hello');
  });

  it("ignores testCase.context — the variant body is the only system message", () => {
    // Plan 06 — for system_prompt arenas, the variant IS the system
    // message. Per-prompt context (used by kind='model') is irrelevant
    // and would muddy the comparison if leaked into the call.
    const out = assembleCall({
      campaign: sysCampaign(),
      contestant: promptContestant('You are concise.'),
      testCase: tc('explain entropy', 'leftover per-prompt framing'),
    });
    expect(out.context).toBe('You are concise.');
    expect(out.prompt).toBe('explain entropy');
  });

  it('ignores pinnedSystemPrompt even if accidentally set', () => {
    // Plan 06 — pinnedSystemPrompt is reserved for kind='prompt' arenas
    // (a held-constant persona around variants of a USER message). A
    // system-prompt arena varies the system message itself; if a row
    // somehow has pinnedSystemPrompt populated (legacy data, manual
    // edit), it must NOT shadow the variant being tested.
    const out = assembleCall({
      campaign: sysCampaign({ pinnedSystemPrompt: 'leftover persona' }),
      contestant: promptContestant('You are concise.'),
      testCase: tc('explain entropy'),
    });
    expect(out.context).toBe('You are concise.');
    expect(out.prompt).toBe('explain entropy');
  });
});
