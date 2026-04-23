/**
 * Exercises the AI-gate middleware in isolation. The login allowlist is
 * already covered by the auth routes; here we just need to confirm that
 * a valid operator session gets admitted or refused based on the new
 * `AI_ALLOWED_IDENTITIES` env var.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { checkAiAccess, withAIOperator } from '../middleware.js';
import {
  OPERATOR_COOKIE_NAME,
  signOperatorCookie,
} from '../cookies.js';

const AUTH_SECRET = 'a'.repeat(48);

function requestWithOperator(identity: string): Request {
  const token = signOperatorCookie({ method: 'github', identity });
  return new Request('http://localhost/api/ai-op', {
    method: 'POST',
    headers: {
      cookie: `${OPERATOR_COOKIE_NAME}=${encodeURIComponent(token)}`,
    },
  });
}

function requestWithPasswordOperator(): Request {
  const token = signOperatorCookie({ method: 'password', identity: 'operator' });
  return new Request('http://localhost/api/ai-op', {
    method: 'POST',
    headers: {
      cookie: `${OPERATOR_COOKIE_NAME}=${encodeURIComponent(token)}`,
    },
  });
}

const okHandler = withAIOperator(async () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }),
);

describe('withAIOperator', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', AUTH_SECRET);
  });

  it('admits an operator whose identity is on AI_ALLOWED_IDENTITIES', async () => {
    vi.stubEnv('AI_ALLOWED_IDENTITIES', 'you@example.com,teammate@example.com');
    const res = await okHandler(requestWithOperator('you@example.com'));
    expect(res.status).toBe(200);
  });

  it('matches identities case-insensitively', async () => {
    vi.stubEnv('AI_ALLOWED_IDENTITIES', 'You@Example.com');
    const res = await okHandler(requestWithOperator('you@example.com'));
    expect(res.status).toBe(200);
  });

  it('rejects a signed-in operator not on AI_ALLOWED_IDENTITIES with 403', async () => {
    vi.stubEnv('AI_ALLOWED_IDENTITIES', 'you@example.com');
    const res = await okHandler(requestWithOperator('stranger@example.com'));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('ai_forbidden');
  });

  it('rejects a password session (identity=operator) with 403 by default', async () => {
    vi.stubEnv('AI_ALLOWED_IDENTITIES', 'you@example.com');
    const res = await okHandler(requestWithPasswordOperator());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('ai_forbidden');
  });

  it('rejects with 401 when no operator cookie is present', async () => {
    vi.stubEnv('AI_ALLOWED_IDENTITIES', 'you@example.com');
    const req = new Request('http://localhost/api/ai-op', { method: 'POST' });
    const res = await okHandler(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('unauthorized');
  });

  it('fails closed when AI_ALLOWED_IDENTITIES is empty (503)', async () => {
    vi.stubEnv('AI_ALLOWED_IDENTITIES', '');
    const res = await okHandler(requestWithOperator('you@example.com'));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('ai_not_configured');
  });

  it('ignores blank entries and extra whitespace in the env var', async () => {
    vi.stubEnv('AI_ALLOWED_IDENTITIES', '  ,you@example.com  ,,  ');
    const res = await okHandler(requestWithOperator('you@example.com'));
    expect(res.status).toBe(200);
  });
});

describe('checkAiAccess', () => {
  it('returns not_configured when env is empty', () => {
    vi.stubEnv('AI_ALLOWED_IDENTITIES', '');
    expect(checkAiAccess({ identity: 'you@example.com' })).toEqual({
      kind: 'not_configured',
    });
  });

  it('returns allowed for a matching identity (case-insensitive)', () => {
    vi.stubEnv('AI_ALLOWED_IDENTITIES', 'You@Example.com');
    expect(checkAiAccess({ identity: 'you@example.com' })).toEqual({
      kind: 'allowed',
    });
  });

  it('returns forbidden when identity is not on the allowlist', () => {
    vi.stubEnv('AI_ALLOWED_IDENTITIES', 'you@example.com');
    expect(checkAiAccess({ identity: 'stranger@example.com' })).toEqual({
      kind: 'forbidden',
    });
  });

  it('returns forbidden for password-identity (`operator`) by default', () => {
    vi.stubEnv('AI_ALLOWED_IDENTITIES', 'you@example.com');
    expect(checkAiAccess({ identity: 'operator' })).toEqual({
      kind: 'forbidden',
    });
  });
});
