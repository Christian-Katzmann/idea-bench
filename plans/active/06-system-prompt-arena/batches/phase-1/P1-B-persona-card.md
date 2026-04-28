# P1-B: Persona Suggestion Card

Build the launch-step persona card with pre-filtered selection.

---

## Tasks

### Persona pre-filter helper (server)

- [ ] **P1-11**: Tag-overlap pre-filter helper.
      File: `src/server/simulated-runs/launch.ts` (or new `persona-suggest.ts`)
      Action: Export `suggestPersonas({ campaignCategories, personas })` that returns personas ranked by tag-overlap with `campaignCategories`. Simple string-equality matching is fine for V1; the algorithm is replaceable later.
      Ref: PRD → "Persona integration"

- [ ] **P1-12**: Test the helper.
      File: `src/server/__tests__/persona-suggest.test.ts` (new)
      Action: Cover overlap matching, no-overlap fallback (return all personas, ranked by recency or whatever the PRD prefers), empty inputs.

### Persona card UI (launch step)

- [ ] **P1-13**: Persona card on the launch step.
      File: `src/pages/CreateCampaign.tsx`
      Action: For `kind='system_prompt'`, the launch step renders a card titled "Run with persona panel?" Default state: **on** (checked). Inside: pre-filtered persona list (from helper), each persona a checkbox with name + description + match-count badge. Free-text "Refine" field that filters the full library when the pre-filter is too narrow.
      Ref: PRD → "Persona integration"

- [ ] **P1-14**: Voter count slider.
      File: `src/pages/CreateCampaign.tsx`
      Action: Voter count slider default 10, range 1–500. Below the slider, a small "Why 10?" tooltip explaining the conservative default per PRD.

- [ ] **P1-15**: Submit launches both the campaign activation and the
      simulated run.
      File: `src/pages/CreateCampaign.tsx`
      Action: When the operator confirms launch with the persona card checked, the front-end calls `POST /api/campaigns/:id/activate` first, then `POST /api/simulated-runs` with the chosen `personaIds` and `voterCount`. If activation fails, abort the simulated run.

### Tests

- [ ] **P1-16**: Launch step tests.
      File: `src/pages/__tests__/CreateCampaign.test.tsx`
      Action: Render with `kind='system_prompt'` and a populated persona library fixture. Confirm: card defaults to checked, pre-filter shows expected matches, refine field expands to full library, no auto-checking, slider works.

---

## Notes

- Personas without category tags should still appear in the refine
  field — they just don't surface in the pre-filtered list. Don't
  silently exclude them.
- The card is operator-facing only; the voter never sees persona
  details (already enforced by `withOperator` middleware on the
  simulated-runs endpoints).

---

## Verification

```bash
cd modelarena
npm run lint
npx vitest run
```
