# ModelArena

An organizational tool for evaluating AI models through head-to-head voting
campaigns.

## Status

Under construction. See the Phase 1 PR description for scope — this branch
adds the persistence layer; route handlers land in Phase 2.

## Local setup

**Prerequisites**

- Node.js 20+ (24 LTS is the current default on Vercel)
- A Postgres database — provisioned via the Vercel Marketplace → Neon
  integration in CI/production, or a local container for offline work
- (Phase 2) An OpenRouter API key

**Steps**

```bash
npm install
cp .env.example .env.local
# Fill in DATABASE_URL, OPERATOR_PASSWORD, AUTH_SECRET.
# Generate a secret: openssl rand -hex 32

npm run db:migrate     # apply schema
npm run db:seed        # load demo campaigns (destructive; dev DB only)
npm run dev            # http://localhost:3000
```

The seed script prints the share slugs it created so you can jump straight
into the participant flow at `http://localhost:3000/vote/<slug>`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server. |
| `npm run build` | Production build. |
| `npm run lint` | `tsc --noEmit`. |
| `npm run db:generate` | Diff schema → new SQL migration in `drizzle/`. Commit the output. |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL`. |
| `npm run db:push` | Push schema directly to `DATABASE_URL` (dev only — skips migration history). |
| `npm run db:studio` | Launch Drizzle Studio against `DATABASE_URL`. |
| `npm run db:seed` | Wipe and re-seed the demo data. **Refuses to run in `NODE_ENV=production`** unless `ALLOW_PROD_SEED=1`. |

## Operator auth

Three sign-in methods, all issuing the same `operator_session` cookie
(HMAC-signed, 30-day expiry). Enable the ones you want by populating the
relevant env vars; anything unset stays hidden/disabled in the UI.

| Method | Env vars | Notes |
|---|---|---|
| Password | `OPERATOR_PASSWORD` | Always available. Constant-time compare + 400ms delay on mismatch. |
| GitHub OAuth | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `OPERATOR_GITHUB_LOGINS` | Register an OAuth App at `github.com/settings/developers` with callback `${origin}/api/auth/github-callback`. The allowlist matches either the GitHub login OR any verified email on the account. |
| Email magic link | `OPERATOR_EMAILS`, `RESEND_API_KEY`, optional `RESEND_SENDER_ADDRESS` | Resend-backed. 15-min single-use tokens; `sha256(token)` stored server-side. Sender defaults to the Resend sandbox (delivers only to the account's verified email); set `RESEND_SENDER_ADDRESS=auth@your-domain` once your domain is verified in Resend. |

Cookie payload: `{ kind: 'op', method, identity, iat, exp }`. `method` is
one of `password | github | email`; `identity` is the user's email
(GitHub/magic link) or literal `'operator'` (password). Handlers receive
this via `withOperator`'s context. Rotating `AUTH_SECRET` invalidates every
outstanding cookie — acceptable because there's exactly one operator.

Per-IP rate limiting (5 attempts / 15 min) guards the GitHub callback, email
send, and email verify endpoints. In-memory sliding window — acceptable
given magic links are single-use and short-lived.

## Architecture

- Vite SPA frontend (`src/`).
- Vercel Functions for the API (`api/`).
- Neon Postgres via `@neondatabase/serverless` + Drizzle ORM.
- Operator auth: password / GitHub OAuth / email magic link — see above.
- Participant auth: anonymous, HMAC-signed cookie for vote dedup.

See `src/server/` for DB and auth primitives. Client-safe utilities live
in `src/lib/`.
