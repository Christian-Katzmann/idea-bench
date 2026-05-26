# Changelog

## v0.1.0 — public alpha

Initial public alpha for self-hosted blind LLM evaluation.

What is real in this release:

- Single-operator campaign flow: create, generate or paste outputs, activate, vote, and inspect results.
- Blind voting surface: voters compare `A` and `B` without model, prompt, or contestant identity exposed before reveal.
- Three contestant shapes: model arenas, system-prompt arenas, and prompt-variant arenas in the same voting/rating engine.
- Bradley-Terry ratings with confidence intervals, sample counts, stability language, and group-alignment views.
- Simulated persona runs through OpenRouter, gated separately from login by `AI_ALLOWED_IDENTITIES`.
- Self-hosted Postgres setup with Drizzle migrations, seed data, operator auth, exports, CI, and local verification.

What remains intentionally out of scope:

- Hosted SaaS operations.
- Team workspaces, billing, RBAC, and shared-team governance.
- Public benchmark leaderboard behavior.
- Treating simulated persona votes as human preference evidence.

Public trust artifacts added for this release:

- Product screenshots and social preview under `design/`.
- A 30-second local trailer under `design/trailer/`.
- `REPRODUCE.md` for the deterministic rating proof.
- `docs/failure-modes.md` for the ways evaluation evidence can mislead.
