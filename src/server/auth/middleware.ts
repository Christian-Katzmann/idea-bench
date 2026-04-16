/**
 * Handler wrappers for Vercel Functions (Web-API style handlers).
 *
 * `withOperator`     — rejects with 401 unless the request carries a
 *                       valid `operator_session` cookie.
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
} from './cookies';

export interface OperatorHandlerContext {
  /** Placeholder — there is exactly one operator; no identity to carry. */
  operator: true;
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
    return handler(req, { operator: true });
  };
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
