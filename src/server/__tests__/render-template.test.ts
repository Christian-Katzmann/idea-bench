/**
 * Tests for `renderTemplate` — the narrow `{{input}}` substitution
 * helper used by per-kind generation assembly (Plan 04) and the prompt
 * arena (Plan 05).
 *
 * Rules under test:
 *   1. `standalone: true` → verbatim passthrough.
 *   2. Literal `{{input}}` token → single substitution.
 *   3. No token → input appended after a blank line.
 *   4. Whitespace inside the token (`{{ input }}`) is NOT recognized.
 */
import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../lib/render-template.js';

describe('renderTemplate', () => {
  it('substitutes a single {{input}} token', () => {
    expect(renderTemplate('You are an expert. {{input}}', 'hello')).toBe(
      'You are an expert. hello',
    );
  });

  it('substitutes only the first occurrence', () => {
    expect(renderTemplate('{{input}} and {{input}}', 'X')).toBe(
      'X and {{input}}',
    );
  });

  it('appends input after a blank line when no token present', () => {
    expect(renderTemplate('Variant body.', 'the input')).toBe(
      'Variant body.\n\nthe input',
    );
  });

  it('appends an empty input cleanly (still adds the blank line)', () => {
    // Documented behavior — callers that want a no-op should pass
    // standalone:true rather than relying on empty input.
    expect(renderTemplate('Variant body.', '')).toBe('Variant body.\n\n');
  });

  it('returns the template verbatim when standalone is true', () => {
    expect(
      renderTemplate('Standalone {{input}} body.', 'ignored', {
        standalone: true,
      }),
    ).toBe('Standalone {{input}} body.');
  });

  it('does NOT match whitespace-padded tokens (intentionally strict)', () => {
    // {{ input }} is not the recognized token — input gets appended
    // because the literal {{input}} doesn't appear.
    expect(renderTemplate('A {{ input }} B', 'X')).toBe('A {{ input }} B\n\nX');
  });

  it('substitutes at the start of the template', () => {
    expect(renderTemplate('{{input}} is the question', 'what')).toBe(
      'what is the question',
    );
  });

  it('substitutes at the end of the template', () => {
    expect(renderTemplate('the answer is {{input}}', '42')).toBe(
      'the answer is 42',
    );
  });

  it('preserves input that itself contains brace patterns', () => {
    // Single-pass substitution — input is inserted literally, never
    // re-rendered. Prevents accidental expansion of operator inputs
    // that contain `{{input}}` themselves.
    expect(renderTemplate('Echo: {{input}}', 'pass-through {{input}}')).toBe(
      'Echo: pass-through {{input}}',
    );
  });
});
