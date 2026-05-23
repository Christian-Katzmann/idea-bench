# P1-B: Persona Suggestion Card

Build the launch-step persona card with pre-filtered selection.

---

## Tasks

### Persona pre-filter helper (server)

- [x] **P1-11**: Tag-overlap pre-filter helper.
      File: `src/server/simulated-runs/launch.ts` (or new `persona-suggest.ts`)
      Action: Export `suggestPersonas({ campaignCategories, personas })` that returns personas ranked by tag-overlap with `campaignCategories`. Simple string-equality matching is fine for V1; the algorithm is replaceable later.
      Ref: PRD → "Persona integration"
      Done: New file `src/server/simulated-runs/persona-suggest.ts`. Pure (no DB), case-insensitive set intersection, sorts by `matchCount` desc then `updatedAt` desc. Returns ALL input personas with their match count attached so the UI can decide what to surface — the PRD's "personas without category tags should still appear in refine" rule lives in this contract.

- [x] **P1-12**: Test the helper.
      File: `src/server/__tests__/persona-suggest.test.ts` (new)
      Action: Cover overlap matching, no-overlap fallback (return all personas, ranked by recency or whatever the PRD prefers), empty inputs.
      Done: 7 tests pass: overlap ranking, case-insensitive match, no-overlap returns all with matchCount=0, empty campaign-categories, empty personas, recency tie-break, ignore whitespace-only categories.

### Persona card UI (launch step)

- [x] **P1-13**: Persona card on the launch step.
      File: `src/pages/CreateCampaign.tsx`
      Action: For `kind='system_prompt'`, the launch step renders a card titled "Run with persona panel?" Default state: **on** (checked). Inside: pre-filtered persona list (from helper), each persona a checkbox with name + description + match-count badge. Free-text "Refine" field that filters the full library when the pre-filter is too narrow.
      Ref: PRD → "Persona integration"
      Done: New `PersonaPanelCard` component (exported for tests) renders only when `kind='system_prompt'` on Step 5. Default-on header toggle. Tag-overlap ranking via `suggestPersonas`. Each row: checkbox + name + description + "N matches" badge (only when matchCount > 0). Refine field filters by name/description/tags substring. Server cap of 10 personas mirrored client-side (additional checkboxes disable). Inline footer: "0 selected · max 10" + "Pick at least one persona…" hint when empty. Loading + error states + a graceful empty-state CTA linking to `/personas` when the library is empty (P0-A drift handling).

- [x] **P1-14**: Voter count slider.
      File: `src/pages/CreateCampaign.tsx`
      Action: Voter count slider default 10, range 1–500. Below the slider, a small "Why 10?" tooltip explaining the conservative default per PRD.
      Done: Slider default 10, range **10–500** (NOT 1–500 — the server's `MIN_VOTER_COUNT = 10` would reject anything lower with a 400; matching the floor here keeps client/server in sync). "Why 10?" hint copy below the track explains the conservative default. Live-region span shows the current value with `font-mono tabular-nums`.

- [x] **P1-15**: Submit launches both the campaign activation and the
      simulated run.
      File: `src/pages/CreateCampaign.tsx`
      Action: When the operator confirms launch with the persona card checked, the front-end calls `POST /api/campaigns/:id/activate` first, then `POST /api/simulated-runs` with the chosen `personaIds` and `voterCount`. If activation fails, abort the simulated run.
      Done: `handleLaunch` extended with a system-prompt + panel-enabled branch. Order: (1) POST `/api/campaigns/:id/activate`; (2) if activation succeeded AND panel enabled AND ≥1 persona selected → POST `/api/simulated-runs` with `{ campaignId, panelType: 'persona', voterCount, personaIds }`. The empty-personaIds case is permitted (operator launches for human voters, can spin up a panel from the dashboard later). Sim-run create errors don't block navigation — the campaign is live and the operator can retry from the dashboard; we surface the error inline via `activateError`. The runner is **not** triggered from this page (would need an SSE long-lived connection); the dashboard's existing simulated-runs UI starts the runner on the pending row.

### Tests

- [x] **P1-16**: Launch step tests.
      File: `src/pages/__tests__/CreateCampaign.test.tsx`
      Action: Render with `kind='system_prompt'` and a populated persona library fixture. Confirm: card defaults to checked, pre-filter shows expected matches, refine field expands to full library, no auto-checking, slider works.
      Done: New describe-block ("PersonaPanelCard (Step 5 surface for kind=system_prompt)") with **13 tests** covering: default-on toggle, every persona surfaces (incl. untagged), no auto-checking, tag-overlap ranking + match-count badge, header-toggle hides inner controls, checkbox click emits the new id, refine filter (case-insensitive substring), zero-match hint, slider min=10/max=500/default=10, slider emits new values, 10-persona cap (11th disabled, already-selected stays interactive), empty-state CTA when library is empty, loading-state spinner, "pick at least one persona" inline hint when 0 selected.

      **Approach note:** Driving the wizard end-to-end to Step 5 requires successful generation (POST `/api/campaigns` + the SSE stream to `/api/campaigns/:id/generate`), which is out of P1-B's scope. The tests render `PersonaPanelCard` directly with controlled props, which gives tighter coverage of the persona-card surface than wizard-walking would. The wizard's wiring (state hooks, `StepLaunch` mounting) was verified via the browser smoke at the end of the batch.

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
