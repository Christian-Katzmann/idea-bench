/**
 * ïdea Bench's standard handler wrapper. Every web handler composed via
 * `toVercelHandler` in vercel-adapter.ts passes through this first, so
 * every response carries `X-Request-Id`, every thrown error becomes a
 * normalized JSON response, and every request logs one structured line
 * to stderr with status + latency.
 *
 * Vendored primitive at `./api-errors/`. The wiring here is the only
 * ïdea Bench-specific bit: a console-backed logger emitting JSON and a
 * sensible default for `includeStack` (dev only).
 */

import {
  withApiErrors,
  type Logger,
  type WithApiErrorsOptions,
} from './api-errors/index.js';

const consoleLogger: Logger = {
  info(event, meta) {
    // One JSON line per request — greppable in Vercel function logs.
    process.stderr.write(
      `${JSON.stringify({ level: 'info', event, ...meta })}\n`,
    );
  },
  warn(event, meta) {
    process.stderr.write(
      `${JSON.stringify({ level: 'warn', event, ...meta })}\n`,
    );
  },
  error(event, meta) {
    process.stderr.write(
      `${JSON.stringify({ level: 'error', event, ...meta })}\n`,
    );
  },
};

const DEFAULT_OPTS: WithApiErrorsOptions = {
  logger: consoleLogger,
  includeStack: process.env.NODE_ENV !== 'production',
};

export type WebHandler = (request: Request) => Response | Promise<Response>;

/**
 * Wrap a web handler with request-id + structured logging + error
 * normalization. Safe to apply to streaming (SSE) handlers — the
 * request-id header is attached before the stream flushes; if the
 * handler throws BEFORE returning the stream, the wrapper converts
 * it to JSON; if it throws mid-stream, behavior is unchanged
 * (neither the wrapper nor the raw adapter can rewrite response
 * headers after they've been sent).
 */
export function withObservability(handler: WebHandler): WebHandler {
  return withApiErrors(
    async (req: Request) => {
      const result = await handler(req);
      return result;
    },
    DEFAULT_OPTS,
  );
}

export { apiError, type Logger } from './api-errors/index.js';
