// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/durable-async-call/src/retry.ts

import type { Metrics } from './types.js';

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  jitterMs?: () => number;
  isTransientError?: (err: unknown) => boolean;
  metrics?: Metrics;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 250;
  const jitterMs = opts.jitterMs ?? (() => Math.floor(Math.random() * 50));
  const isTransient = opts.isTransientError ?? (() => true);

  let attempt = 0;
  let delay = baseDelayMs;
  let lastError: unknown;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isTransient(err) || attempt === retries) break;
      opts.metrics?.counter('retry');
      await sleep(delay + jitterMs());
      delay *= 2;
      attempt += 1;
    }
  }
  throw lastError;
}
