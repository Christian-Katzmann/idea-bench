/**
 * GitHub OAuth login.
 *
 *   GET /api/auth/github          — redirect to github.com/authorize
 *   GET /api/auth/github-callback — exchange code, verify allowlist, issue cookie
 *
 * Allowlist is OPERATOR_GITHUB_LOGINS (comma-separated). A login matches
 * if either the GitHub username OR any verified email on the account
 * appears in the list (user chose "either" during planning).
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  OPERATOR_COOKIE_MAX_AGE_MS,
  OPERATOR_COOKIE_NAME,
  buildClearCookie,
  buildSetCookie,
  parseCookieHeader,
  signOperatorCookie,
} from '../../auth/cookies.js';
import {
  checkRateLimit,
  ipFromRequest,
  rateLimitResponse,
} from '../../auth/rate-limit.js';

const STATE_COOKIE_NAME = 'gh_oauth_state';
const STATE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

function parseAllowlist(): string[] {
  const raw = process.env.OPERATOR_GITHUB_LOGINS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function redirect(to: string, setCookies: string[] = []): Response {
  const res = new Response(null, { status: 302, headers: { location: to } });
  for (const c of setCookies) res.headers.append('set-cookie', c);
  return res;
}

function originOf(req: Request): string {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

async function authorizeHandler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return new Response('GitHub OAuth not configured', { status: 503 });
  }

  const state = randomBytes(32).toString('hex');
  const stateCookie = buildSetCookie(STATE_COOKIE_NAME, state, {
    maxAgeMs: STATE_COOKIE_MAX_AGE_MS,
    path: '/',
    sameSite: 'Lax',
  });

  const callbackUrl = `${originOf(req)}/api/auth/github-callback`;
  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl);
  authorizeUrl.searchParams.set('scope', 'read:user user:email');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('allow_signup', 'false');

  return redirect(authorizeUrl.toString(), [stateCookie]);
}

function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

async function callbackHandler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  // Rate-limit: callback can be replayed with stale codes; cheap and important.
  const ip = ipFromRequest(req);
  const rl = checkRateLimit(`gh-callback:${ip}`);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new Response('GitHub OAuth not configured', { status: 503 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const urlState = url.searchParams.get('state');
  const clearStateCookie = buildClearCookie(STATE_COOKIE_NAME);

  const cookies = parseCookieHeader(req.headers.get('cookie'));
  const cookieState = cookies[STATE_COOKIE_NAME];

  if (!code || !urlState || !cookieState) {
    return redirect('/login?error=oauth_invalid_state', [clearStateCookie]);
  }
  if (!constantTimeStringEqual(urlState, cookieState)) {
    return redirect('/login?error=oauth_state_mismatch', [clearStateCookie]);
  }

  // Exchange code for access token.
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${originOf(req)}/api/auth/github-callback`,
    }),
  });
  if (!tokenRes.ok) {
    return redirect('/login?error=oauth_token_exchange_failed', [clearStateCookie]);
  }
  const tokenBody = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenBody.access_token) {
    return redirect('/login?error=oauth_no_access_token', [clearStateCookie]);
  }

  // Fetch user + verified emails.
  const authHeader = { authorization: `Bearer ${tokenBody.access_token}`, accept: 'application/vnd.github+json' };
  const [userRes, emailsRes] = await Promise.all([
    fetch('https://api.github.com/user', { headers: authHeader }),
    fetch('https://api.github.com/user/emails', { headers: authHeader }),
  ]);
  if (!userRes.ok || !emailsRes.ok) {
    return redirect('/login?error=oauth_user_fetch_failed', [clearStateCookie]);
  }
  const user = (await userRes.json()) as { login?: string };
  const emails = (await emailsRes.json()) as Array<{
    email: string;
    primary: boolean;
    verified: boolean;
  }>;

  const allowlist = parseAllowlist();
  if (allowlist.length === 0) {
    return redirect('/login?error=oauth_allowlist_empty', [clearStateCookie]);
  }
  const login = (user.login ?? '').toLowerCase();
  const verifiedEmails = emails
    .filter((e) => e.verified && typeof e.email === 'string')
    .map((e) => e.email.toLowerCase());
  const primaryVerified =
    emails.find((e) => e.primary && e.verified)?.email.toLowerCase() ?? verifiedEmails[0];

  const allowed =
    (login && allowlist.includes(login)) ||
    verifiedEmails.some((e) => allowlist.includes(e));
  if (!allowed) {
    return redirect('/login?error=oauth_forbidden', [clearStateCookie]);
  }

  const identity = primaryVerified ?? login;
  const sessionCookie = buildSetCookie(
    OPERATOR_COOKIE_NAME,
    signOperatorCookie({ method: 'github', identity }),
    { maxAgeMs: OPERATOR_COOKIE_MAX_AGE_MS, path: '/', sameSite: 'Lax' },
  );

  return redirect('/', [clearStateCookie, sessionCookie]);
}

export const githubAuthorizeWebHandler = authorizeHandler;
export const githubCallbackWebHandler = callbackHandler;
