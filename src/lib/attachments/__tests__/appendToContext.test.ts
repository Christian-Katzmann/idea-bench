import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOTAL_CHAR_CAP,
  appendToContext,
} from '../appendToContext';

describe('appendToContext', () => {
  it('appends to empty context with a labelled separator', () => {
    const r = appendToContext('', 'brief.txt', 'hello world');
    expect(r.next).toBe('--- [brief.txt] ---\nhello world');
    expect(r.truncated).toBe(0);
    expect(r.rejected).toBe(false);
  });

  it('appends after existing context with a blank line gap', () => {
    const r = appendToContext('Operator notes.', 'memo.md', 'extracted body');
    expect(r.next).toBe(
      'Operator notes.\n\n--- [memo.md] ---\nextracted body',
    );
    expect(r.truncated).toBe(0);
  });

  it('truncates when extracted content exceeds the cap', () => {
    const cap = 60;
    const existing = 'short head';
    const huge = 'x'.repeat(200);
    const r = appendToContext(existing, 'big.pdf', huge, cap);

    expect(r.next.length).toBeLessThanOrEqual(cap);
    expect(r.next.startsWith('short head\n\n--- [big.pdf] ---\n')).toBe(true);
    expect(r.truncated).toBeGreaterThan(0);
    expect(r.truncated).toBe(huge.length - (r.next.length - 'short head\n\n--- [big.pdf] ---\n'.length));
    expect(r.rejected).toBe(false);
  });

  it('rejects when there is no room left for any extracted content', () => {
    const filler = 'a'.repeat(95);
    const r = appendToContext(filler, 'doc.docx', 'never fits', 100);
    expect(r.next).toBe(filler);
    expect(r.rejected).toBe(true);
    expect(r.truncated).toBe('never fits'.length);
  });

  it('preserves the existing context when rejected', () => {
    const r = appendToContext('keep me', 'x.pdf', 'drop me', 5);
    expect(r.next).toBe('keep me');
    expect(r.rejected).toBe(true);
  });

  it('uses the documented default cap', () => {
    expect(DEFAULT_TOTAL_CHAR_CAP).toBe(50_000);
  });
});
