/**
 * Validation tests for the campaign create payload parser. These cover
 * the per-kind branches added in Plan 04 — the shape rules the schema's
 * CHECK constraints rely on must match what the API accepts.
 *
 * The parser is pure: no DB access, no auth. We exercise the model-kind
 * happy path (legacy regression), the prompt/system_prompt accept paths,
 * and the per-kind rejection cases.
 *
 * The feature-flag rejection (`ALLOWED_KINDS`) lives in the handler,
 * not the parser, so the parser ACCEPTS prompt/system_prompt payloads
 * here — they're rejected one layer up.
 */
import { describe, it, expect } from 'vitest';
import { parseCreatePayload, ALLOWED_KINDS } from '../../../api/campaigns/index.js';

const FOUR_VALID_MODEL_IDS = [
  'anthropic/claude-opus-4-6',
  'anthropic/claude-sonnet-4-6',
  'openai/gpt-5',
  'google/gemini-2.5-pro',
];

const PROMPT = { text: 'tell me a joke' };

const baseModelPayload = () => ({
  name: 'Quick model arena',
  prompts: [PROMPT],
  providerModelIds: [...FOUR_VALID_MODEL_IDS],
});

describe('parseCreatePayload — model kind (legacy regression)', () => {
  it('accepts the legacy shape with no `kind` field', () => {
    const r = parseCreatePayload(baseModelPayload());
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.kind).toBe('model');
    if (r.kind === 'model') {
      expect(r.providerModelIds).toEqual(FOUR_VALID_MODEL_IDS);
    }
    expect(r.name).toBe('Quick model arena');
    expect(r.prompts).toHaveLength(1);
  });

  it('still requires ≥4 distinct provider model ids', () => {
    const payload = baseModelPayload();
    payload.providerModelIds = FOUR_VALID_MODEL_IDS.slice(0, 3);
    const r = parseCreatePayload(payload);
    expect(r).toMatchObject({ error: expect.stringContaining('at least 4') });
  });

  it('rejects unknown provider model ids', () => {
    const payload = baseModelPayload();
    payload.providerModelIds = [...FOUR_VALID_MODEL_IDS.slice(0, 3), 'foo/bar'];
    const r = parseCreatePayload(payload);
    expect(r).toMatchObject({ error: expect.stringContaining('foo/bar') });
  });

  it('rejects extra-key kind-specific fields under `model`', () => {
    const r = parseCreatePayload({
      ...baseModelPayload(),
      pinnedProviderModelId: 'anthropic/claude-opus-4-6',
    });
    expect(r).toMatchObject({
      error: expect.stringContaining('pinnedProviderModelId'),
    });
  });

  it('rejects standaloneVariants under `model`', () => {
    const r = parseCreatePayload({
      ...baseModelPayload(),
      standaloneVariants: true,
    });
    expect(r).toMatchObject({
      error: expect.stringContaining('standaloneVariants'),
    });
  });
});

