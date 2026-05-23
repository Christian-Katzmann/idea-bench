# Plan 04 — Arena Modes Foundation

**Status:** Active
**Created:** 2026-04-28
**Owner:** Christian
**Source PRD:** [`docs/roadmap/04-arena-modes-foundation.md`](../../../docs/roadmap/04-arena-modes-foundation.md) — canonical spec; this scaffold is a sequencing layer over it.

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

Plan 04 ships nothing user-facing on its own — it unblocks Plans 05 and 06.
Per the roadmap, Plan 04 + Plan 05 ship as one coordinated release; Plan 06
ships afterward. Phase 1's API validation explicitly rejects
`kind ∈ {prompt, system_prompt}` until the dependent plans flip their
feature flags.

---

## Phase Overview

| Phase | Purpose | Status |
|---|---|---|
| [Phase 0](./batches/phase-0/) | Schema migration + Drizzle types | Pending |
| [Phase 1](./batches/phase-1/) | Per-kind API validation + generation routing | Pending |
| [Phase 2](./batches/phase-2/) | Creation UX kind selector + label/export switching | Pending |
| [Tests](./batches/tests/) | Cross-phase test coverage | Pending |

---

## Quick Commands

```bash
cd modelarena
npm run lint           # tsc --noEmit
npm run build
npm run db:generate    # diff schema → SQL migration
npm run db:migrate     # apply migrations
npm run dev
```
