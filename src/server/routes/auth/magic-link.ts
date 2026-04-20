/**
 * Email magic-link login.
 *
 *   POST /api/auth/email-send      — body: { email }; always returns 200
 *   GET  /api/auth/email-verify    — ?token=<raw>; consumes + issues cookie
 *
 * The allowlist (`OPERATOR_EMAILS`) is enforced server-side; the POST
 * response is identical for allowed and disallowed addresses (no user
 * enumeration). Tokens are stored as `sha256(raw)` for a 15-min TTL
 * and single-use — a leaked DB row can't be replayed.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  OPERATOR_COOKIE_MAX_AGE_MS,
  OPERATOR_COOKIE_NAME,
  buildSetCookie,
  signOperatorCookie,
} from '../../auth/cookies.js';
import { sendMagicLink } from '../../auth/email.js';
import {
  checkRateLimit,
  ipFromRequest,
  rateLimitResponse,
} from '../../auth/rate-limit.js';
import { getDb } from '../../db/client.js';
import { magicLinks } from '../../db/schema.js';

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function parseAllowlist(): string[] {
  const raw = process.env.OPERATOR_EMAILS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { location: to } });
}

function redirectWithCookie(to: string, cookie: string): Response {
  const res = new Response(null, { status: 302, headers: { location: to } });
  res.headers.append('set-cookie', cookie);
  return res;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function originOf(req: Request): string {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

async function readEmail(request: Request): Promise<string | null> {
  const ct = (request.headers.get('content-type') ?? '').toLowerCase();
  try {
    if (ct.includes('application/json')) {
      const body = (await request.json()) as { email?: unknown };
      return typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;
    }
    // application/x-www-form-urlencoded (native login.html form fallback)
    const text = await request.text();
    const params = new URLSearchParams(text);
    const raw = params.get('email');
    return raw ? raw.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

function isLikelyEmail(s: string): boolean {
  // Intentionally simple — Resend rejects malformed addresses for us.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function sendHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const ip = ipFromRequest(request);
  const rl = checkRateLimit(`email-send:${ip}`);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const email = await readEmail(request);
  const wantsHtml = (request.headers.get('accept') ?? '').includes('text/html');

  // Always behave the same on the response shape to avoid enumeration.
  const successHtml = () => redirect('/login?sent=1');
  const successJson = () => json({ ok: true }, 200);
  const success = wantsHtml ? successHtml : successJson;

  if (!email || !isLikelyEmail(email)) {
    // Treat as success — do not hint whether the address was valid.
    return success();
  }

  const allowlist = parseAllowlist();
  if (!allowlist.includes(email)) {
    return success();
  }

  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

  const db = getDb();
  await db.insert(magicLinks).values({ tokenHash, email, expiresAt });

  const link = `${originOf(request)}/api/auth/email-verify?token=${rawToken}`;
  const sent = await sendMagicLink(email, link);
  if (!sent.ok) {
    console.error('[auth] magic link send failed:', sent.error);
    // Still respond with success to avoid leaking delivery failures.
  }
  return success();
}

async function verifyHandler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  const ip = ipFromRequest(request);
  const rl = checkRateLimit(`email-verify:${ip}`);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const url = new URL(request.url);
  const raw = url.searchParams.get('token');
  if (!raw || raw.length < 32) {
    return redirect('/login?error=magic_invalid');
  }

  const tokenHash = hashToken(raw);
  const db = getDb();
  const rows = await db
    .select()
    .from(magicLinks)
    .where(eq(magicLinks.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return redirect('/login?error=magic_invalid');
  }
  if (row.consumedAt) {
    return redirect('/login?error=magic_consumed');
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return redirect('/login?error=magic_expired');
  }

  await db
    .update(magicLinks)
    .set({ consumedAt: new Date() })
    .where(and(eq(magicLinks.tokenHash, tokenHash), eq(magicLinks.email, row.email)));

  const cookie = buildSetCookie(
    OPERATOR_COOKIE_NAME,
    signOperatorCookie({ method: 'email', identity: row.email }),
    { maxAgeMs: OPERATOR_COOKIE_MAX_AGE_MS, path: '/', sameSite: 'Lax' },
  );
  return redirectWithCookie('/', cookie);
}

export const magicLinkSendWebHandler = sendHandler;
export const magicLinkVerifyWebHandler = verifyHandler;
