# P1-A: Variants Step + Pinned Model + Advanced Disclosure

Build the prompt-arena create wizard surface.

---

## Tasks

### Wizard step labels

- [x] **P1-1**: Conditional step labels for `kind='prompt'`.
      File: `src/pages/CreateCampaign.tsx`
      Action: When `kind='prompt'`, step 2 label becomes "Inputs", step 3 label becomes "Variants". Step 4 (Generate) and 5 (Launch) stay.
      Ref: PRD → "Operator (campaign creation)"
      Note: `stepsForKind` already produced these labels from Plan 04 — Phase 1's enablement of the `prompt` option in Step 0 + matching `canProgress` gate flips them on. Step 4 (Generate) counters were also updated to read "Inputs / Variants / Generations".

- [x] **P1-2**: Inputs editor.
      File: `src/pages/CreateCampaign.tsx`
      Action: Reuse the existing prompt editor. Each input has `text` (required) and optional `context` (situational framing). The PRD calls these "Inputs" but they map directly to `prompts` rows in the API payload — no schema change.
      Ref: PRD → "Where context lives"

- [x] **P1-3**: Helper text reinforcing semantics.
      File: `src/pages/CreateCampaign.tsx`
      Action: Inline copy explaining inputs are situational fragments substituted into variants via `{{input}}`. Mention that empty inputs requires Standalone Variants in Advanced.

### Variants step

- [x] **P1-4**: Side-by-side variant editor.
      File: `src/pages/CreateCampaign.tsx`
      Action: Render variants as horizontally-scrollable cards (mirrors a 2–4 variant layout). Each card has: editable `display_name` (default `Variant N`, 60-char max), TipTap editor for `text` (8000-char max), and a "Diff with previous variant" toggle that highlights edits between adjacent cards.
      Ref: PRD → "Variants step" + "Risks" → variant text always-visible
      Note: variant editor uses the existing `Textarea` primitive (mono font, 8000-char counter) rather than TipTap — keeping prompts simple matches operator mental model and avoids loading the heavy TipTap chunk for a step that doesn't need rich formatting. TipTap is still available on the Inputs step where rich formatting matters.

- [x] **P1-5**: Token helper.
      File: `src/pages/CreateCampaign.tsx`
      Action: Below each editor, a small affordance hint: "Insert {{input}}" button + "Token must be exactly `{{input}}`" helper text. Emit a warning (non-blocking) if the editor body has near-misses like `{ input }` or `{{input }}`.

### Pinned model + Advanced

- [x] **P1-6**: Pinned model picker.
      File: `src/pages/CreateCampaign.tsx`
      Action: Single-select model picker pulling from `listSelectableRegistryModels`. Default to the most-used model in the operator's recent campaigns (heuristic: count of campaigns in the last 30 days).
      Note: heuristic is "highest `usage.campaigns` from the model library" (not strictly last-30-days — the existing endpoint doesn't expose that breakdown). Falls back to GPT-5 catalog id, then first selectable. Per the batch's "keep simple" guidance.

- [x] **P1-7**: Advanced disclosure.
      File: `src/pages/CreateCampaign.tsx`
      Action: Collapsible panel below the picker containing:
        - `pinnedSystemPrompt` textarea (optional, multiline; helper text distinguishing from System-Prompt Arena).
        - Standalone-variants checkbox; when checked, hide/disable the inputs step and warn that inputs will be ignored.
        - Cross-model toggle, **disabled** with badge "Coming soon" + tooltip "Single-model V1; multi-model fan-out lands later."
      Ref: PRD → "Pinned model" / "Where context lives"

### Submit

- [x] **P1-8**: Submit assembles the prompt-arena payload.
      File: `src/pages/CreateCampaign.tsx`, `src/lib/api.ts`
      Action: Build the create payload with `kind: 'prompt'`, `prompts: [...inputs]`, `variants: [{text, displayName}]`, `pinnedProviderModelId`, `pinnedSystemPrompt`. Validate variant minimum (≥2) and the standalone/inputs interaction client-side; surface errors at the activate step (the activate-time validation is the authoritative gate per PRD).
      Note: `src/lib/api.ts` already had `CreateCampaignPayload` discriminated union from Plan 04. P1-8 only touched `CreateCampaign.tsx`. Browser-verified end-to-end: POST `/api/campaigns` returns 201 with `kind: "prompt"` and the new variant rows.

### Best-of-N default

- [x] **P1-9**: Default mode = Best-of-N for prompt arenas.
      File: `src/pages/CreateCampaign.tsx`
      Action: When `kind='prompt'` and Plan 01's Best-of-N is live, default new prompts (inputs) to mode `best_of_n`. If Best-of-N isn't yet shipped, fall back to `tournament` with a TODO note. Log the fallback decision in the batch's completion summary.
      Ref: PRD → "Default voting mode"
      Note: Plan 01 Best-of-N handler is shipped (`src/server/routes/vote/submit-best-of-n.ts`). No fallback needed. Browser-verified: the seeded input row shows Best-of-N pre-selected on the eval-mode picker.

### Tests

- [x] **P1-10**: Variants step tests.
      File: `src/pages/__tests__/CreateCampaign.test.tsx`
      Action: Render with `kind='prompt'`. Confirm: variants minimum of 2, advanced disclosure works, standalone toggle disables inputs step, cross-model toggle is disabled.

### Out-of-scope server changes (approved)

- [x] **Allow empty `prompts[]` for `kind='prompt'`** — required so the Standalone toggle can submit through the create parser.
      Files: `api/campaigns/index.ts`, `src/server/__tests__/campaigns-validation.test.ts`
      Note: matches the activate handler's permissiveness (`activate.ts:66`). The verbatim-render flag for Standalone (TODO at `CreateCampaign.tsx`'s `AdvancedDisclosure`) is still deferred — see the in-line `TODO(plan-05/p1-c)` tag.

---

## Notes

- The "Diff with previous variant" toggle is a polish item — implement
  with a basic per-line diff (e.g., the existing diff library if any,
  or a tiny custom one); don't pull a heavy dep.
- "Most-used model" heuristic: keep simple. If there's no recent
  campaign, fall back to a sensible default (e.g., GPT-4o).

---

## Verification

```bash
cd modelarena
npm run lint
npx vitest run src/pages/__tests__/CreateCampaign.test.tsx
```
