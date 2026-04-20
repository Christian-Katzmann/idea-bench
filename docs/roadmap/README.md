# ModelArena Roadmap — Focused Plans

This directory contains detailed implementation plans for the three features
that define ModelArena's next phase. Each plan is self-contained — a future
session can open any one and pick up the work cold.

## Vision

**Configurable Human Evaluation for AI Products.** ModelArena is the eval
platform built for the people whose job is judging AI output — PMs, content
leads, support ops, CX teams — not the engineers who wire it up. Whatever the
question is, the operator picks the evaluation instrument that answers it,
and chooses who (or what) answers: real humans, simulated personas, or both.

**Buyer.** VP Product, Head of Content, Head of AI (product side — not AI
platform teams).

**Positioning axis.** Two differentiators that other eval tools don't have:
the mode library (every competitor imposes one UX on every question) and
persona-based simulated panels (LLM as your target audience, not LLM as
judge).

## Plans

1. [**01-multi-mode-evaluation.md**](./01-multi-mode-evaluation.md) — Prompts
   get a per-prompt evaluation mode. Modes: Tournament (existing), Slider,
   Approve/Reject, Best-of-N, Multi-Axis, Qualitative. Last-used mode is the
   default for the next prompt added. The platform foundation.

2. [**02-simulated-runs.md**](./02-simulated-runs.md) — Run a campaign
   without humans (or before humans, to iterate fast). Generic calibrated
   panels + persona panels. Personas are a first-class library: starter set
   + custom + duplicate-and-edit. The wedge feature.

3. [**03-prompt-collections-and-duplication.md**](./03-prompt-collections-and-duplication.md) —
   Reuse infrastructure. Collections of curated prompts with folders + tags;
   campaign duplication as a first-class action. The stickiness feature.

## Sequencing

Implementation order as of 2026-04-20:

| When | What |
|---|---|
| M1 | Multi-tenancy foundation (prereq for all three) + Campaign Duplication (rides along — Plan 3 Phase 1) |
| M2 | Multi-mode Phase 1: Slider + Approve/Reject (Plan 1) |
| M3 | Multi-mode Phase 2: Best-of-N + Multi-Axis + Qualitative (Plan 1) |
| M4 | Simulated Runs Phase 1: Generic panels (Plan 2) |
| M5 | Simulated Runs Phase 2: Persona panels + library (Plan 2) + Prompt Collections (Plan 3 Phase 2) |
| M6 | Polish, calibration pipeline, in-app reports (deferred) |

Multi-tenancy is the gate — do not start feature work until orgs + members +
API keys ship cleanly. Plan for ~5–6 weeks on that refactor; the
single-operator assumption is load-bearing in auth, cookies, and schema.

## Dropped from scope

The following features were considered and explicitly dropped or deferred.
Referenced here so a future session doesn't re-litigate:

- **Regression Watch** — dropped.
- **Intelligent Router** — different product shape (hosting production LLM
  traffic). Not a fit for Vision A.
- **Structured Test Cases** — good idea, deferred beyond 6 months.
- **Comparative Analysis Reports** — deferred beyond 6 months (valuable but
  not among the top 3).
- **Audience Management** (domain restriction, invitations, segments) —
  useful but cut to stay focused on the top 3.
- **Cohort Arenas** — deferred; depends on Audience Management.
- **Calibration loop (simulated vs real cohort voting)** — future
  enhancement on top of Plan 2 once Audience Management ships.
