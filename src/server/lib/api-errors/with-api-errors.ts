// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/api-error-wrapper/src/with-api-errors.ts
// Framework-neutral handler wrapper: attaches X-Request-Id, catches errors,
// normalizes to JSON, logs success + failure with latency.

import { normalizeApiError } from './errors.js';

export interface Logger {
  info?: (event: string, meta?: Record<string, unknown>) => void;
  warn?: (event: string, meta?: Record<string, unknown>) => void;
  error?: (event: string, meta?: Record<string, unknown>) => void;
}

export interface WithApiErrorsOptions {
  logger?: Logger;
  includeStack?: boolean;
  generateRequestId?: () => string;
  codeMap?: Record<string, number>;
}

type AnyHandler<R extends Request = Request> = (
  req: R,
  ...args: unknown[]
) => Promise<Response>;

export function withApiErrors<R extends Request>(
  handler: AnyHandler<R>,
  opts: WithApiErrorsOptions = {},
): AnyHandler<R> {
  const logger = opts.logger;
  const generateRequestId =
    opts.generateRequestId ?? (() => crypto.randomUUID());

  return async (req, ...args) => {
    const started = Date.now();
    const requestId = req.headers.get('x-request-id') || generateRequestId();

    try {
      const res = await handler(req, ...args);
      const withId = attachRequestId(res, requestId);
      logger?.info?.('api.success', {
        route: req.url,
        method: req.method,
        status: withId.status,
        latency_ms: Date.now() - started,
        request_id: requestId,
      });
      return withId;
    } catch (err: unknown) {
      const e = err as {
        message?: string;
        safe_message?: string;
        code?: string;
        status?: number;
        stack?: string;
      };
      const sanitized: Record<string, unknown> = {
        request_id: requestId,
        message: e?.safe_message || e?.message || 'Unknown error',
        code: e?.code,
        status: e?.status,
      };
      if (opts.includeStack && e?.stack) sanitized.stack = e.stack;
      logger?.error?.('api.caught_error', sanitized);

      const { status, body } = normalizeApiError(err, opts.codeMap);
      const res = new Response(JSON.stringify({ ...body, id: requestId }), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
        },
      });
      logger?.error?.('api.failure', {
        route: req.url,
        method: req.method,
        status,
        latency_ms: Date.now() - started,
        request_id: requestId,
        err: { code: body.code, safe_message: body.error },
      });
      return res;
    }
  };
}

function attachRequestId(res: Response, requestId: string): Response {
  try {
    res.headers.set('X-Request-Id', requestId);
    return res;
  } catch {
    const cloned = new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
    cloned.headers.set('X-Request-Id', requestId);
    return cloned;
  }
}
