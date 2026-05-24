# Contributing to ïdea Bench

Thanks for taking a look. ïdea Bench is a small, opinionated project; the
guidelines below exist so contributions land smoothly without surprising
either of us.

## Project scope

ïdea Bench is a **single-operator self-hostable** evaluation tool. One
person (or one small team sharing credentials) deploys it, runs campaigns,
and shares participant links. Multi-tenant SaaS — separate accounts,
billing, team workspaces, org-level RBAC — is **explicitly out of scope**.
Pull requests in that direction will be politely closed; please open an
issue first if you think the line should move.

In scope:

- New contestant kinds (model bake-offs, system prompts, prompt variants).
- New voter or persona behaviours.
- Better ratings, charts, exports.
- Operator-quality-of-life improvements (auth, observability, ops).
- Anything that makes a self-hosted install easier to run and maintain.

Out of scope (without prior discussion):

- Multi-tenancy / per-user dashboards.
- A hosted SaaS layer or billing.
- Provider-specific UI for models that already work fine through
  OpenRouter.

## Local setup

The full setup is in [README.md](./README.md) — Node 20+, Postgres
(Neon or local), `npm install`, `cp .env.example .env.local`,
`npm run db:migrate`, `npm run db:seed`, `npm run dev`. Follow that
section verbatim; don't rely on memory.

## Before you open a PR

Run these against your branch. If either fails, the PR will fail too.

```bash
npm run lint        # tsc --noEmit
npm run test:run    # vitest run
```

For UI work, also start `npm run dev` and exercise the change in a
browser. Tests catch correctness; only the running app catches feel.

## Proposing a change

- **Trivial fixes** (typo, broken link, obvious bug in a small area):
  open a PR directly.
- **Anything else** — new feature, schema change, refactor that touches
  more than one module, change to operator auth or the AI-spend gate:
  **open an issue first**. A short description of what and why saves
  both of us from a wasted PR.

Keep PRs focused. One concern per PR; unrelated cleanups in a separate
PR even if you spot them along the way.

### Commit messages

Follow the existing style — see `git log` for recent commits. Short
imperative subject, body explaining the *why* if it isn't obvious.

### Source headers

Every TypeScript/JavaScript source file in this repo carries an
SPDX header:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
```

New files should include the same header at the top.

## Working with AI coding agents

The repo ships with `.adx/` — a set of machine-readable contracts
(module map, command registry, risk register, recovery notes) intended
for AI coding agents like Claude Code or Codex. If you use one, point it
at `.adx/README.md`; the rest is documented there. If you don't, ignore
the folder — nothing about the human workflow depends on it.

## Reporting security issues

Please don't open public issues for vulnerabilities. See
[SECURITY.md](./SECURITY.md) for the disclosure process.

## Code of conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md).
By participating you agree to its terms.