describe('parseCreatePayload — prompt kind', () => {
  const promptArenaPayload = () => ({
    name: 'Prompt arena',
    kind: 'prompt' as const,
    prompts: [PROMPT],
    pinnedProviderModelId: 'anthropic/claude-sonnet-4-6',
    variants: [
      { text: 'You are a senior reviewer. {{input}}' },
      { text: 'You are a junior reviewer. {{input}}' },
    ],
  });

  it('accepts the minimal shape (≥2 variants, pinned model)', () => {
    const r = parseCreatePayload(promptArenaPayload());
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.kind).toBe('prompt');
    if (r.kind === 'prompt') {
      expect(r.variants).toHaveLength(2);
      expect(r.pinnedProviderModelId).toBe('anthropic/claude-sonnet-4-6');
      expect(r.pinnedSystemPrompt).toBeNull();
    }
  });

  it('accepts an optional pinnedSystemPrompt', () => {
    const r = parseCreatePayload({
      ...promptArenaPayload(),
      pinnedSystemPrompt: '  You are a friendly assistant.  ',
    });
    if ('error' in r) throw new Error(r.error);
    if (r.kind === 'prompt') {
      expect(r.pinnedSystemPrompt).toBe('You are a friendly assistant.');
    }
  });

  it('rejects fewer than 2 variants', () => {
    const r = parseCreatePayload({
      ...promptArenaPayload(),
      variants: [{ text: 'one variant only' }],
    });
    expect(r).toMatchObject({ error: expect.stringContaining('at least 2') });
  });

  it('rejects missing pinnedProviderModelId', () => {
    const { pinnedProviderModelId: _, ...rest } = promptArenaPayload();
    const r = parseCreatePayload(rest);
    expect(r).toMatchObject({
      error: expect.stringContaining('pinnedProviderModelId is required'),
    });
  });

  it('rejects unknown pinnedProviderModelId', () => {
    const r = parseCreatePayload({
      ...promptArenaPayload(),
      pinnedProviderModelId: 'foo/bar',
    });
    expect(r).toMatchObject({
      error: expect.stringContaining('unknown pinnedProviderModelId'),
    });
  });

  it('rejects an empty variant text', () => {
    const r = parseCreatePayload({
      ...promptArenaPayload(),
      variants: [{ text: '   ' }, { text: 'ok' }],
    });
    expect(r).toMatchObject({
      error: expect.stringContaining('variants[0].text is required'),
    });
  });

  it('rejects providerModelIds[] under prompt kind', () => {
    const r = parseCreatePayload({
      ...promptArenaPayload(),
      providerModelIds: FOUR_VALID_MODEL_IDS,
    });
    expect(r).toMatchObject({
      error: expect.stringContaining('providerModelIds'),
    });
  });

  // PRD: prompt arenas with 0 inputs are valid (variants are
  // "standalone"). The Phase 1 Standalone-variants toggle submits an
  // empty prompts[] for this case; the parser must accept it. All
  // other kinds still require a non-empty suite.
  it('accepts an empty prompts[] (standalone variants)', () => {
    const r = parseCreatePayload({
      ...promptArenaPayload(),
      prompts: [],
    });
    if ('error' in r) throw new Error(r.error);
    expect(r.kind).toBe('prompt');
    expect(r.prompts).toEqual([]);
  });

  it('still rejects a missing prompts field (must be an array)', () => {
    // Empty array OK; absent or non-array still rejected so the
    // payload contract stays explicit.
    const { prompts: _, ...rest } = promptArenaPayload();
    const r = parseCreatePayload(rest);
    expect(r).toMatchObject({ error: expect.stringContaining('prompts[]') });
  });

  // Plan 05 P1-C — `standaloneVariants` flag (verbatim render).
  describe('standaloneVariants flag', () => {
    it('defaults to false when omitted', () => {
      const r = parseCreatePayload(promptArenaPayload());
      if ('error' in r) throw new Error(r.error);
      if (r.kind === 'prompt') {
        expect(r.standaloneVariants).toBe(false);
      }
    });

    it('accepts standaloneVariants: true', () => {
      const r = parseCreatePayload({
        ...promptArenaPayload(),
        standaloneVariants: true,
      });
      if ('error' in r) throw new Error(r.error);
      if (r.kind === 'prompt') {
        expect(r.standaloneVariants).toBe(true);
      }
    });

    it('rejects non-boolean standaloneVariants', () => {
      const r = parseCreatePayload({
        ...promptArenaPayload(),
        standaloneVariants: 'yes',
      });
      expect(r).toMatchObject({
        error: expect.stringContaining('standaloneVariants must be a boolean'),
      });
    });
  });
});

