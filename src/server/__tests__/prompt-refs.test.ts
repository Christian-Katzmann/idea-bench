/**
 * Tests the @pN prompt-ref substitution applied to campaign prompts
 * before they're sent to OpenRouter.
 *
 * Key cases:
 *   - Resolves @p1..@pN to earlier prompts (1-indexed).
 *   - Leaves unknown refs literal.
 *   - Single-level: does NOT re-expand refs inside substituted text.
 *   - Leaves non-numeric @-patterns untouched (no regression for future
 *     reference namespaces).
 */
import { describe, it, expect } from 'vitest';
import {
  buildPromptRefLookup,
  substitutePromptRefs,
} from '../lib/prompt-refs.js';

function lookup(prompts: Array<{ orderIndex: number; text: string }>) {
  return buildPromptRefLookup(prompts);
}

describe('substitutePromptRefs', () => {
  it('returns the text unchanged when there are no @ refs', () => {
    const lk = lookup([{ orderIndex: 0, text: 'anything' }]);
    expect(substitutePromptRefs('no refs here', lk)).toBe('no refs here');
  });

  it('substitutes @p1 with the prompt at orderIndex 0', () => {
    const lk = lookup([
      { orderIndex: 0, text: 'the style guide' },
      { orderIndex: 1, text: '' },
    ]);
    expect(substitutePromptRefs('Apply @p1 strictly.', lk)).toBe(
      'Apply the style guide strictly.',
    );
  });

  it('handles multiple refs in one prompt', () => {
    const lk = lookup([
      { orderIndex: 0, text: 'A' },
      { orderIndex: 1, text: 'B' },
      { orderIndex: 2, text: 'C' },
    ]);
    expect(substitutePromptRefs('@p1 + @p2 = @p3', lk)).toBe('A + B = C');
  });

  it('leaves out-of-range refs literal with the @ prefix', () => {
    const lk = lookup([{ orderIndex: 0, text: 'first' }]);
    expect(substitutePromptRefs('see @p9', lk)).toBe('see @p9');
  });

  it('leaves non-numeric @-patterns untouched', () => {
    const lk = lookup([{ orderIndex: 0, text: 'first' }]);
    expect(substitutePromptRefs('contact @alice and see @doc.md', lk)).toBe(
      'contact @alice and see @doc.md',
    );
  });

  it('does not re-expand refs inside substituted text (single-level)', () => {
    // p1 refers to p2 inside itself; substitutePromptRefs should NOT
    // recurse — operators get a predictable, bounded rewrite.
    const lk = lookup([
      { orderIndex: 0, text: 'links to @p2 here' },
      { orderIndex: 1, text: 'second' },
    ]);
    expect(substitutePromptRefs('start: @p1', lk)).toBe(
      'start: links to @p2 here',
    );
  });

  it('respects sentence-terminal period convention from the kit parser', () => {
    const lk = lookup([{ orderIndex: 0, text: 'the guide' }]);
    // '@p1.' → the '.' terminates the ref (followed by end-of-string).
    // So "@p1." becomes "the guide."
    expect(substitutePromptRefs('See @p1.', lk)).toBe('See the guide.');
  });
});
