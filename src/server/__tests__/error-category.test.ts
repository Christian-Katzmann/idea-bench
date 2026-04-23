/**
 * Tests for the error categorizer primitive used by openrouter.ts's
 * retry logic. Each category maps to a retry decision via isTransient().
 */
import { describe, it, expect } from 'vitest';
import {
  categorizeError,
  isTransient,
  shouldRetry,
} from '../lib/error-category/index.js';

describe('categorizeError', () => {
  it('maps common HTTP statuses to the right category', () => {
    expect(categorizeError(new Error('x'), 429)).toBe('rate_limited');
    expect(categorizeError(new Error('x'), 408)).toBe('timeout');
    expect(categorizeError(new Error('x'), 500)).toBe('server_unavailable');
    expect(categorizeError(new Error('x'), 502)).toBe('server_unavailable');
    expect(categorizeError(new Error('x'), 503)).toBe('server_unavailable');
    expect(categorizeError(new Error('x'), 504)).toBe('server_unavailable');
  });

  it('maps AbortError name to timeout', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(categorizeError(err)).toBe('timeout');
  });

  it('pattern-matches common message shapes', () => {
    expect(categorizeError(new Error('request timed out'))).toBe('timeout');
    expect(categorizeError(new Error('rate limit exceeded'))).toBe('rate_limited');
    expect(categorizeError(new Error('too many requests'))).toBe('rate_limited');
    expect(categorizeError(new Error('invalid json response'))).toBe(
      'invalid_response',
    );
    expect(categorizeError(new Error('fetch failed'))).toBe('network_error');
    expect(categorizeError(new Error('ECONNRESET'))).toBe('network_error');
    expect(categorizeError(new Error('service unavailable'))).toBe(
      'server_unavailable',
    );
  });

  it('defaults to unknown for unclassified errors', () => {
    expect(categorizeError(new Error('something weird happened'))).toBe(
      'unknown',
    );
    expect(categorizeError(null)).toBe('unknown');
  });

  it('isTransient marks retry-worthy categories only', () => {
    expect(isTransient('rate_limited')).toBe(true);
    expect(isTransient('server_unavailable')).toBe(true);
    expect(isTransient('timeout')).toBe(true);
    expect(isTransient('network_error')).toBe(true);
    expect(isTransient('invalid_response')).toBe(false);
    expect(isTransient('unknown')).toBe(false);
  });

  it('shouldRetry combines categorization + transience', () => {
    expect(shouldRetry(new Error('x'), 429)).toBe(true);
    expect(shouldRetry(new Error('x'), 503)).toBe(true);
    expect(shouldRetry(new Error('x'), 400)).toBe(false);
    expect(shouldRetry(new Error('x'), 404)).toBe(false);
  });
});
