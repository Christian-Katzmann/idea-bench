import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  githubAuthorizeWebHandler,
  githubCallbackWebHandler,
} from '../github';
import { __resetRateLimitsForTest } from '../../../auth/rate-limit';
import { verifyOperatorCookie } from '../../../auth/cookies';

function req(
  url: string,
  init?: { method?: string; cookies?: Record<string, string> },
): Request {
  const headers = new Headers();
  if (init?.cookies) {
    const raw = Object.entries(init.cookies)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('; ');
    headers.set('cookie', raw);
  }
  return new Request(url, { method: init?.method ?? 'GET', headers });
}

function extractCookieValue(
  setCookieHeaders: string[],
  name: string,
): string | undefined {
  for (const h of setCookieHeaders) {
    if (h.startsWith(`${name}=`)) {
      const eq = h.indexOf('=');
      const semi = h.indexOf(';');
      const v = h.slice(eq + 1, semi === -1 ? h.length : semi);
      return decodeURIComponent(v);
    }
  }
  return undefined;
}

function getAllSetCookies(res: Response): string[] {
  const out: string[] = [];
  // Response.headers doesn't fully split multiple Set-Cookie. Use getSetCookie when available.
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === 'function') return h.getSetCookie();
  const raw = res.headers.get('set-cookie');
  if (raw) out.push(raw);
  return out;
}

describe('github auth routes', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'x'.repeat(32));
    vi.stubEnv('GITHUB_OAUTH_CLIENT_ID', 'client-id-abc');
    vi.stubEnv('GITHUB_OAUTH_CLIENT_SECRET', 'client-secret-xyz');
    vi.stubEnv('OPERATOR_GITHUB_LOGINS', 'alice, bob@example.com');
    __resetRateLimitsForTest();
  });

  describe('authorize', () => {
    it('redirects to github.com with a state cookie', async () => {
      const res = await githubAuthorizeWebHandler(
        req('https://app.example.com/api/auth/github'),
      );
      expect(res.status).toBe(302);
      const loc = res.headers.get('location')!;
      expect(loc).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
      const u = new URL(loc);
      expect(u.searchParams.get('client_id')).toBe('client-id-abc');
      expect(u.searchParams.get('redirect_uri')).toBe(
        'https://app.example.com/api/auth/github-callback',
      );
      expect(u.searchParams.get('scope')).toBe('read:user user:email');
      expect(u.searchParams.get('state')).toMatch(/^[a-f0-9]{64}$/);
      expect(u.searchParams.get('allow_signup')).toBe('false');
      const cookies = getAllSetCookies(res);
      expect(extractCookieValue(cookies, 'gh_oauth_state')).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns 503 when client id is missing', async () => {
      vi.stubEnv('GITHUB_OAUTH_CLIENT_ID', '');
      const res = await githubAuthorizeWebHandler(
        req('https://app.example.com/api/auth/github'),
      );
      expect(res.status).toBe(503);
    });
  });

  describe('callback', () => {
    function mockGithubFetch(
      user: { login: string } | null,
      emails: Array<{ email: string; primary: boolean; verified: boolean }> | null,
      token: string | null = 'gho_xyz',
    ) {
      return vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.includes('oauth/access_token')) {
          return new Response(
            token ? JSON.stringify({ access_token: token }) : '{}',
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.endsWith('/user')) {
          return new Response(JSON.stringify(user ?? {}), {
            status: user ? 200 : 401,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.endsWith('/user/emails')) {
          return new Response(JSON.stringify(emails ?? []), {
            status: emails ? 200 : 401,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
    }

    it('rejects missing state cookie', async () => {
      const res = await githubCallbackWebHandler(
        req('https://app.example.com/api/auth/github-callback?code=c&state=s'),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/login?error=oauth_invalid_state');
    });

    it('rejects state mismatch', async () => {
      const res = await githubCallbackWebHandler(
        req('https://app.example.com/api/auth/github-callback?code=c&state=aaa', {
          cookies: { gh_oauth_state: 'bbb' },
        }),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/login?error=oauth_state_mismatch');
    });

    it('issues session cookie when login matches allowlist', async () => {
      vi.stubGlobal(
        'fetch',
        mockGithubFetch(
          { login: 'alice' },
          [{ email: 'alice@company.dev', primary: true, verified: true }],
        ),
      );
      const res = await githubCallbackWebHandler(
        req(
          'https://app.example.com/api/auth/github-callback?code=c&state=zzz',
          { cookies: { gh_oauth_state: 'zzz' } },
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/');
      const cookies = getAllSetCookies(res);
      const session = extractCookieValue(cookies, 'operator_session');
      expect(session).toBeDefined();
      const payload = verifyOperatorCookie(session!);
      expect(payload?.method).toBe('github');
      expect(payload?.identity).toBe('alice@company.dev');
    });

    it('issues session cookie when verified email matches allowlist', async () => {
      vi.stubGlobal(
        'fetch',
        mockGithubFetch({ login: 'someone-else' }, [
          { email: 'bob@example.com', primary: true, verified: true },
        ]),
      );
      const res = await githubCallbackWebHandler(
        req(
          'https://app.example.com/api/auth/github-callback?code=c&state=zzz',
          { cookies: { gh_oauth_state: 'zzz' } },
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/');
      const cookies = getAllSetCookies(res);
      const payload = verifyOperatorCookie(
        extractCookieValue(cookies, 'operator_session')!,
      );
      expect(payload?.method).toBe('github');
      expect(payload?.identity).toBe('bob@example.com');
    });

    it('rejects unverified emails', async () => {
      vi.stubGlobal(
        'fetch',
        mockGithubFetch({ login: 'someone-else' }, [
          { email: 'bob@example.com', primary: true, verified: false },
        ]),
      );
      const res = await githubCallbackWebHandler(
        req(
          'https://app.example.com/api/auth/github-callback?code=c&state=zzz',
          { cookies: { gh_oauth_state: 'zzz' } },
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/login?error=oauth_forbidden');
    });

    it('rejects when login and emails both miss', async () => {
      vi.stubGlobal(
        'fetch',
        mockGithubFetch({ login: 'eve' }, [
          { email: 'eve@eve.dev', primary: true, verified: true },
        ]),
      );
      const res = await githubCallbackWebHandler(
        req(
          'https://app.example.com/api/auth/github-callback?code=c&state=zzz',
          { cookies: { gh_oauth_state: 'zzz' } },
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/login?error=oauth_forbidden');
    });

    it('rejects when access_token is missing', async () => {
      vi.stubGlobal('fetch', mockGithubFetch(null, null, null));
      const res = await githubCallbackWebHandler(
        req(
          'https://app.example.com/api/auth/github-callback?code=c&state=zzz',
          { cookies: { gh_oauth_state: 'zzz' } },
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/login?error=oauth_no_access_token');
    });
  });
});
