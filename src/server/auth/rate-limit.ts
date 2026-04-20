/**
 * In-memory sliding-window rate limiter.
 *
 * Per-container state — acceptable for auth endpoints at this scale.
 * An attacker with many IPs can still bypass a single container, and
 * Vercel may spin up multiple containers. The defense in depth is:
 *   - Magic links are single-use + short-lived, so replay is bounded.
 *   - GitHub OAuth requires a matching signed state cookie.
 *   - Password login is protected by a 400ms per-attempt delay.
 */

const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  max = 5,
  windowMs = 15 * 60 * 1000,
  now = Date.now(),
): { allowed: boolean; retryAfterSec: number } {
  const cutoff = now - windowMs;
  const existing = buckets.get(key) ?? [];
  const recent = existing.filter((t) => t > cutoff);
  if (recent.length >= max) {
    const oldest = recent[0]!;
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { allowed: true, retryAfterSec: 0 };
}

export function ipFromRequest(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export function rateLimitResponse(retryAfterSec: number): Response {
  return new Response(JSON.stringify({ error: 'rate_limited' }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'retry-after': String(retryAfterSec),
    },
  });
}

/** Test-only: reset all buckets. */
export function __resetRateLimitsForTest(): void {
  buckets.clear();
}
