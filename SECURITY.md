# Security Policy

## Reporting a vulnerability

Please report security issues privately — do **not** open a public GitHub
issue.

Preferred channel:

- **GitHub Security Advisories** — use the
  [Report a vulnerability](https://github.com/Christian-Katzmann/modelarena/security/advisories/new)
  button on the repo's Security tab. This creates a private thread visible
  only to maintainers.

Fallback:

- **Email** — `christian@katzmann.dk` with subject line starting
  `[modelarena security]`. Plaintext is fine; if you want encryption, ask
  for a PGP key in the first message.

Please include:

- A description of the issue and the impact you believe it has.
- Steps to reproduce (URL, payload, sequence of actions).
- Affected version or commit SHA if you can pin it down.
- Whether the issue has been disclosed anywhere else.

You'll get an acknowledgement within a few days. ModelArena is maintained
in spare time, so timelines are best-effort rather than SLA-bound — but
real vulnerabilities are taken seriously and not ignored.

## In scope

The following surfaces of a deployed ModelArena instance:

- The operator authentication flow (password, GitHub OAuth, email magic
  link, the `operator_session` HMAC cookie).
- The AI-spend gate (`AI_ALLOWED_IDENTITIES`, `withAIOperator`,
  the OpenRouter-calling endpoints).
- The participant cookie HMAC used for vote deduplication and identity.
- The campaign / vote / leaderboard API endpoints under `/api/`.
- The Vercel Functions and any code reachable from `api/` or `src/server/`.
- Any data exfiltration path that leaks model identity through the blind
  voting UI before a vote is cast (the product's structural promise is
  that voters cannot see which model produced which response — issues
  that break this promise are in scope as security bugs, not just UX
  bugs).

## Out of scope

- Demo / seed data, including the personas, prompts, and slugs created
  by `npm run db:seed`. The seed script is destructive on purpose and
  refuses to run in `NODE_ENV=production` without an explicit override.
- Reports against `npm run dev` or any other local-only path that is not
  reachable on a deployed instance.
- Self-XSS or social-engineering reports where the operator can already
  spend AI credit.
- Rate-limit bypasses on endpoints that are already gated by the
  operator session (the AI-spend gate is the security boundary; the
  rate limit is a cost guard, not an auth boundary).
- Generic best-practice findings ("HSTS preload not enabled", "X-Frame-
  Options missing on a route that returns JSON", etc.) without a
  demonstrated exploit path.
- Dependency CVE advisories where the vulnerable code path is not
  reachable in this codebase. A patch PR is welcome regardless.

## Disclosure

Once a fix is shipped, you're welcome to publish your findings. If you'd
like coordinated disclosure or attribution in the release notes, mention
that in your initial report.
