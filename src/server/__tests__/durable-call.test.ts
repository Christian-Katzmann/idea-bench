/**
 * Tests for the durable-call primitive used to wrap OpenRouter calls.
 * Covers: success path, retry-on-transient-error, no-retry-on-fatal,
 * circuit breaker opening after threshold, and timeout enforcement.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  CircuitBreakerRegistry,
  CircuitOpenError,
  durableCall,
} from '../lib/durable-call/index.js';

const FAST = { baseDelayMs: 1, timeoutMs: 200 };

describe('durableCall', () => {
  it('returns on first success', async () => {
    const attempt = vi.fn(async () => 'ok');
    const result = await durableCall({
      key: 'test.success',
      timeoutMs: FAST.timeoutMs,
      attempt,
      retries: 2,
      baseDelayMs: FAST.baseDelayMs,
    });
    expect(result).toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors then succeeds', async () => {
    let callCount = 0;
    const attempt = vi.fn(async () => {
      callCount += 1;
      if (callCount < 2) throw new Error('transient');
      return 'recovered';
    });
    const result = await durableCall({
      key: 'test.retry',
      timeoutMs: FAST.timeoutMs,
      attempt,
      retries: 2,
      baseDelayMs: FAST.baseDelayMs,
      isTransientError: () => true,
    });
    expect(result).toBe('recovered');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('does not retry when isTransientError returns false', async () => {
    const attempt = vi.fn(async () => {
      throw new Error('fatal');
    });
    await expect(
      durableCall({
        key: 'test.fatal',
        timeoutMs: FAST.timeoutMs,
        attempt,
        retries: 3,
        baseDelayMs: FAST.baseDelayMs,
        isTransientError: () => false,
      }),
    ).rejects.toThrow('fatal');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('gives up after retries exhausted and throws the last error', async () => {
    const attempt = vi.fn(async () => {
      throw new Error('always');
    });
    await expect(
      durableCall({
        key: 'test.exhausted',
        timeoutMs: FAST.timeoutMs,
        attempt,
        retries: 2,
        baseDelayMs: FAST.baseDelayMs,
        isTransientError: () => true,
      }),
    ).rejects.toThrow('always');
    expect(attempt).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('circuit breaker opens after repeated failures on the same key', async () => {
    // Fresh registry with 2-failure threshold for deterministic testing.
    const registry = new CircuitBreakerRegistry({
      failThreshold: 2,
      coolDownMs: 60_000,
    });
    const attempt = vi.fn(async () => {
      throw new Error('boom');
    });

    // First failure (with retries exhausted, logs 1 failure at the registry).
    await expect(
      durableCall(
        {
          key: 'test.breaker',
          timeoutMs: FAST.timeoutMs,
          attempt,
          retries: 0,
          baseDelayMs: FAST.baseDelayMs,
          isTransientError: () => true,
        },
        registry,
      ),
    ).rejects.toThrow('boom');

    // Second failure trips the breaker.
    await expect(
      durableCall(
        {
          key: 'test.breaker',
          timeoutMs: FAST.timeoutMs,
          attempt,
          retries: 0,
          baseDelayMs: FAST.baseDelayMs,
          isTransientError: () => true,
        },
        registry,
      ),
    ).rejects.toThrow('boom');

    // Third call short-circuits with CircuitOpenError.
    await expect(
      durableCall(
        {
          key: 'test.breaker',
          timeoutMs: FAST.timeoutMs,
          attempt,
          retries: 0,
          baseDelayMs: FAST.baseDelayMs,
          isTransientError: () => true,
        },
        registry,
      ),
    ).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('enforces timeouts via runWithTimeout', async () => {
    const attempt = vi.fn(
      async () => new Promise<string>(() => undefined), // never resolves
    );
    await expect(
      durableCall({
        key: 'test.timeout',
        timeoutMs: 50,
        attempt,
        retries: 0,
        baseDelayMs: FAST.baseDelayMs,
        isTransientError: () => false,
      }),
    ).rejects.toThrow('timeout');
  });
});
