# Helper — Plan 06

Project-specific reference. Mirrors Plan 04/05 helpers.

---

## Quick References

| Document | Path |
|---|---|
| Canonical spec | `docs/roadmap/06-system-prompt-arena.md` |
| Plan summary | `plans/active/06-system-prompt-arena/what_and_why.md` |
| Foundation plan | `plans/active/04-arena-modes-foundation/` |
| Sibling plan | `plans/active/05-prompt-arena/` |
| Personas spec | `docs/roadmap/02-simulated-runs.md` |
| Batch files | `plans/active/06-system-prompt-arena/batches/` |
| Glossary | `plans/active/06-system-prompt-arena/glossary.md` |

---

## Stack

- **Runtime:** Node 20+ (Vercel Functions)
- **Frontend:** Vite SPA + React + TypeScript
- **API:** File-based handlers under `api/`
- **Database:** Neon Postgres + Drizzle ORM
- **Package manager:** npm
- **Hosting:** Vercel

---

## Common Commands

```bash
cd modelarena
npm run lint
npm run build
npx vitest run
npm run dev               # http://localhost:3000
```

---

## Manual Testing

After Phase 1 lands, smoke flow:
1. `npm run dev`, sign in as operator with AI access.
2. `/create` → Step 0 → choose System-prompt arena.
3. Add 5 suite prompts.
4. Add 3 system-prompt variants.
5. Pick pinned model.
6. Confirm persona suggestion card shows pre-filtered personas; pick 2.
7. Cost preview appears with estimate; confirm if over $5.
8. Generate → activate → vote at `/vote/<slug>` (Slider mode).
9. Dashboard → confirm heatmap drilldown + across-suite rollup.

---

## MCP Tools

- `mcp__plugin_engineering_github__*` — GitHub PR/issue ops
- `mcp__Claude_Preview__*` — preview server + browser inspection

---

## Common Gotchas

| Issue | Solution |
|---|---|
| API rejects `kind='system_prompt'` | Phase 0 hasn't widened `ALLOWED_KINDS` yet. |
| Persona panel doesn't appear in creation | Plan 02 must be live; check `personas` table is seeded with the starter library. |
| Cost preview shows $0 | The cost helper in `src/server/simulated-runs/cost.ts` may need a per-kind branch — verify in Phase 1. |
| Heatmap component renders empty | The heatmap pulls from per-(variant, suite-prompt) rating rows; confirm ratings are computed for non-tournament modes (Plan 01). |
