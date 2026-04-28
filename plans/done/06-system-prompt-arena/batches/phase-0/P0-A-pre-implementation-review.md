# P0-A: Pre-Implementation Review

> **Before you implement anything — read this batch in full. Then re-read
> the canonical PRD critically. Then verify assumptions. Only then write
> code.**
>
> This plan was scaffolded **before Plans 04 and 05 shipped**. Real-world
> drift between scaffold time and your start time is likely. The point
> of this batch is to surface that drift *before* it produces wrong
> implementations.
>
> If something doesn't match, **flag it and stop**. Escalate to the user
> before silently working around it. Drift is information.

---

## Step 1 — Re-read the PRD

- [x] **P0-1**: Read the canonical PRD in full.
      File: `docs/roadmap/06-system-prompt-arena.md`
      Action: Read it cover to cover, not skimming. Pay particular attention to the "Resolved decisions" block and the "User-Facing Behavior" section. Note anything that surprises you compared to your prior expectations.

- [x] **P0-2**: Read the Plan 04 PRD.
      File: `docs/roadmap/04-arena-modes-foundation.md`
      Action: Confirm you understand which schema fields the foundation provides for system-prompt arenas. Specifically: `campaigns.kind`, `campaigns.pinned_provider_model_id`, `campaigns.pinned_model_snapshot`, `campaign_models.kind`, `campaign_models.variant_text`.

- [x] **P0-3**: Skim the Plan 05 PRD + scaffold.
      File: `docs/roadmap/05-prompt-arena.md`, `plans/active/05-prompt-arena/`
      Action: Plan 05 ships before Plan 06. The way Plan 05 wired up the variants step, Best-of-N default, and per-input drilldown is a useful pattern to mirror. Note anything that turned out differently than the original 05 scaffold suggested.

---

## Step 2 — Verify foundation assumptions

For each of the items below, verify against the actual repo state at
the time you read this batch. Mark `[x]` when verified, write a "Drift
Note" if something has moved.

### Schema (Plan 04)

- [x] **P0-4**: Confirm `campaigns.kind` enum exists with values
      `model | prompt | system_prompt`.
      File: `src/server/db/schema.ts`
      Verify: enum exported as `campaignKindEnum`; type exported as `CampaignKind`.
      ✓ `campaignKindEnum` declared at schema.ts:68 with all three values; `CampaignKind` type exported at schema.ts:1199.

- [x] **P0-5**: Confirm `campaigns.pinned_provider_model_id`,
      `campaigns.pinned_model_snapshot`, and (if needed)
      `campaigns.pinned_system_prompt` columns exist.
      File: `src/server/db/schema.ts`
      Verify: types match what the PRD assumes.
      ✓ All three columns present (schema.ts:213, 220, 229) with correct types (text, jsonb<PinnedModelSnapshot>, text). CHECK constraints at schema.ts:258–266 enforce per-kind nullability.

- [x] **P0-6**: Confirm `campaign_models` is polymorphic.
      File: `src/server/db/schema.ts`
      Verify: `kind` column, `variant_text` column, nullable `provider_model_id`, CHECK constraints.
      ✓ `kind` (schema.ts:382), `variant_text` (schema.ts:392), nullable `providerModelId` (schema.ts:370), CHECK constraints at schema.ts:404–408.

### Routing (Plan 04)

- [x] **P0-7**: Confirm per-kind generation assembly exists.
      File: `src/server/routes/campaigns/generate.ts`
      Verify: `assembleCall` (or equivalent) switches on `campaign.kind` and routes `system_prompt` correctly — system message = `contestant.variantText`, user message = `testCase.text`.
      ✓ `assembleCall` at generate.ts:363; `system_prompt` branch at generate.ts:394–400 maps `context ← contestant.variantText`, `prompt ← testCase.text`, `providerModelId ← campaign.pinnedProviderModelId`. Matches PRD exactly.

- [x] **P0-8**: Confirm `ALLOWED_KINDS` exists and currently allows
      `model` and `prompt` but not `system_prompt`.
      File: `api/campaigns/index.ts`
      ✓ `ALLOWED_KINDS = new Set<schema.CampaignKind>(['model', 'prompt'])` at api/campaigns/index.ts:17. Plan 05 has flipped its flag; `system_prompt` is the only remaining value not yet allowed.

### Multi-mode (Plan 01)

- [x] **P0-9**: Confirm Slider mode handler is live.
      Files: voter UI route, `src/server/db/schema.ts` (`sliderResponses`), submit handler.
      Verify: end-to-end Slider works on a model arena (regression check).
      ✓ `sliderResponses` table at schema.ts:620; `submit-slider.ts` handler exists at src/server/routes/vote/; wired into action router at api/vote/[slug]/[action].ts:17. Voter URL `/vote/<slug>` dispatches all six modes.

