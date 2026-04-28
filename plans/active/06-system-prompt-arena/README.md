# Plan 06 — System-Prompt Arena

**Status:** Active
**Created:** 2026-04-28
**Owner:** Christian
**Source PRD:** [`docs/roadmap/06-system-prompt-arena.md`](../../../docs/roadmap/06-system-prompt-arena.md) — canonical spec.
**Depends on:** Plan 04 (foundation), Plan 01 (Slider mode), Plan 02 (Simulated Runs + personas).

---

## ⚠ Read Before Starting Phase 0

This plan was scaffolded **at the same time** as Plans 04 and 05 — but
ships **after** them. Real-world drift between scaffold time and start
time is likely. Before writing any code, read [P0-A](./batches/phase-0/P0-A-pre-implementation-review.md)
in full. It mandates re-reading the PRD and verifying that registry
state, multi-mode handler availability, persona library shape, and
simulated-runs API surface still match what this scaffold assumes.
**Flag drift before working around it.**

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

## Phase Overview

| Phase | Purpose | Status |
|---|---|---|
| [Phase 0](./batches/phase-0/) | Pre-implementation review + feature-flag flip | Pending |
| [Phase 1](./batches/phase-1/) | Suite step + variants + persona suggestion + cost preview | Pending |
| [Phase 2](./batches/phase-2/) | Heatmap leaderboard + polish | Pending |
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
