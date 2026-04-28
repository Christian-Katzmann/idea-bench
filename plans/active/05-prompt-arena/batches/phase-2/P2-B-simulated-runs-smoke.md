# P2-B: Simulated Runs Smoke Verification

Confirm simulated runs and persona panels work end-to-end on a
prompt-arena campaign without code changes.

---

## Tasks

- [x] **P2-5**: End-to-end simulated-run test.
      File: `src/server/__tests__/simulated-prompt-arena.test.ts` (new)
      Action: Build a fixture prompt-arena campaign (3 variants, 3 inputs, pinned model). Trigger a small simulated run (1 generic panel, 3 voters). Confirm: judge calls produce votes/scores; ratings compute; leaderboard renders.

- [x] **P2-6**: Persona panel smoke test.
      File: same file
      Action: Trigger a persona-panel simulated run (1 starter persona, 3 voters). Confirm persona judging cells populate per-variant. Verify the "By persona" rating cut renders on the dashboard fixture.

- [ ] **P2-7**: Manual end-to-end.
      Action: Run dev server. Create prompt-arena campaign via UI. Generate. Activate. Trigger a simulated run with a persona panel. Visit dashboard → confirm leaderboard renders + variant text panel works + per-input drilldown works. Document any issues encountered.

---

## Notes

- If any code change is required for simulated runs to work on prompt
  arenas, it's a Plan 04 oversight. File a follow-up batch in Plan 04
  rather than patching here.
- The "By persona" leaderboard cut is shipped in Plan 02; this batch
  just verifies it's compatible with prompt arenas.

---

## Verification

```bash
cd modelarena
npm run lint
npm run build
npx vitest run
npm run dev   # for manual smoke
```
