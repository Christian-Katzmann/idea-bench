// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/durable-async-call/src/types.ts

export type FuseState = 'closed' | 'open' | 'half-open';

export interface Logger {
  info?(event: string, data?: Record<string, unknown>): void;
  warn?(event: string, data?: Record<string, unknown>): void;
  error?(event: string, data?: Record<string, unknown>): void;
}

export interface Metrics {
  counter(name: string, value?: number): void;
  latency(name: string, ms: number): void;
}

export interface CircuitBreakerOptions {
  failThreshold?: number;
  coolDownMs?: number;
}

export interface DurableCallOptions<T> {
  key: string;
  timeoutMs: number;
  attempt: (signal?: AbortSignal) => Promise<T>;
  retries?: number;
  baseDelayMs?: number;
  breaker?: CircuitBreakerOptions;
  logger?: Logger;
  metrics?: Metrics;
  isTransientError?: (err: unknown) => boolean;
}
