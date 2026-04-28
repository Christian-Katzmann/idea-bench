# Plan 05 — Prompt Arena

**Status:** Active
**Created:** 2026-04-28
**Owner:** Christian
**Source PRD:** [`docs/roadmap/05-prompt-arena.md`](../../../docs/roadmap/05-prompt-arena.md) — canonical spec.
**Depends on:** Plan 04 (Arena Modes Foundation) shipped, Plan 01 multi-mode handlers (Best-of-N, Slider) live.

---

## Quick Navigation

| Document | Purpose |
|---|---|
| [what_and_why.md](./what_and_why.md) | Lean summary; canonical spec is the PRD |
| [glossary.md](./glossary.md) | Plan-specific terminology |
| [HELPER.md](./HELPER.md) | Stack, commands, MCP tools |
| [PROMPT_CODER.md](./PROMPT_CODER.md) | AI coder session prompt |
| [PROMPT_REVIEWER.md](./PROMPT_REVIEWER.md) | AI reviewer session prompt |
| [batches/](./batches/) | Phase folders with task files |

---

## Coordination

Plan 05 ships alongside Plan 04 as one coordinated release. Phase 0
flips the API feature flag added in Plan 04 to allow `kind='prompt'`.
Plans 04 and 05 are gating dependencies for each other in practice —
Plan 04 ungates the schema; Plan 05 ungates the user surface.

---

## Phase Overview

| Phase | Purpose | Status |
|---|---|---|
| [Phase 0](./batches/phase-0/) | Feature-flag flip + verify foundation | Pending |
| [Phase 1](./batches/phase-1/) | Variants creation step + per-input drilldown | Pending |
| [Phase 2](./batches/phase-2/) | Polish: validation, exports, simulated-runs verification | Pending |
| [Tests](./batches/tests/) | Cross-phase test coverage | Pending |

---

## Quick Commands

```bash
cd modelarena
npm run lint
npm run build
npx vitest run
npm run dev
```
