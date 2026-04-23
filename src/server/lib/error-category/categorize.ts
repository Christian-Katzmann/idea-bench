// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/http-error-categorizer/src/categorize.ts
//
// Canonical error categorization for retry logic + UI + telemetry.
// Retry decisions:
//   - rate_limited       → back off (possibly with Retry-After)
//   - server_unavailable → retry with exponential backoff
//   - timeout            → retry with longer timeout
//   - network_error      → retry; if persistent, surface connectivity issue
//   - invalid_response   → do NOT retry; likely a bug on either end
//   - unknown            → conservative: retry a couple times, then surface

export type ErrorCategory =
  | 'rate_limited'
  | 'server_unavailable'
  | 'timeout'
  | 'invalid_response'
  | 'network_error'
  | 'unknown';

function getMessage(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase();
  if (typeof error === 'string') return error.toLowerCase();
  return String(error).toLowerCase();
}

export function categorizeError(
  error: unknown,
  httpStatus?: number,
): ErrorCategory {
  // HTTP status is the most reliable signal when available.
  if (httpStatus !== undefined) {
    if (httpStatus === 429) return 'rate_limited';
    if (httpStatus === 408) return 'timeout';
    if (httpStatus >= 500 && httpStatus <= 504) return 'server_unavailable';
  }

  if (error instanceof Error && error.name === 'AbortError') return 'timeout';

  const message = getMessage(error);

  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted')
  ) {
    return 'timeout';
  }

  if (
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('too many requests')
  ) {
    return 'rate_limited';
  }

  if (
    message.includes('invalid') &&
    (message.includes('json') || message.includes('response'))
  ) {
    return 'invalid_response';
  }

  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('econnreset')
  ) {
    return 'network_error';
  }

  if (
    message.includes('unavailable') ||
    message.includes('service') ||
    message.includes('503') ||
    message.includes('502')
  ) {
    return 'server_unavailable';
  }

  return 'unknown';
}

const TRANSIENT: ReadonlySet<ErrorCategory> = new Set([
  'rate_limited',
  'server_unavailable',
  'timeout',
  'network_error',
]);

export function isTransient(category: ErrorCategory): boolean {
  return TRANSIENT.has(category);
}

export function shouldRetry(error: unknown, httpStatus?: number): boolean {
  return isTransient(categorizeError(error, httpStatus));
}
