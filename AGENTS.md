# Agent Guide

## Start Here

- What this repo is: ModelArena, the app behind idea.com, for running blind AI model evaluation campaigns.
- Actual repo root: `modelarena/`.
- Safest first command: `git status --short`.
- ADX manifest: `.adx/adx.json`.
- Command registry: `.adx/commands.json`.
- Verification matrix: `.adx/verification.json`.
- Risk register: `.adx/risks.json`.
- Recovery notes: `.adx/recovery.md`.
- Module map: `.adx/modules/index.json`.

## Operating Rules

- Use `npm`, not pnpm or yarn. The source of truth is `package-lock.json`.
- Prefer the command registry over guessing setup, run, test, build, database, desktop, or deploy commands.
- Check `.adx/risks.json` before touching migrations, deploy config, secrets, production env files, seed scripts, cron routes, AI-spend paths, or desktop launcher scripts.
- Do not read, print, summarize, or edit `.env.local`, `.env.production.local`, `.vercel/`, or other local secret/config files unless Christian explicitly asks.
- Do not run destructive database commands, production deploys, migrations against an unknown database, or seed overrides without explicit approval.
- For UI work, follow `docs/design-system/DESIGN-SYSTEM.md` and reuse existing components before creating new ones.
- For server work, respect the strict boundary in `src/server/README.md`: client code must not import runtime server code from `src/server/**`.
- Preserve unrelated user edits. This repo is often dirty during active work.

## Working With Christian

- Christian is an innovator, creator, and systems thinker with basic coding knowledge.
- Do not ask him to make low-level code decisions unless there is a genuine product or risk tradeoff.
- Choose elegant, senior-quality implementations that fit the existing codebase.
- Explain outcomes plainly and keep technical detail useful, not performative.

## Architecture And Boundaries

- `src/pages/`: route-level React screens.
- `src/components/`: reusable UI, layout, dashboard, modal, voting, editor, model, onboarding, and attachment components.
- `src/lib/`: client-safe utilities and shared types.
- `src/server/`: server-only domain logic, DB access, auth, API helpers, OpenRouter, and Vercel adapters.
- `api/`: Vercel Function entrypoints. Prefer existing dispatchers before adding new functions.
- `drizzle/` and `src/server/db/schema.ts`: database schema and migration history.
- `scripts/`: local database, deploy preflight, desktop launcher, seed, and inspection scripts.
- `public/`, `index.html`, `vite.config.ts`: frontend build/runtime surfaces.

## Common Commands

The canonical command list is `.adx/commands.json`. The usual safe checks are:

```bash
git status --short
npm run lint
npm run test:run
npm run build
```

Run from `modelarena/` unless a command contract says otherwise.

## Verification

- Docs-only changes: inspect the diff and run `git status --short`.
- Frontend changes: run `npm run lint`, targeted tests when available, and usually `npm run build`.
- Server/API changes: run `npm run lint`, targeted Vitest tests, and `npm run test:run`.
- Database or deploy-adjacent changes: use the verification matrix and ask before migrations, seeds, or production-impacting actions.

## Dangerous Areas

High-risk areas are classified in `.adx/risks.json`. The most important ones:

- `.env*`, `.vercel/`, auth secrets, OpenRouter keys, and production configuration.
- `drizzle/`, `drizzle.config.ts`, `scripts/migrate.ts`, `scripts/seed.ts`, and `scripts/seed-starter-personas.ts`.
- `vercel.json`, `api/cron/**`, and deploy preflight behavior.
- AI-spend endpoints gated by `AI_ALLOWED_IDENTITIES`.
- Desktop launcher scripts that bake absolute paths or manage local processes.

## Durable Knowledge

Promote only stable, evidenced repo facts into `.adx` contracts or implementation receipts. Avoid long freeform session notes unless they capture a discovery future agents will actually need.
