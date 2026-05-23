# Phase 0 Context

Compressed context for AI agents working on Phase 0.

---

## What We're Building (This Phase)

A review pass and a feature-flag flip. The first batch (P0-A) is a
structured drift check — re-read the PRD, verify the world hasn't
changed under the scaffold, document findings, escalate if needed.
The second batch (P0-B) is a small flag flip and an API smoke test.

This phase ships nothing user-visible.

---

## Why This Phase Exists

Plan 06 was scaffolded **before Plans 04 and 05 shipped**. The
scaffold's assumptions are point-in-time. By the time you reach this
phase, weeks or months have passed; the registry has changed, handlers
may have moved, persona library shape may have evolved.

Drift is information. Silently routing around it produces wrong
implementations and bug reports months later. Phase 0 surfaces drift
before code gets written.

---

## Key Decisions (PRD-resolved)

- Single pinned model in V1.
- No templating (variant = system message verbatim).
- Default mode: Slider.
- Persona panel default: ON; voter count 10; pre-filtered by category
  tag overlap; operator selects explicitly.
- Cost preview is mandatory at launch; soft-threshold confirmation
  above $5; existing `costCeilingUsd` enforces hard stop.
- Suite minimum: 3 prompts (hard block).

---

## Dependencies

- Plan 04: schema + routing + creation step 0
- Plan 05: shipped (sibling kind; useful patterns to mirror)
- Plan 01: Slider + Multi-Axis modes
- Plan 02: personas + simulated runs + cost machinery

---

## File Patterns

| Pattern | Purpose |
|---|---|
| `docs/roadmap/06-system-prompt-arena.md` | The canonical PRD |
| `api/campaigns/index.ts` | Feature flag |
| `src/server/__tests__/*.test.ts` | API smoke verification |

---

## Constraints

- Only modify files listed in batch files.
- Do not skip P0-A even if "obviously fine" — document the review
  pass with a paragraph minimum, including any verifications you ran.
- Drift findings get escalated to the user before P0-B runs.

---

## Verification

```bash
cd modelarena
npm run lint
npx vitest run
```

---

## Quick Reference

- **Canonical spec:** `docs/roadmap/06-system-prompt-arena.md`
- **Phase README:** `batches/phase-0/README.md`
- **Helper:** `HELPER.md`
