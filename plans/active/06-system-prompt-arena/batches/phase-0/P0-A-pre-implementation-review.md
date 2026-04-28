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

- [ ] **P0-1**: Read the canonical PRD in full.
      File: `docs/roadmap/06-system-prompt-arena.md`
      Action: Read it cover to cover, not skimming. Pay particular attention to the "Resolved decisions" block and the "User-Facing Behavior" section. Note anything that surprises you compared to your prior expectations.

- [ ] **P0-2**: Read the Plan 04 PRD.
      File: `docs/roadmap/04-arena-modes-foundation.md`
      Action: Confirm you understand which schema fields the foundation provides for system-prompt arenas. Specifically: `campaigns.kind`, `campaigns.pinned_provider_model_id`, `campaigns.pinned_model_snapshot`, `campaign_models.kind`, `campaign_models.variant_text`.

- [ ] **P0-3**: Skim the Plan 05 PRD + scaffold.
      File: `docs/roadmap/05-prompt-arena.md`, `plans/active/05-prompt-arena/`
      Action: Plan 05 ships before Plan 06. The way Plan 05 wired up the variants step, Best-of-N default, and per-input drilldown is a useful pattern to mirror. Note anything that turned out differently than the original 05 scaffold suggested.

---

## Step 2 — Verify foundation assumptions

For each of the items below, verify against the actual repo state at
the time you read this batch. Mark `[x]` when verified, write a "Drift
Note" if something has moved.

### Schema (Plan 04)

- [ ] **P0-4**: Confirm `campaigns.kind` enum exists with values
      `model | prompt | system_prompt`.
      File: `src/server/db/schema.ts`
      Verify: enum exported as `campaignKindEnum`; type exported as `CampaignKind`.

- [ ] **P0-5**: Confirm `campaigns.pinned_provider_model_id`,
      `campaigns.pinned_model_snapshot`, and (if needed)
      `campaigns.pinned_system_prompt` columns exist.
      File: `src/server/db/schema.ts`
      Verify: types match what the PRD assumes.

- [ ] **P0-6**: Confirm `campaign_models` is polymorphic.
      File: `src/server/db/schema.ts`
      Verify: `kind` column, `variant_text` column, nullable `provider_model_id`, CHECK constraints.

### Routing (Plan 04)

- [ ] **P0-7**: Confirm per-kind generation assembly exists.
      File: `src/server/routes/campaigns/generate.ts`
      Verify: `assembleCall` (or equivalent) switches on `campaign.kind` and routes `system_prompt` correctly — system message = `contestant.variantText`, user message = `testCase.text`.

- [ ] **P0-8**: Confirm `ALLOWED_KINDS` exists and currently allows
      `model` and `prompt` but not `system_prompt`.
      File: `api/campaigns/index.ts`

### Multi-mode (Plan 01)

- [ ] **P0-9**: Confirm Slider mode handler is live.
      Files: voter UI route, `src/server/db/schema.ts` (`sliderResponses`), submit handler.
      Verify: end-to-end Slider works on a model arena (regression check).

- [ ] **P0-10**: Confirm Multi-Axis is live (used for the "suggest
      Multi-Axis" copy).
      Verify: `multiAxisResponses` table is being populated by the submit handler; voter UI renders multi-axis correctly.

### Personas + Simulated Runs (Plan 02)

- [ ] **P0-11**: Confirm `personas` table is seeded with starter
      personas.
      Verify: `SELECT count(*) FROM personas WHERE is_starter = true` returns > 0.

- [ ] **P0-12**: Confirm persona shape matches scaffold assumptions.
      File: `src/server/db/schema.ts`
      Verify: `personas` has `tags text[]`, `categories` (or whatever the campaign uses) — this scaffold assumes tag-overlap is computable. If the persona's tag field has been renamed or restructured, the pre-filter helper logic in Phase 1 needs updating.

- [ ] **P0-13**: Confirm `simulated_runs` API surface.
      Files: `api/simulated-runs/[...path].ts`, `src/server/simulated-runs/`
      Verify: launch endpoint exists, accepts `panelType`, `voterCount`, `personaIds`, `costCeilingUsd`. Cost-preview helper exists at `src/server/simulated-runs/cost.ts`.

- [ ] **P0-14**: Confirm `simulated_runs.modelMix` snapshot pattern.
      Verify: this is the model the PRD says system-prompt arenas should mirror for `pinned_model_snapshot`.

---

## Step 3 — Document findings (Drift Notes)

> **REQUIRED:** Write a paragraph minimum even if "no drift found." If
> drift exists, write specifics: which file, which assumption, what
> changed, your judgment call about impact.

```
Drift Notes (fill in below):

Reviewed on: <date>

Findings:
  - [Item] : [No drift / Drift: <description>]
  - ...

Impact assessment:
  - <high/medium/low impact items, with rationale>

Recommended action:
  - <Continue as scaffolded / Adjust Phase 1 plan / Escalate to user>
```

If any drift is HIGH impact (e.g., persona schema renamed, simulated-runs
launch endpoint signature changed, Slider not yet live), **stop here and
escalate to the user**. Do not proceed to P0-B silently.

---

## Step 4 — Sign off

- [ ] **P0-15**: Drift Notes filled in (above).
- [ ] **P0-16**: If drift was found, user has acknowledged and given
      a directive (continue / adjust / pause).
- [ ] **P0-17**: Mark this batch complete. Phase 0 README's exit
      criteria allow P0-B to start.

---

## Verification

No code changes in this batch. Verification is the discipline of the
review itself. The "test" is whether your Drift Notes are honest and
specific.