- [x] **P0-10**: Confirm Multi-Axis is live (used for the "suggest
      Multi-Axis" copy).
      Verify: `multiAxisResponses` table is being populated by the submit handler; voter UI renders multi-axis correctly.
      ✓ `multiAxisResponses` table at schema.ts:770; `submit-multi-axis.ts` handler exists; wired at api/vote/[slug]/[action].ts:20.

### Personas + Simulated Runs (Plan 02)

- [x] **P0-11**: Confirm `personas` table is seeded with starter
      personas.
      Verify: `SELECT count(*) FROM personas WHERE is_starter = true` returns > 0.
      ⚠ **DRIFT — see Drift Notes below.** No starter persona seeder code or migration exists in the repo. `scripts/seed.ts` does not insert into `personas`; no drizzle migration inserts `is_starter=true` rows; `grep -rn "isStarter:\s*true"` returns zero hits in `src/`, `scripts/`, `api/`. The schema and personas API treat starters as a first-class concept (the list endpoint supports `?starter=1` filtering at routes/personas/index.ts:35; deletes are blocked at routes/personas/index.ts:187), but the library itself was never seeded. Plan 02 Phase 2 was responsible for seeding the curated 15–20 starter personas (per HANDOFF-PLAN-02.md:73–75 and 120–121); no evidence that work shipped.

- [x] **P0-12**: Confirm persona shape matches scaffold assumptions.
      File: `src/server/db/schema.ts`
      Verify: `personas` has `tags text[]`, `categories` (or whatever the campaign uses) — this scaffold assumes tag-overlap is computable. If the persona's tag field has been renamed or restructured, the pre-filter helper logic in Phase 1 needs updating.
      ✓ `personas.tags text[] notNull default []` at schema.ts:1019; `campaigns.categories text[] notNull default []` at schema.ts:172. Tag-overlap pre-filter remains computable as scaffolded — no shape drift.

- [x] **P0-13**: Confirm `simulated_runs` API surface.
      Files: `api/simulated-runs/[...path].ts`, `src/server/simulated-runs/`
      Verify: launch endpoint exists, accepts `panelType`, `voterCount`, `personaIds`, `costCeilingUsd`. Cost-preview helper exists at `src/server/simulated-runs/cost.ts`.
      ✓ Catch-all dispatcher at api/simulated-runs/[...path].ts routes POST `/api/simulated-runs` to `createSimulatedRunWebHandler` (src/server/routes/simulated-runs/create.ts) which validates `panelType` ∈ {generic, persona}, integer `voterCount`, optional `personaIds`, optional `costCeilingUsd`. `previewSimulatedRunCostWebHandler` is mounted at `/api/simulated-runs/preview-cost`. Cost helper at `src/server/simulated-runs/cost.ts` exports `estimateRunCost`, `defaultCostCeiling`, `checkCostCeiling`.
      Ⓘ Note (not drift; already flagged in HELPER.md gotchas): `cost.ts` assumes ~800 input tokens per judge call; system-prompt arenas can have variants up to 16,000 chars (~4,000 tokens), so the cost helper will under-estimate for `kind='system_prompt'` until Phase 1 adds a per-kind branch. This is a Phase 1 task, not Phase 0 drift.

- [x] **P0-14**: Confirm `simulated_runs.modelMix` snapshot pattern.
      Verify: this is the model the PRD says system-prompt arenas should mirror for `pinned_model_snapshot`.
      ✓ `simulated_runs.modelMix jsonb` (schema.ts:1063) and `campaigns.pinnedModelSnapshot jsonb<PinnedModelSnapshot>` (schema.ts:220) are structurally analogous — a denormalized registry snapshot captured at launch time so subsequent registry edits can't retroactively rewrite a campaign's history. Pattern preserved.

---

## Step 3 — Document findings (Drift Notes)

> **REQUIRED:** Write a paragraph minimum even if "no drift found." If
> drift exists, write specifics: which file, which assumption, what
> changed, your judgment call about impact.

```
Drift Notes:

Reviewed on: 2026-04-28

Findings:
  - P0-4  (campaigns.kind enum)              : No drift. Enum values + type export match PRD.
  - P0-5  (campaigns pinned columns)         : No drift. All three columns present with correct types and CHECK constraints.
  - P0-6  (campaign_models polymorphism)     : No drift. kind + variant_text + nullable provider_model_id + per-kind CHECKs all in place.
  - P0-7  (per-kind generate assembly)       : No drift. assembleCall's system_prompt branch is exactly the shape the PRD prescribes.
  - P0-8  (ALLOWED_KINDS state)              : No drift. Currently ['model', 'prompt']; system_prompt is the only kind not yet allowed, as expected.
  - P0-9  (Slider mode live)                 : No drift. Schema, submit handler, and action-router wiring all in place.
  - P0-10 (Multi-Axis live)                  : No drift. Same as above for multi_axis.
  - P0-11 (starter personas seeded)          : DRIFT — no starter persona seeder anywhere in the repo. scripts/seed.ts does not insert personas; no migration inserts is_starter=true rows; no code path sets isStarter:true. Plan 02 Phase 2 was supposed to ship this curated library; that work has not landed in this codebase. Personas table itself is healthy and operator-creatable.
  - P0-12 (persona shape)                    : No drift. personas.tags text[] and campaigns.categories text[] both present; tag-overlap pre-filter is computable.
  - P0-13 (simulated_runs API surface)       : No drift. Launch endpoint accepts panelType/voterCount/personaIds/costCeilingUsd; preview-cost endpoint mounted; cost helper exports the expected functions.
       Note (not drift, already flagged in HELPER.md gotcha #3): cost.ts assumes ~800 input tokens/judge call; system_prompt variants can run ~4000 tokens; needs a per-kind branch in Phase 1.
  - P0-14 (modelMix snapshot pattern)        : No drift. campaigns.pinnedModelSnapshot mirrors simulated_runs.modelMix structurally — same denormalized-snapshot pattern.

  Cross-cutting verification:
  - Plan 04 lives in plans/done/ — foundation merged.
  - Plan 05 has 1 unchecked task (P2-7, manual end-to-end smoke); all code-level work is complete and ALLOWED_KINDS reflects it. Not blocking Plan 06 Phase 0.
  - Last drizzle migration is 0013_standalone_variants. No 0014+ exists, confirming Plan 06 has not started.

Impact assessment:
  - HIGH impact: NONE. Schema, routing, multi-mode handlers, and simulated-runs API all match the scaffold's assumptions exactly.
  - MEDIUM impact: P0-11 (starter personas not seeded). Does not block P0-B (the flag flip is purely API-level and does not depend on persona rows). Does affect Phase 1 P1-B (persona suggestion card): with no starter library, the pre-filtered persona picker has nothing to surface for first-time operators. The card mechanics will function — they will just be empty until operators create their own personas.
  - LOW impact: cost.ts under-estimating for system_prompt arenas (Phase 1 task; already documented in HELPER.md).

Note on Phase 0 README entry criteria:
  The README lists "Plan 02 (Simulated Runs + Personas) shipped, persona library seeded with starter personas" as an entry criterion. The seeded-library half of that line is not satisfied. Flagging here per the protocol — "Drift findings get escalated to the user before P0-B runs."

Recommended action:
  Two viable paths; flagging to user before proceeding to P0-B:

  (a) Continue with P0-B as scaffolded; defer the starter-library question to before Phase 1 P1-B (persona suggestion card). P0-B is purely API-level — flag flip + four small server tests — and is unaffected by the missing starter library. This keeps Phase 0 momentum and surfaces the persona-library decision when it actually matters (during P1-B).

  (b) Pause Phase 0 here; address the starter-library shortfall before any Phase 0 code. Either by shipping Plan 02 Phase 2's seeder, or by reducing scope (e.g., Plan 06 P1-B becomes "operator-built personas only", and a starter library is deferred to a later cycle).

  My recommendation is (a). The drift is real but does not change Phase 0's correctness; the entry criterion is materially "the persona library shape is stable" (it is) plus "starters exist" (they do not). Plan 06 P1-B can degrade gracefully — render an empty-state with a "Create your first persona" CTA — and the wedge value is preserved as soon as operators populate their library. Shipping a full starter library is a substantial editorial effort (per HANDOFF-PLAN-02.md: "a day per persona reviewed by someone with domain knowledge") that should not block this plan's API gating.
```

If any drift is HIGH impact (e.g., persona schema renamed, simulated-runs
launch endpoint signature changed, Slider not yet live), **stop here and
escalate to the user**. Do not proceed to P0-B silently.

---

## Step 4 — Sign off

- [x] **P0-15**: Drift Notes filled in (above).
- [x] **P0-16**: If drift was found, user has acknowledged and given
      a directive (continue / adjust / pause).
      User chose option (a) on 2026-04-28: continue with P0-B as scaffolded; defer the starter-library question to before P1-B (graceful empty-state in the persona suggestion card).
- [x] **P0-17**: Mark this batch complete. Phase 0 README's exit
      criteria allow P0-B to start.

---

## Verification

No code changes in this batch. Verification is the discipline of the
review itself. The "test" is whether your Drift Notes are honest and
specific.
