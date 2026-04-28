# Helper — Plan 04

Project-specific reference. Keep minimal.

---

## Quick References

| Document | Path |
|---|---|
| Canonical spec | `docs/roadmap/04-arena-modes-foundation.md` |
| Plan summary | `plans/active/04-arena-modes-foundation/what_and_why.md` |
| Batch files | `plans/active/04-arena-modes-foundation/batches/` |
| Glossary | `plans/active/04-arena-modes-foundation/glossary.md` |
| Schema | `src/server/db/schema.ts` |
| Migrations | `drizzle/` |
| Server boundary docs | `src/server/README.md` |

---

## Stack

- **Runtime:** Node 20+ (Vercel Functions, Fluid Compute runtime)
- **Frontend:** Vite SPA + React + TypeScript
- **API:** File-based handlers under `api/` (Web `Request`/`Response`)
- **Database:** Neon Postgres via `@neondatabase/serverless`
- **ORM:** Drizzle
- **Auth:** Operator (password / GitHub OAuth / magic link), participant cookie
- **Package manager:** npm
- **Hosting:** Vercel

---

## Common Commands

```bash
cd modelarena

# Verify (run after every batch)
npm run lint              # tsc --noEmit
npm run build

# Tests
npx vitest run            # Vitest test runner

# Database
npm run db:generate       # diff schema → migration SQL
npm run db:migrate        # apply migrations to DATABASE_URL
npm run db:studio         # Drizzle Studio

# Dev
npm run dev               # Vite + custom api plugin (see src/server/vite-api-plugin.ts)
```

---

## Manual Testing

Local: `npm run dev` brings up Vite at `http://localhost:3000` with the
custom api plugin serving `api/**.ts` as Vercel Functions.

Voter URL flow: create a draft campaign via the operator UI, generate,
activate, then visit `/vote/<slug>`.

---

## MCP Tools

- `mcp__plugin_engineering_github__*` — GitHub PR / issue ops
- `mcp__Claude_Preview__*` — preview server + browser inspection (see CLAUDE.md guidance)

---

## Common Gotchas

| Issue | Solution |
|---|---|
| `neon-http` driver doesn't support multi-statement transactions | Insert sequentially; orphan rows acceptable for draft campaigns. Documented in `api/campaigns/index.ts`. |
| Boundary violation: importing from `src/server/**` into `src/pages/**` | Don't. Server-only code, keep the boundary clean. See `src/server/README.md`. |
| Migration naming collision | Check the latest in `drizzle/` and use the next number (currently `0011_pale_zeigeist.sql`; this plan adds `0012_arena_modes_foundation.sql`). |
| `vercel dev` doesn't run | Use `npm run dev` (project ships a custom Vite plugin that mirrors enough of `vercel dev`). See `src/server/README.md` "Why `vite-api-plugin.ts` exists." |
