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
});

describe('parseCreatePayload — system_prompt kind', () => {
  const sysArenaPayload = () => ({
    name: 'Sys arena',
    kind: 'system_prompt' as const,
    prompts: [PROMPT],
    pinnedProviderModelId: 'openai/gpt-5',
    variants: [
      { text: 'You are concise.' },
      { text: 'You are verbose.' },
    ],
  });

  it('accepts the minimal shape (≥2 variants, pinned model)', () => {
    const r = parseCreatePayload(sysArenaPayload());
    if ('error' in r) throw new Error(r.error);
    expect(r.kind).toBe('system_prompt');
    if (r.kind === 'system_prompt') {
      expect(r.variants).toHaveLength(2);
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
  it('only includes model in V1 (Plans 05/06 widen this)', () => {
    expect(ALLOWED_KINDS.has('model')).toBe(true);
    expect(ALLOWED_KINDS.has('prompt')).toBe(false);
    expect(ALLOWED_KINDS.has('system_prompt')).toBe(false);
    expect(ALLOWED_KINDS.size).toBe(1);
  });
});
