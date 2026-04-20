import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../db/client', () => ({ getDb: vi.fn() }));

import {
  magicLinkSendWebHandler,
  magicLinkVerifyWebHandler,
} from '../magic-link';
import { __resetRateLimitsForTest } from '../../../auth/rate-limit';
import { __resetEmailWarnings } from '../../../auth/email';
import { verifyOperatorCookie } from '../../../auth/cookies';
import { getDb } from '../../../db/client';

const getDbMock = getDb as unknown as ReturnType<typeof vi.fn>;

interface FakeDbOpts {
  selectRows?: Array<Record<string, unknown>>;
}

function makeFakeDb(opts: FakeDbOpts = {}) {
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const selectRows = opts.selectRows ?? [];
  const db = {
    _inserts: inserts,
    _updates: updates,
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserts.push(v);
        return Promise.resolve();
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectRows),
        }),
      }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          updates.push(v);
          return Promise.resolve();
        },
      }),
    }),
  };
  return db;
}

function jsonReq(
  url: string,
  body: unknown,
  init?: { method?: string },
): Request {
  return new Request(url, {
    method: init?.method ?? 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getAllSetCookies(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === 'function') return h.getSetCookie();
  const raw = res.headers.get('set-cookie');
  return raw ? [raw] : [];
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

describe('magic-link routes', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'x'.repeat(32));
    vi.stubEnv('OPERATOR_EMAILS', 'alice@co.dev, bob@co.dev');
    vi.stubEnv('RESEND_API_KEY', 'resend-key');
    vi.stubEnv('RESEND_SENDER_ADDRESS', 'auth@co.dev');
    __resetRateLimitsForTest();
    __resetEmailWarnings();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
  });

  describe('email-send', () => {
    it('rejects non-POST', async () => {
      const res = await magicLinkSendWebHandler(
        new Request('https://app.example.com/api/auth/email-send', {
          method: 'GET',
        }),
      );
      expect(res.status).toBe(405);
    });

    it('ignores invalid email shape (no enumeration)', async () => {
      const db = makeFakeDb();
      getDbMock.mockReturnValue(db);
      const res = await magicLinkSendWebHandler(
        jsonReq('https://app.example.com/api/auth/email-send', { email: 'not-an-email' }),
      );
      expect(res.status).toBe(200);
      expect(db._inserts).toHaveLength(0);
    });

    it('returns 200 for disallowed address without inserting or sending', async () => {
      const db = makeFakeDb();
      getDbMock.mockReturnValue(db);
      const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const res = await magicLinkSendWebHandler(
        jsonReq('https://app.example.com/api/auth/email-send', { email: 'eve@co.dev' }),
      );
      expect(res.status).toBe(200);
      expect(db._inserts).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('inserts token + sends email for allowlisted address', async () => {
      const db = makeFakeDb();
      getDbMock.mockReturnValue(db);
      const fetchMock = vi.fn(
        async (_url: string, _init?: { body?: string }) =>
          new Response('{}', { status: 200 }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const res = await magicLinkSendWebHandler(
        jsonReq('https://app.example.com/api/auth/email-send', { email: 'alice@co.dev' }),
      );
      expect(res.status).toBe(200);
      expect(db._inserts).toHaveLength(1);
      const row = db._inserts[0]!;
      expect(row.email).toBe('alice@co.dev');
      expect(typeof row.tokenHash).toBe('string');
      expect((row.tokenHash as string)).toMatch(/^[a-f0-9]{64}$/);
      expect(row.expiresAt).toBeInstanceOf(Date);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [callUrl, callInit] = fetchMock.mock.calls[0]!;
      expect(callUrl).toBe('https://api.resend.com/emails');
      const sent = JSON.parse(callInit!.body!);
      expect(sent.to).toBe('alice@co.dev');
      expect(sent.html).toMatch(/\/api\/auth\/email-verify\?token=[a-f0-9]+/);
    });

    it('normalizes address case', async () => {
      const db = makeFakeDb();
      getDbMock.mockReturnValue(db);
      const res = await magicLinkSendWebHandler(
        jsonReq('https://app.example.com/api/auth/email-send', { email: 'Alice@CO.DEV' }),
      );
      expect(res.status).toBe(200);
      expect(db._inserts).toHaveLength(1);
      expect(db._inserts[0]!.email).toBe('alice@co.dev');
    });

    it('redirects to /login?sent=1 for HTML form submissions', async () => {
      const db = makeFakeDb();
      getDbMock.mockReturnValue(db);
      const form = new URLSearchParams({ email: 'alice@co.dev' }).toString();
      const res = await magicLinkSendWebHandler(
        new Request('https://app.example.com/api/auth/email-send', {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'text/html,application/xhtml+xml',
          },
          body: form,
        }),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/login?sent=1');
    });
  });

  describe('email-verify', () => {
    it('rejects short or missing token', async () => {
      const res = await magicLinkVerifyWebHandler(
        new Request('https://app.example.com/api/auth/email-verify?token=abc'),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/login?error=magic_invalid');
    });

    it('rejects unknown token', async () => {
      getDbMock.mockReturnValue(makeFakeDb({ selectRows: [] }));
      const res = await magicLinkVerifyWebHandler(
        new Request(
          'https://app.example.com/api/auth/email-verify?token=' + 'a'.repeat(64),
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/login?error=magic_invalid');
    });

    it('rejects expired token', async () => {
      getDbMock.mockReturnValue(
        makeFakeDb({
          selectRows: [
            {
              tokenHash: 'whatever',
              email: 'alice@co.dev',
              expiresAt: new Date(Date.now() - 60_000),
              consumedAt: null,
            },
          ],
        }),
      );
      const res = await magicLinkVerifyWebHandler(
        new Request(
          'https://app.example.com/api/auth/email-verify?token=' + 'a'.repeat(64),
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/login?error=magic_expired');
    });

    it('rejects already-consumed token', async () => {
      getDbMock.mockReturnValue(
        makeFakeDb({
          selectRows: [
            {
              tokenHash: 'whatever',
              email: 'alice@co.dev',
              expiresAt: new Date(Date.now() + 60_000),
              consumedAt: new Date(Date.now() - 10_000),
            },
          ],
        }),
      );
      const res = await magicLinkVerifyWebHandler(
        new Request(
          'https://app.example.com/api/auth/email-verify?token=' + 'a'.repeat(64),
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/login?error=magic_consumed');
    });

    it('issues session cookie + marks consumed for valid token', async () => {
      const db = makeFakeDb({
        selectRows: [
          {
            tokenHash: 'whatever',
            email: 'alice@co.dev',
            expiresAt: new Date(Date.now() + 60_000),
            consumedAt: null,
          },
        ],
      });
      getDbMock.mockReturnValue(db);
      const res = await magicLinkVerifyWebHandler(
        new Request(
          'https://app.example.com/api/auth/email-verify?token=' + 'a'.repeat(64),
        ),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/');
      expect(db._updates).toHaveLength(1);
      expect(db._updates[0]!.consumedAt).toBeInstanceOf(Date);
      const session = extractCookieValue(
        getAllSetCookies(res),
        'operator_session',
      );
      const payload = verifyOperatorCookie(session!);
      expect(payload?.method).toBe('email');
      expect(payload?.identity).toBe('alice@co.dev');
    });
  });
});
