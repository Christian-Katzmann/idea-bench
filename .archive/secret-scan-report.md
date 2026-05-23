# Secret-history scan — pre-publish audit

**Date:** 2026-05-23
**Scanners:** gitleaks 8.30.1 (primary), trufflehog 3.95.2 (cross-check)
**Scope:** Full git history (103 commits, ~4.4 MB) + uncommitted working tree
**Repo:** `modelarena` on branch `public-prep`

## Headline

**Git history is clean.** Zero genuine secrets have ever been committed.
The only working-tree hits are in files already blocked by `.gitignore`,
which means they will not appear on GitHub when the repo is flipped public.

The keys flagged below are nevertheless rotated as a defence-in-depth move,
because they exist on Christian's laptop and on Vercel — both
out-of-band of git history but still in scope for a "before going public"
hardening pass.

## How the scan was run

```bash
# History (every commit on every ref)
gitleaks detect --source . --no-banner --redact \
  --log-opts="--all" \
  --report-format json --report-path /tmp/gitleaks-history.json
#  -> "no leaks found"

# Working tree (untracked + ignored files included)
gitleaks detect --source . --no-banner --redact --no-git \
  --report-format json --report-path /tmp/gitleaks-wt.json
#  -> 10 leaks (all inside .gitignored files — see below)

# Cross-check
trufflehog git file://. --json --no-update
#  -> 1 finding: postgres://user:pass@host:5432 in .env.example
#     (the documentation placeholder — false positive)
```

## Findings

### Git history (committed)

| # | Source | RuleID / Detector | File | Classification |
|---|--------|-------------------|------|----------------|
| 1 | trufflehog | Postgres | `.env.example:1` | (c) **test fixture — keep**. Placeholder `postgres://user:pass@host:5432`; documentation example. Not a real credential. |

gitleaks reported **0** findings across all commits and refs.

### Working tree (uncommitted, in `.gitignore`)

These 10 hits are real secrets sitting on Christian's laptop. They have
never been pushed (gitignore caught them) but they are listed for the
rotation log below.

| # | RuleID | File | Line | Variable | Classification |
|---|--------|------|------|----------|----------------|
| 1 | generic-api-key | `.env.local` | 3 | `AUTH_SECRET` | (a) **genuine — rotate** |
| 2 | generic-api-key | `.env.local` | 4 | `OPENROUTER_API_KEY` | (a) **genuine — rotate** |
| 3 | generic-api-key | `.env.local` | 9 | `GITHUB_OAUTH_CLIENT_ID` | (a) **genuine — rotate** (public-ish, but rotated with secret) |
| 4 | generic-api-key | `.env.local` | 10 | `GITHUB_OAUTH_CLIENT_SECRET` | (a) **genuine — rotate** |
| 5 | generic-api-key | `.env.production.local` | 2 | `AUTH_SECRET` | (a) **genuine — rotate** (same value as `.env.local`) |
| 6 | generic-api-key | `.env.production.local` | 7 | `OPENROUTER_API_KEY` | (a) **genuine — rotate** (same value as `.env.local`) |
| 7 | jwt | `.env.production.local` | 29 | `VERCEL_OIDC_TOKEN` | (b) **false-positive-ish — auto-managed**. Vercel-issued OIDC token, scoped + short-lived (43k seconds); regenerated on each `vercel env pull`. No action needed. |
| 8 | generic-api-key | `.vercel/.env.production.local` | 2 | `AUTH_SECRET` | duplicate of #5 (same Vercel pull, second copy) |
| 9 | generic-api-key | `.vercel/.env.production.local` | 7 | `OPENROUTER_API_KEY` | duplicate of #6 |
| 10 | jwt | `.vercel/.env.production.local` | 30 | `VERCEL_OIDC_TOKEN` | duplicate of #7 |

Additional plaintext credentials in the same files that gitleaks did not
flag but which still touch real services and are therefore in scope:

| # | File | Variable | Classification |
|---|------|----------|----------------|
| 11 | `.env.local` + `.env.production.local` | `DATABASE_URL` (Neon `npg_…` password) | (a) **genuine — rotate** |
| 12 | `.env.local` + `.env.production.local` | `OPERATOR_PASSWORD` (`demo1234`) | (a) **genuine — rotate** (also: pick something stronger than `demo1234`) |
| 13 | `.env.local` + `.env.production.local` | `RESEND_API_KEY` | empty in both files — no rotation needed, but should be set fresh whenever Resend is wired up |

## Defence-in-depth summary

- `.gitignore` already blocks `.env*` (except `.env.example`) and `.vercel/`.
  Verified end-to-end (`git ls-files | grep env` returns only `.env.example`).
- `scripts/seed.personal.ts` added to `.gitignore` (`scripts/*.personal.ts`)
  so the Danish/personal demo data stays out of the public repo.
- No further `.gitignore` changes required — the existing rules covered
  every file that contained a real credential.

## Recommended cadence after flip

- Re-run `gitleaks detect --log-opts="--all"` before each release.
- Pre-commit hook (`gitleaks protect --staged`) is the next defence layer
  and worth wiring up post-flip; out of scope for this step.
