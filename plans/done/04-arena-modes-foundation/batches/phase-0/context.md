# Phase 0 Context

Compressed context for AI agents working on Phase 0.

---

## What We're Building (This Phase)

A single Drizzle migration plus matching schema-type updates that
introduce the `campaign_kind` enum and the polymorphic-contestant
columns, with a backfill of the pinned-model snapshot for existing
campaigns. No handlers, no UI.

---

## Key Decisions (PRD-resolved)

- `campaign_models` is **not renamed**. Misnomer documented in the
  schema header.
- `campaign_model_id` FK columns on `generations`, response tables, and
  `ratings` are **not renamed**.
- Snapshot the pinned model at launch via `pinned_model_snapshot` jsonb
  on `campaigns`. Backfilled onto existing model-arena rows.
- `pinned_system_prompt` is a campaign-level held-constant system
  message used by Plan 05 prompt arenas. Optional, nullable.

---

## Terms Used

| Term | Definition |
|---|---|
| Arena kind | `model | prompt | system_prompt` enum on `campaigns.kind`. |
| Snapshot | Frozen registry state captured at launch. |

See `glossary.md` for the full set.

---

## File Patterns

| Pattern | Purpose |
|---|---|
| `src/server/db/schema.ts` | Authoritative schema + types |
| `drizzle/*.sql` | Generated migrations (commit alongside schema edits) |

---

## Constraints

- Only modify files listed in batch files.
- Migration must be backward compatible — no downtime, no data loss.
- Existing campaigns default to `kind='model'`; CHECK constraints must
  not reject them.
- The neon-http driver doesn't support multi-statement transactions —
  consider this for the backfill step (run as a single SQL statement).

---

## Verification

```bash
cd modelarena
npm run db:generate    # confirm only expected diff
npm run db:migrate     # apply
npm run lint           # types compile
```

---

## Quick Reference

- **Canonical spec:** `docs/roadmap/04-arena-modes-foundation.md`
- **Phase README:** `batches/phase-0/README.md`
- **Helper:** `HELPER.md`
- **Schema today:** `src/server/db/schema.ts`
