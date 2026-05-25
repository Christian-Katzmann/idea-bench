# ADX Recovery Notes

These notes capture repo-specific first moves. They are not a replacement for
reading the failing code.

## Wrong Directory

Symptom: commands fail because `package.json` or `.git` is missing.

First check:

```bash
pwd
git status --short
```

Recovery: run app commands from the `idea-bench/` checkout root, not a parent workspace.

## Package Manager Confusion

Symptom: dependency commands or lockfile changes mention pnpm/yarn, or npm
cannot find expected scripts.

First check: `package-lock.json` and `package.json`.

Recovery: use `npm`. Do not introduce another package manager.

## Local Env Missing

Symptom: database, auth, OpenRouter, OAuth, Resend, or AI-spend paths fail
because environment variables are absent.

First check: `.env.example` for variable names. Do not inspect secret-bearing
local env files unless Christian explicitly asks.

Recovery: explain which variable names are required and let Christian provide or
configure secrets. For local development, README documents copying
`.env.example` to `.env.local`.

## Vercel Dev Does Not Work Non-Interactively

Symptom: `npm run dev:api` or `vercel dev` asks for scope, login, or interactive
setup.

First check: `src/server/README.md`.

Recovery: use `npm run dev` for ordinary local work. The Vite dev plugin serves
`api/**` handlers locally and was added because `vercel dev` was unreliable in
non-interactive shells.

## Tests Fail Before Your Change

Symptom: `npm run test:run` fails on a dirty worktree or before you touched the
area.

First check:

```bash
git status --short
npm run test:run
```

Recovery: capture the failing test names and determine whether they are related
to your files. Do not hide unrelated pre-existing failures. If failures are in
your changed area, fix them before finishing.

## Typecheck Fails

Symptom: `npm run lint` exits nonzero.

First check: the TypeScript error file paths and whether they overlap your
changes.

Recovery: fix local type errors directly. Avoid broad cleanup unless the error
requires it.

## Build Fails After UI Or Routing Work

Symptom: `npm run build` fails or built routing/assets behave differently from
dev.

First check: `vite.config.ts`, `vercel.json`, `public/login.html`, and the error
message.

Recovery: remember that Vite dev references `/src/main.tsx`, while production
HTML references hashed assets. Verify built behavior with `npm run build` and,
when needed, `npm run preview`.

## Database Command Needs DATABASE_URL

Symptom: `db:migrate`, `db:seed`, `db:studio`, or `deploy:check` says
`DATABASE_URL is not set`.

First check: whether the command truly needs a live database.

Recovery: if it does, ask Christian before relying on or changing local secrets.
Never run live database commands against an unknown target.

## Seed Script Would Destroy Data

Symptom: you need demo data and consider `npm run db:seed`.

First check: confirm `DATABASE_URL` points to a development database.

Recovery: `db:seed` truncates app tables. Ask first. Do not use
`ALLOW_PROD_SEED=1` unless Christian explicitly approves that exact action.

## Desktop Launcher Uses Stale Path Or Port

Symptom: the desktop app opens the wrong path, cannot find dependencies, or
keeps a stale server alive.

First check: `scripts/run-template.sh`, `scripts/appify.config.json`, and
whether generated `desktop/` output is stale.

Recovery: run `npm run desktop:quit` to stop lingering local launcher processes.
Rebuild with `npm run desktop:build` after path or launcher changes. Ask before
`npm run desktop:install`.
