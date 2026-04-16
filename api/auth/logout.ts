import {
  OPERATOR_COOKIE_NAME,
  buildClearCookie,
} from '../../src/server/auth/cookies';

/** POST /api/auth/logout — clears the operator session cookie. */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': buildClearCookie(OPERATOR_COOKIE_NAME),
    },
  });
}
