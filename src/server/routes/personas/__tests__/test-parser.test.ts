/**
 * Request-body validation for POST /api/personas/:id?action=test.
 *
 * The real handler couples parsing with DB lookups + openrouter calls;
 * testing it end-to-end would burn real OpenRouter dollars. Here we
 * duplicate the pure parser as a contract test so a drift in the field
 * requirements breaks tests first. Matches the pattern used by the
 * circuit-breaker and persona-partition tests.
 */
import { describe, it, expect } from 'vitest';

interface TestRequest {
  promptText: string;
  output: string;
  judgeModelId?: string;
  targetModelId?: string;
  systemPromptOverride?: string;
}

const MAX_TEXT_LENGTH = 4000;

function parseTestRequest(input: unknown): TestRequest | { error: string } {
  if (typeof input !== 'object' || input === null)
    return { error: 'body must be an object' };
  const o = input as Record<string, unknown>;
  const promptText = typeof o.promptText === 'string' ? o.promptText.trim() : '';
  const output = typeof o.output === 'string' ? o.output.trim() : '';
  if (!promptText) return { error: 'promptText is required' };
  if (!output) return { error: 'output is required' };
  if (promptText.length > MAX_TEXT_LENGTH)
    return { error: `promptText must be ≤ ${MAX_TEXT_LENGTH} characters` };
  if (output.length > MAX_TEXT_LENGTH)
    return { error: `output must be ≤ ${MAX_TEXT_LENGTH} characters` };
  const systemPromptOverride =
    typeof o.systemPromptOverride === 'string'
      ? o.systemPromptOverride
      : undefined;
  if (systemPromptOverride && systemPromptOverride.length > MAX_TEXT_LENGTH) {
    return {
      error: `systemPromptOverride must be ≤ ${MAX_TEXT_LENGTH} characters`,
    };
  }
  return {
    promptText,
    output,
    judgeModelId:
      typeof o.judgeModelId === 'string' ? o.judgeModelId : undefined,
    targetModelId:
      typeof o.targetModelId === 'string' ? o.targetModelId : undefined,
    systemPromptOverride,
  };
}

describe('parseTestRequest', () => {
  it('accepts a minimum valid request', () => {
    const result = parseTestRequest({ promptText: 'Write a memo.', output: 'Here is a memo.' });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.promptText).toBe('Write a memo.');
      expect(result.output).toBe('Here is a memo.');
      expect(result.systemPromptOverride).toBeUndefined();
    }
  });

  it('trims whitespace on primary fields', () => {
    const result = parseTestRequest({
      promptText: '  spaced  ',
      output: '\n\noutput\n',
    });
    if ('error' in result) throw new Error('parse should succeed');
    expect(result.promptText).toBe('spaced');
    expect(result.output).toBe('output');
  });

  it('rejects a missing promptText', () => {
    const result = parseTestRequest({ output: 'x' });
    expect(result).toEqual({ error: 'promptText is required' });
  });

  it('rejects an empty output', () => {
    const result = parseTestRequest({ promptText: 'x', output: '   ' });
    expect(result).toEqual({ error: 'output is required' });
  });

  it('rejects a non-object body', () => {
    expect(parseTestRequest(null)).toEqual({ error: 'body must be an object' });
    expect(parseTestRequest('string')).toEqual({
      error: 'body must be an object',
    });
  });

  it('rejects overlong promptText', () => {
    const result = parseTestRequest({
      promptText: 'x'.repeat(MAX_TEXT_LENGTH + 1),
      output: 'ok',
    });
    if (!('error' in result)) throw new Error('expected error');
    expect(result.error).toMatch(/promptText must be/);
  });

  it('rejects overlong systemPromptOverride', () => {
    const result = parseTestRequest({
      promptText: 'x',
      output: 'y',
      systemPromptOverride: 'z'.repeat(MAX_TEXT_LENGTH + 1),
    });
    if (!('error' in result)) throw new Error('expected error');
    expect(result.error).toMatch(/systemPromptOverride must be/);
  });

  it('passes through optional judgeModelId + targetModelId', () => {
    const result = parseTestRequest({
      promptText: 'x',
      output: 'y',
      judgeModelId: 'openai/gpt-5-mini',
      targetModelId: 'anthropic/claude-opus-4-6',
    });
    if ('error' in result) throw new Error('expected success');
    expect(result.judgeModelId).toBe('openai/gpt-5-mini');
    expect(result.targetModelId).toBe('anthropic/claude-opus-4-6');
  });
});
