/**
 * HMAC-signed cookie primitives.
 *
 * Two cookies in play:
 *   - `operator_session`  — issued on password login; 30 days; gates /api/*.
 *   - `participant_id`    — issued lazily on first /vote/:slug visit;
 *                            365 days; used for per-pair dedup.
 *
 * The payload is a JSON object, base64url-encoded and suffixed with an
 * HMAC-SHA256 over the payload using `AUTH_SECRET`. Format:
 *   `${base64url(payloadJson)}.${base64url(hmac)}`
 *
 * This is a tiny subset of JWT; we don't pull a JWT lib because we don't
 * need algorithm negotiation, kid rotation, or any of the JWT surface.
 * Rotating `AUTH_SECRET` invalidates every outstanding cookie, which is
 * the behavior we want.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const OPERATOR_COOKIE_NAME = 'operator_session';
export const PARTICIPANT_COOKIE_NAME = 'participant_id';

export const OPERATOR_COOKIE_MAX_AGE_MS = 30 * ONE_DAY_MS;
export const PARTICIPANT_COOKIE_MAX_AGE_MS = 365 * ONE_DAY_MS;

export type OperatorMethod = 'password' | 'github' | 'email';

export interface OperatorPayload {
  kind: 'op';
  iat: number; // issued-at, ms since epoch
  exp: number; // expiry, ms since epoch
  method: OperatorMethod;
  /** Email for `github`/`email` methods; literal `'operator'` for password. */
  identity: string;
}

interface ParticipantPayload {
  kind: 'p';
  cookieId: string; // UUID, stable across campaigns
  iat: number;
}

type Payload = OperatorPayload | ParticipantPayload;

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      'AUTH_SECRET is not set or is too short (need 16+ chars). ' +
        'Generate one with `openssl rand -hex 32`.',
    );
  }
  return s;
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const padded = s + '==='.slice((s.length + 3) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign<T extends Payload>(payload: T): string {
  const body = b64urlEncode(JSON.stringify(payload));
  const mac = createHmac('sha256', getSecret()).update(body).digest();
  return `${body}.${b64urlEncode(mac)}`;
}

function verify(token: string | undefined): Payload | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const providedMac = token.slice(dot + 1);

  const expectedMac = createHmac('sha256', getSecret()).update(body).digest();
  let providedMacBytes: Buffer;
  try {
    providedMacBytes = b64urlDecode(providedMac);
  } catch {
    return null;
  }
  if (providedMacBytes.length !== expectedMac.length) return null;
  if (!timingSafeEqual(providedMacBytes, expectedMac)) return null;

  try {
    const parsed = JSON.parse(b64urlDecode(body).toString('utf8')) as Payload;
    return parsed;
  } catch {
    return null;
  }
}

export function signOperatorCookie(
  input: { method: OperatorMethod; identity: string },
  now = Date.now(),
): string {
  return sign<OperatorPayload>({
    kind: 'op',
    iat: now,
    exp: now + OPERATOR_COOKIE_MAX_AGE_MS,
    method: input.method,
    identity: input.identity,
  });
}

export function verifyOperatorCookie(
  token: string | undefined,
  now = Date.now(),
): OperatorPayload | null {
  const p = verify(token);
  if (!p || p.kind !== 'op') return null;
  if (p.exp < now) return null;
  if (typeof (p as OperatorPayload).method !== 'string') return null;
  if (typeof (p as OperatorPayload).identity !== 'string') return null;
  return p as OperatorPayload;
}

export function signParticipantCookie(cookieId: string, now = Date.now()): string {
  return sign<ParticipantPayload>({ kind: 'p', cookieId, iat: now });
}

export function verifyParticipantCookie(
  token: string | undefined,
): ParticipantPayload | null {
  const p = verify(token);
  if (!p || p.kind !== 'p') return null;
  return p;
}

/** Parses a Cookie header into a map. Case-insensitive names are NOT supported. */
export function parseCookieHeader(
  header: string | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export interface SetCookieOptions {
  maxAgeMs: number;
  path?: string;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/** Builds a Set-Cookie header value. HttpOnly + Secure are always set. */
export function buildSetCookie(
  name: string,
  value: string,
  opts: SetCookieOptions,
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.floor(opts.maxAgeMs / 1000)}`,
    `Path=${opts.path ?? '/'}`,
    'HttpOnly',
    'Secure',
    `SameSite=${opts.sameSite ?? 'Lax'}`,
  ];
  return parts.join('; ');
}

/** Builds a Set-Cookie header that clears the named cookie. */
export function buildClearCookie(name: string, path = '/'): string {
  return `${name}=; Max-Age=0; Path=${path}; HttpOnly; Secure; SameSite=Lax`;
}
