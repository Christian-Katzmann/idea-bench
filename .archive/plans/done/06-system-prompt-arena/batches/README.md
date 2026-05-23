# Batch Execution Guide

This folder contains phase-based task batches for structured implementation.

---

## Phase Order

Execute phases sequentially:

```
Phase 0 (Foundation)
    ↓
Phase 1 (Core Implementation)
    ↓
Phase 2 (Polish & Hardening)

Tests → Run after corresponding implementation batches
```

---

## Naming Convention

Batch files follow: `P{phase}-{letter}-{description}.md`

| Component        | Meaning                     | Example           |
| ---------------- | --------------------------- | ----------------- |
| `P0`, `P1`, `P2` | Phase number                | `P1` = Phase 1    |
| `A-Z`            | Batch sequence within phase | `A` = first batch |
| `description`    | Kebab-case task name        | `schema-parity`   |

**Full example:** `P1-A-schema-parity.md` = Phase 1, Batch A, Schema Parity

---

## How to Execute a Batch

1. **Read the phase README** — Understand scope boundaries
2. **Read the batch file** — Get specific tasks and file paths
3. **Complete all tasks** — Each checkbox is one unit of work
4. **Run verification** — Use the verify command from HELPER.md
5. **Mark progress** — Check off tasks in the batch file with `[x]`

---

## Between Phases

Before starting a new phase:

- [ ] All batches in previous phase complete
- [ ] Project verify command passes (typecheck, lint, tests)
- [ ] Phase exit criteria met (see phase README)

---

## Rules

### DO

- Read batch file completely before starting
- Complete all tasks before moving to next batch
- Run tests after each batch
- Reference what_and_why.md (Part 2) for decisions
- Mark tasks complete with `[x]` as you go

### DO NOT

- Skip phases or execute out of order
- Modify files outside batch scope
- Make decisions not in the plan
- Leave tasks partially complete

---

## Progress Tracking

Each batch file uses checkboxes:

```markdown
- [ ] **P0-1**: Pending task
- [x] **P0-2**: Completed task
```

Phase progress is tracked in the phase README.

---

## Quick Reference

| Phase                 | Purpose             | Status  |
| --------------------- | ------------------- | ------- |
| [phase-0](./phase-0/) | Pre-implementation review & feature-flag flip          | Done |
| [phase-1](./phase-1/) | Suite, variants, persona card, cost preview | Done |
| [phase-2](./phase-2/) | Heatmap leaderboard & polish  | Done |
| [tests](./tests/)     | Test Coverage       | Done |
