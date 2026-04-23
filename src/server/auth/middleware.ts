/**
 * Handler wrappers for Vercel Functions (Web-API style handlers).
 *
 * `withOperator`     — rejects with 401 unless the request carries a
 *                       valid `operator_session` cookie.
 * `withAIOperator`   — stricter gate on top of `withOperator`. Only
 *                       operators whose session `identity` appears in
 *                       `AI_ALLOWED_IDENTITIES` may reach the handler.
 *                       Fail-closed: empty env → 503, not open.
 * `withParticipant`  — reads/issues the `participant_id` cookie. Never
 *                       rejects — participants are anonymous by design.
 *                       If no valid cookie exists, one is minted and
 *                       attached to the response via Set-Cookie.
 *
 * These are intentionally small. Route handlers unwrap the context and
 * get a guaranteed `operator` or `participantCookieId` in scope.
 */
import {
  OPERATOR_COOKIE_NAME,
  PARTICIPANT_COOKIE_NAME,
  PARTICIPANT_COOKIE_MAX_AGE_MS,
  buildSetCookie,
  parseCookieHeader,
  signParticipantCookie,
  verifyOperatorCookie,
  verifyParticipantCookie,
  type OperatorMethod,
} from './cookies.js';

export interface OperatorHandlerContext {
  operator: { method: OperatorMethod; identity: string };
}

export interface ParticipantHandlerContext {
  /** Stable UUID from the signed cookie. Safe to use as a foreign key. */
  participantCookieId: string;
  /**
   * When a new cookie was just minted, this is the Set-Cookie header the
   * wrapper will attach to the response. Handlers never need to touch
   * this directly.
   */
  freshCookieHeader?: string;
}

export type OperatorHandler = (
  req: Request,
  ctx: OperatorHandlerContext,
) => Response | Promise<Response>;

export type ParticipantHandler = (
  req: Request,
  ctx: ParticipantHandlerContext,
) => Response | Promise<Response>;

export function withOperator(handler: OperatorHandler) {
  return async (req: Request): Promise<Response> => {
    const cookies = parseCookieHeader(req.headers.get('cookie'));
    const session = verifyOperatorCookie(cookies[OPERATOR_COOKIE_NAME]);
    if (!session) {
      return new Response(
        JSON.stringify({ error: 'unauthorized' }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    return handler(req, {
      operator: { method: session.method, identity: session.identity },
    });
  };
}

function parseAiAllowlist(): string[] {
  return (process.env.AI_ALLOWED_IDENTITIES ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export type AiAccess =
  | { kind: 'allowed' }
  | { kind: 'not_configured' }
  | { kind: 'forbidden' };

/**
 * Resolves whether an operator may trigger AI spend. Single source of
 * truth — `withAIOperator` enforces this on the server, `/api/auth/me`
 * surfaces it to the client so the UI can hide run buttons.
 *
 * Password sessions use the literal identity `'operator'`; including
 * that word in the env var would give AI access to anyone who knows
 * the shared password. Keep AI behind personal GitHub/email identities.
 */
export function checkAiAccess(op: { identity: string }): AiAccess {
  const allowlist = parseAiAllowlist();
  if (allowlist.length === 0) return { kind: 'not_configured' };
  if (allowlist.includes(op.identity.toLowerCase())) {
    return { kind: 'allowed' };
  }
  return { kind: 'forbidden' };
}

/**
 * Stricter-than-operator gate for AI-spending endpoints.
 *
 * Must-know: login and AI access are now two separate allowlists.
 * `OPERATOR_*` controls who can sign in; `AI_ALLOWED_IDENTITIES` controls
 * which of those signed-in operators may trigger OpenRouter calls.
 *
 * Fail-closed: an empty `AI_ALLOWED_IDENTITIES` returns 503, not 200. A
 * forgotten env var stops AI, not overspending.
 */
export function withAIOperator(handler: OperatorHandler) {
  return withOperator(async (req, ctx) => {
    const access = checkAiAccess(ctx.operator);
    if (access.kind === 'not_configured') {
      return new Response(
        JSON.stringify({ error: 'ai_not_configured' }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      );
    }
    if (access.kind === 'forbidden') {
      return new Response(
        JSON.stringify({ error: 'ai_forbidden' }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      );
    }
    return handler(req, ctx);
  });
}

export function withParticipant(handler: ParticipantHandler) {
  return async (req: Request): Promise<Response> => {
    const cookies = parseCookieHeader(req.headers.get('cookie'));
    const existing = verifyParticipantCookie(cookies[PARTICIPANT_COOKIE_NAME]);

    let participantCookieId: string;
    let freshCookieHeader: string | undefined;

    if (existing) {
      participantCookieId = existing.cookieId;
    } else {
      participantCookieId = crypto.randomUUID();
      const token = signParticipantCookie(participantCookieId);
      freshCookieHeader = buildSetCookie(PARTICIPANT_COOKIE_NAME, token, {
        maxAgeMs: PARTICIPANT_COOKIE_MAX_AGE_MS,
        path: '/',
        sameSite: 'Lax',
      });
    }

    const res = await handler(req, {
      participantCookieId,
      freshCookieHeader,
    });

    if (freshCookieHeader) {
      // `append` rather than `set` so handlers can emit their own
      // Set-Cookie headers (e.g. the /api/auth/login handler).
      res.headers.append('Set-Cookie', freshCookieHeader);
    }
    return res;
  };
}
