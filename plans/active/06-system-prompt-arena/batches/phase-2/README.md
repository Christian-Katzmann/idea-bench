# Phase 2 — Heatmap Leaderboard & Polish

**Status:** Pending

---

## Purpose

Build the heatmap leaderboard component and the polish layer (CI badge,
variant text side panel, persona-aware results panel, per-kind export
columns).

---

## Scope

**This phase DOES:**

- New heatmap component for per-(variant, suite-prompt) scores.
- Across-suite rollup as the default view; heatmap is one click away.
- "based on N test prompts" badge with CI tooltip on each variant row.
- Variant text side panel (collapsed by default, click to expand).
- Persona-aware results panel using Plan 02's "By persona" rating cut.
- Per-kind export column header switch ("Model" → "System Prompt
  Variant").

**This phase does NOT:**

- Build LLM-suggested variant rewriting.
- Build Multi-Axis with auto-suggested dimensions.

---

## Entry Criteria

- [ ] Phase 1 complete; operators can run system-prompt arenas
- [ ] Plan 04 Phase 2 complete (per-kind export switch wiring)

---

## Exit Criteria

- [ ] All P2 batches marked complete
- [ ] Heatmap renders per-(variant, suite-prompt) cells with cell
      tooltips
- [ ] Across-suite rollup is default; heatmap is the toggle
- [ ] CI badge renders on each variant row
- [ ] Variant text side panel works (collapse/expand)
- [ ] Persona-aware results panel renders when a persona panel ran
- [ ] Per-kind export columns switched to "System Prompt Variant"
- [ ] `npm run lint && npm run build && npx vitest run` passes

---

## Batches

| Batch | File | Description | Status |
|---|---|---|---|
| P2-A | [P2-A-heatmap.md](./P2-A-heatmap.md) | Heatmap component + per-kind dashboard payload | Pending |
| P2-B | [P2-B-polish.md](./P2-B-polish.md) | CI badge, variant text panel, persona-aware results, exports | Pending |

---

## Reference

- PRD: `docs/roadmap/06-system-prompt-arena.md` →
  "Leaderboard" / "Risks"
