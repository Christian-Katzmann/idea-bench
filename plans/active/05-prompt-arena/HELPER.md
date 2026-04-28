# Helper — Plan 05

Project-specific reference. Mirrors Plan 04's helper.

---

## Quick References

| Document | Path |
|---|---|
| Canonical spec | `docs/roadmap/05-prompt-arena.md` |
| Plan summary | `plans/active/05-prompt-arena/what_and_why.md` |
| Foundation plan | `plans/active/04-arena-modes-foundation/` |
| Batch files | `plans/active/05-prompt-arena/batches/` |
| Glossary | `plans/active/05-prompt-arena/glossary.md` |

---

## Stack

- **Runtime:** Node 20+ (Vercel Functions)
- **Frontend:** Vite SPA + React + TypeScript + TipTap rich text
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
1. `npm run dev`, sign in as operator.
2. `/create` → Step 0 → choose Prompt arena.
3. Add 2 inputs + 3 variants (with `{{input}}` token).
4. Pick pinned model. Optional: expand Advanced → set `pinnedSystemPrompt`.
5. Generate → outputs render per (variant × input).
6. Activate → vote at `/vote/<slug>` → confirm Best-of-N voter UI.
7. Dashboard → confirm per-input drilldown + variant text panel.

---

## MCP Tools

- `mcp__plugin_engineering_github__*` — GitHub PR/issue ops
- `mcp__Claude_Preview__*` — preview server + browser inspection

---

## Common Gotchas

| Issue | Solution |
|---|---|
| API rejects `kind='prompt'` payload | Phase 0 hasn't widened `ALLOWED_KINDS` yet — that's the first batch. |
| `{{input}}` not substituted | The token must be the literal `{{input}}` (no whitespace, no alternates). Helper documented in `src/server/lib/render-template.ts`. |
| Voter sees variant names | Bug — names are operator-only. Check the voting interface excludes `display_name` from the voter payload. |
| Best-of-N handler missing | Plan 01 dependency. If Best-of-N isn't shipped, Plan 05 blocks until it is — or temporarily defaults to Tournament. |
