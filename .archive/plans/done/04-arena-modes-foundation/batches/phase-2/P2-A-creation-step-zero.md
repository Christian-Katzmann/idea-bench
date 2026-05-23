# P2-A: Step 0 Kind Picker & Per-Kind Step Labels

Add the kind-selection step to the creation wizard and shift labels
on subsequent steps based on the chosen kind.

---

## Tasks

### Step 0

- [x] **P2-1**: Insert Step 0 in `CreateCampaign.tsx`.
      File: `src/pages/CreateCampaign.tsx`
      Action: Update the `STEPS` constant: prepend `{ n: 0, label: 'Kind' }` and renumber the rest. Render a step component that shows three cards (Model arena / Prompt arena / System-prompt arena) with short, plain-language descriptions matching the PRD's table. Selecting Model arena lights up the rest of the wizard; Prompt arena and System-prompt arena render disabled with a "Coming soon" badge and a tooltip pointing operators to the model arena for now.
      Ref: PRD → "Creation UX (operator)" → wizard table

- [x] **P2-2**: Persist `kind` in form state.
      File: `src/pages/CreateCampaign.tsx`
      Action: Add `kind` to the wizard's local state, default `'model'`. Pass it through to the create payload at submit time.

- [x] **P2-3**: Per-kind step labels.
      File: `src/pages/CreateCampaign.tsx`
      Action: Make the `STEPS` labels a function of `kind`. For `model`: existing labels. For `prompt`/`system_prompt`: PRD-spec labels (e.g., "Inputs"/"Variants" for prompt, "Test prompts"/"Variants" for system-prompt). The actual editors for non-model kinds are stubs in this phase — Plans 05/06 fill them.

- [x] **P2-4**: Tests.
      File: `src/pages/__tests__/CreateCampaign.test.tsx`
      Action: Cover Step 0 rendering, disabled non-model options, kind=model end-to-end submission unchanged.

---

## Notes

- The wizard already uses TipTap editors and shadcn/ui primitives. Stay
  consistent — don't reach for new components.
- "Coming soon" copy should be friendly and brief. Operators using V1
  see the upcoming surface area but aren't confused about availability.

---

## Verification

```bash
cd modelarena
npm run lint
npx vitest run src/pages/__tests__/CreateCampaign.test.tsx
npm run dev
# Manual: visit /create → Step 0 shows three cards; only Model is selectable.
```
