import {
  OPERATOR_COOKIE_MAX_AGE_MS,
  OPERATOR_COOKIE_NAME,
  buildSetCookie,
  signOperatorCookie,
} from '../../auth/cookies.js';

/**
 * POST /api/auth/login
 * Body: { password: string }
 * Sets operator_session cookie on success.
 *
 * Rate limiting is NOT implemented here. Acceptable for single-operator
 * MVP but worth revisiting if this endpoint is ever exposed publicly.
 */
async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const expected = process.env.OPERATOR_PASSWORD;
  if (!expected || expected.length < 4) {
    return json({ error: 'OPERATOR_PASSWORD not configured on server' }, 500);
  }

  let body: { password?: unknown };
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  const submitted = typeof body.password === 'string' ? body.password : '';

  // Constant-time compare to avoid timing leaks on short passwords.
  if (!constantTimeEqual(submitted, expected)) {
    // Mild linear slowdown on failure; keeps brute force painful without
    // introducing a full rate limiter in this file.
    await new Promise((r) => setTimeout(r, 400));
    return json({ error: 'invalid password' }, 401);
  }

  const token = signOperatorCookie({ method: 'password', identity: 'operator' });
  const cookie = buildSetCookie(OPERATOR_COOKIE_NAME, token, {
    maxAgeMs: OPERATOR_COOKIE_MAX_AGE_MS,
    path: '/',
    sameSite: 'Lax',
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': cookie,
    },
  });
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const loginWebHandler = handler;
