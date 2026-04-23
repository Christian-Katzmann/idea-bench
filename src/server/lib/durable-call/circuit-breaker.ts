// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/durable-async-call/src/circuit-breaker.ts

import type {
  CircuitBreakerOptions,
  FuseState,
  Logger,
  Metrics,
} from './types.js';

interface FuseEntry {
  state: FuseState;
  failures: number;
  lastFailureAt: number;
  openedAt?: number;
}

const DEFAULTS = {
  failThreshold: 3,
  coolDownMs: 30_000,
};

export class CircuitBreakerRegistry {
  private readonly fuses = new Map<string, FuseEntry>();
  private readonly failThreshold: number;
  private readonly coolDownMs: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failThreshold = options.failThreshold ?? DEFAULTS.failThreshold;
    this.coolDownMs = options.coolDownMs ?? DEFAULTS.coolDownMs;
  }

  isOpen(key: string, now: number = Date.now(), metrics?: Metrics): boolean {
    const entry = this.fuses.get(key);
    if (!entry) return false;
    if (entry.state === 'open') {
      if ((entry.openedAt ?? 0) + this.coolDownMs <= now) {
        entry.state = 'half-open';
        entry.failures = 0;
        this.fuses.set(key, entry);
        return false;
      }
      metrics?.counter('circuit-breaker.trip');
      return true;
    }
    return false;
  }

  recordSuccess(key: string): void {
    this.fuses.set(key, { state: 'closed', failures: 0, lastFailureAt: 0 });
  }

  recordFailure(key: string, logger?: Logger): void {
    const entry: FuseEntry = this.fuses.get(key) ?? {
      state: 'closed',
      failures: 0,
      lastFailureAt: 0,
    };
    entry.failures += 1;
    entry.lastFailureAt = Date.now();
    if (entry.failures >= this.failThreshold) {
      entry.state = 'open';
      entry.openedAt = Date.now();
      logger?.warn?.('circuit-breaker.open', {
        key,
        failures: entry.failures,
      });
    }
    this.fuses.set(key, entry);
  }

  reset(key: string): void {
    this.fuses.delete(key);
  }

  getState(key: string): FuseState {
    return this.fuses.get(key)?.state ?? 'closed';
  }
}

export const defaultRegistry = new CircuitBreakerRegistry();