describe('parseCreatePayload — system_prompt kind', () => {
  const sysArenaPayload = () => ({
    name: 'Sys arena',
    kind: 'system_prompt' as const,
    // Plan 06 PRD requires ≥3 test prompts (across-suite robustness).
    prompts: [
      { text: 'Translate to French: hello.' },
      { text: 'Translate to French: how are you?' },
      { text: 'Translate to French: good night.' },
    ],
    pinnedProviderModelId: 'openai/gpt-5',
    variants: [
      { text: 'You are concise.' },
      { text: 'You are verbose.' },
    ],
  });

  it('accepts the minimal shape (≥2 variants, ≥3 test prompts, pinned model)', () => {
    const r = parseCreatePayload(sysArenaPayload());
    if ('error' in r) throw new Error(r.error);
    expect(r.kind).toBe('system_prompt');
    if (r.kind === 'system_prompt') {
      expect(r.variants).toHaveLength(2);
      expect(r.prompts).toHaveLength(3);
      expect(r.pinnedProviderModelId).toBe('openai/gpt-5');
    }
  });

  it('rejects pinnedSystemPrompt under system_prompt kind', () => {
    const r = parseCreatePayload({
      ...sysArenaPayload(),
      pinnedSystemPrompt: 'nope',
    });
    expect(r).toMatchObject({
      error: expect.stringContaining('pinnedSystemPrompt'),
    });
  });

  it('rejects standaloneVariants under system_prompt kind', () => {
    const r = parseCreatePayload({
      ...sysArenaPayload(),
      standaloneVariants: true,
    });
    expect(r).toMatchObject({
      error: expect.stringContaining('standaloneVariants'),
    });
  });

  it('rejects fewer than 3 test prompts (Plan 06 hard block)', () => {
    for (const tooFew of [
      [],
      [{ text: 'one' }],
      [{ text: 'one' }, { text: 'two' }],
    ]) {
      const r = parseCreatePayload({ ...sysArenaPayload(), prompts: tooFew });
      expect(r).toMatchObject({
        error: expect.stringMatching(/at least 3 test prompts|prompts\[\] must be non-empty/),
      });
    }
  });

  // Plan 06 PRD: variant text ≤ 16,000 chars (system prompts run long;
  // 2× the user-prompt limit). Per-kind cap, separate from the 8k cap
  // that prompt-arena variants live under.
  describe('per-kind variant text length cap', () => {
    it('accepts variant text right at the 16,000-char system_prompt cap', () => {
      const r = parseCreatePayload({
        ...sysArenaPayload(),
        variants: [
          { text: 'a'.repeat(16000) },
          { text: 'You are verbose.' },
        ],
      });
      if ('error' in r) throw new Error(r.error);
      expect(r.kind).toBe('system_prompt');
    });

    it('rejects variant text over the 16,000-char system_prompt cap', () => {
      const r = parseCreatePayload({
        ...sysArenaPayload(),
        variants: [
          { text: 'a'.repeat(16001) },
          { text: 'You are verbose.' },
        ],
      });
      expect(r).toMatchObject({
        error: expect.stringContaining('exceeds 16000 chars'),
      });
    });

    it('rejects prompt-arena variant text over the 8,000-char cap', () => {
      // Sanity-check that the per-kind split didn't accidentally raise
      // the kind='prompt' cap to 16k. Prompt arenas keep the 8k limit.
      const r = parseCreatePayload({
        name: 'Prompt arena',
        kind: 'prompt' as const,
        prompts: [PROMPT],
        pinnedProviderModelId: 'anthropic/claude-sonnet-4-6',
        variants: [
          { text: 'a'.repeat(8001) },
          { text: 'short {{input}}' },
        ],
      });
      expect(r).toMatchObject({
        error: expect.stringContaining('exceeds 8000 chars'),
      });
    });
  });
});

describe('parseCreatePayload — kind discriminator', () => {
  it('rejects an unknown kind value', () => {
    const r = parseCreatePayload({ ...baseModelPayload(), kind: 'banana' });
    expect(r).toMatchObject({
      error: expect.stringContaining('unknown arena kind'),
    });
  });
});

describe('ALLOWED_KINDS feature flag', () => {
  it('opens all three kinds (model + prompt + system_prompt) post-Plan-06', () => {
    expect(ALLOWED_KINDS.has('model')).toBe(true);
    expect(ALLOWED_KINDS.has('prompt')).toBe(true);
    expect(ALLOWED_KINDS.has('system_prompt')).toBe(true);
    expect(ALLOWED_KINDS.size).toBe(3);
  });
});
