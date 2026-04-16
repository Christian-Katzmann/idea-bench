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

## Architecture

- Vite SPA frontend (`src/`).
- Vercel Functions for the API (`api/`, coming in Phase 2).
- Neon Postgres via `@neondatabase/serverless` + Drizzle ORM.
- Operator auth: password-cookie middleware (HMAC-signed, 30-day expiry).
- Participant auth: anonymous, HMAC-signed cookie for vote dedup.

See `src/server/` for DB and auth primitives. Client-safe utilities live
in `src/lib/`.
