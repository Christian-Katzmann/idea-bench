// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/api-error-wrapper/src/errors.ts
// Typed HTTP-error shape + normalization.

export interface TypedHttpError {
  status?: number;
  code?: string;
  safe_message?: string;
}

export const DEFAULT_CODE_TO_STATUS: Record<string, number> = {
  unauthenticated: 401,
  unauthorized: 403,
  bad_request: 400,
  not_found: 404,
  conflict: 409,
  precondition_failed: 412,
  unprocessable: 422,
  rate_limited: 429,
};

const PASS_THROUGH_STATUSES = new Set([400, 401, 403, 404, 409, 412, 422, 429]);

export interface NormalizedError {
  status: number;
  body: { error: string; code: string };
}

export function normalizeApiError(
  err: unknown,
  codeMap: Record<string, number> = DEFAULT_CODE_TO_STATUS,
): NormalizedError {
  const e = (err ?? {}) as TypedHttpError & { message?: string };

  let status = 500;
  if (typeof e.status === 'number') {
    status = e.status;
  } else if (typeof e.code === 'string' && codeMap[e.code] !== undefined) {
    status = codeMap[e.code]!;
  }

  if (!PASS_THROUGH_STATUSES.has(status) && status < 500) {
    status = 500;
  }

  const safeMessage = e.safe_message || e.message || 'Internal error';
  const code = e.code || (status >= 500 ? 'internal_error' : 'bad_request');

  return {
    status,
    body: { error: safeMessage, code },
  };
}

export function apiError(hint: {
  status?: number;
  code?: string;
  safe_message?: string;
  message?: string;
}): Error & TypedHttpError {
  const err = new Error(
    hint.message ?? hint.safe_message ?? hint.code ?? 'Error',
  ) as Error & TypedHttpError;
  if (hint.status !== undefined) err.status = hint.status;
  if (hint.code !== undefined) err.code = hint.code;
  if (hint.safe_message !== undefined) err.safe_message = hint.safe_message;
  return err;
}
