# Phase 2 Context

Compressed context for AI agents working on Phase 2.

---

## What We're Building (This Phase)

The dashboard layer. Two batches: a new heatmap component (the only
genuinely new UI primitive in the trio of plans), then a polish pass
(CI badge, variant text side panel, persona-aware results, per-kind
export switch).

---

## Key Decisions (PRD-resolved)

- Default leaderboard view = across-suite rollup. Heatmap = toggle.
- Heatmap cells show scores per (variant, suite-prompt). Cell colors
  encode score via a discrete palette (not a gradient — easier to read
  for non-technical operators).
- "based on N test prompts" badge replaces an upper-bound warning;
  trust CIs in the data, not toasts.
- Persona-aware results panel reads from existing rating rows keyed
  on `(source='simulated', personaId=X)` from Plan 02.

---

## Dependencies from Earlier Phases

- Phase 0: API gate + drift review.
- Phase 1: create flow + persona card + cost preview shipping.
- Plan 04 Phase 2: kind pill + per-kind export switch wiring.

---

## File Patterns

| Pattern | Purpose |
|---|---|
| `src/components/heatmap/*` | New heatmap component (Phase 2-A) |
| `src/pages/CampaignDashboard.tsx` | Leaderboard host |
| `src/server/campaigns/detail.ts` | Per-kind dashboard payload |
| `src/server/campaigns/export.ts`, `export-xlsx.ts` | Export labels |

---

## Constraints

- Only modify files listed in batch files.
- The heatmap is the "one genuinely new component in the trio"
  (per the sizing estimate). Treat it as such — give it real design
  attention; don't ship a generic data-table.
- Use the existing shadcn/ui primitives + Tailwind tokens. Don't pull
  a heatmap library unless the requirements clearly outstrip what we
  can build in a few hundred lines.

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run
npm run dev
```

---

## Quick Reference

- **Canonical spec:** `docs/roadmap/06-system-prompt-arena.md`
- **Phase README:** `batches/phase-2/README.md`
- **Helper:** `HELPER.md`
