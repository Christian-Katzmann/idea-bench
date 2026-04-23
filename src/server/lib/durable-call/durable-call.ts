// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/durable-async-call/src/durable-call.ts

import { CircuitBreakerRegistry, defaultRegistry } from './circuit-breaker.js';
import { retryWithBackoff } from './retry.js';
import { runWithTimeout } from './timeout.js';
import type { DurableCallOptions } from './types.js';

export class CircuitOpenError extends Error {
  readonly code = 'CIRCUIT_OPEN';
  constructor(key: string) {
    super(`Circuit open: ${key}`);
    this.name = 'CircuitOpenError';
  }
}

export async function durableCall<T>(
  opts: DurableCallOptions<T>,
  registry: CircuitBreakerRegistry = defaultRegistry,
): Promise<T> {
  const {
    key,
    timeoutMs,
    attempt,
    retries = 2,
    baseDelayMs = 250,
    logger,
    metrics,
    isTransientError,
  } = opts;

  if (registry.isOpen(key, Date.now(), metrics)) {
    throw new CircuitOpenError(key);
  }

  const started = Date.now();
  try {
    const res = await retryWithBackoff(
      () => runWithTimeout(attempt, timeoutMs),
      {
        retries,
        baseDelayMs,
        metrics,
        isTransientError,
      },
    );
    registry.recordSuccess(key);
    const latency = Date.now() - started;
    metrics?.counter('requests');
    metrics?.latency('latency', latency);
    logger?.info?.('durable-call.success', { key, latency_ms: latency });
    return res;
  } catch (err) {
    registry.recordFailure(key, logger);
    const latency = Date.now() - started;
    metrics?.counter('requests');
    metrics?.latency('latency', latency);
    logger?.warn?.('durable-call.failure', {
      key,
      latency_ms: latency,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
