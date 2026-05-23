# Claims Registry — ModelArena

**Sources read:**
- `README.md`
- `AGENTS.md`
- `index.html` (meta description, title)
- `docs/roadmap/README.md` (Vision section)
- In-product copy (collected during Phase 4)

**Run:** `2026-05-23T18-00-00Z`
**Total claims:** 14

---

## How to read this file

Each claim below is a verifiable promise the product makes. The walkthrough
verifies whether the surface(s) that should deliver on it actually do.

---

## CLM-001

- **Source:** `README.md:3`
- **Claim:** "An organizational tool for evaluating AI models through head-to-head voting campaigns."
- **Verifiable on surface(s):** `/`, `/campaign/new`, `/vote/:slug/play`
- **Notes:** The product positions itself as head-to-head voting. A first-time
  operator must be able to create a campaign and a participant must be able to
  vote between models in head-to-head pairs.

## CLM-002

- **Source:** `README.md:8-9`
- **Claim:** "Under construction. See the Phase 1 PR description for scope — this branch adds the persistence layer; route handlers land in Phase 2."
- **Verifiable on surface(s):** entire app
- **Notes:** README admits the product is incomplete. Half-built surfaces are
  expected — but they should still be labeled.

## CLM-003

- **Source:** `README.md:33-34`
- **Claim:** "The seed script prints the share slugs it created so you can jump straight into the participant flow at `http://localhost:3000/vote/<slug>`."
- **Verifiable on surface(s):** `/vote/:slug`
- **Notes:** After running `npm run db:seed`, the listed slugs must produce a
  working participant landing.

## CLM-004

- **Source:** `README.md:38-48`
- **Claim:** Eight npm scripts exist and are documented (`dev`, `build`, `lint`, `db:generate`, `db:migrate`, `db:push`, `db:studio`, `db:seed`, `db:seed-starter-personas`).
- **Verifiable on surface(s):** terminal (not a UI surface, but a documented contract)
- **Notes:** Verifiable by `package.json` parity.

## CLM-005

- **Source:** `README.md:50-71`
- **Claim:** "Three sign-in methods, all issuing the same `operator_session` cookie ... Password / GitHub OAuth / Email magic link"
- **Verifiable on surface(s):** `/login`
- **Notes:** Only methods whose env vars are populated should be visible on the
  login page. Unconfigured methods stay hidden.

## CLM-006

- **Source:** `README.md:73-88`
- **Claim:** "Login access and AI access are two separate allowlists ... Password sessions have identity 'operator' (shared literal, not a person), so password logins are implicitly blocked from AI"
- **Verifiable on surface(s):** `/campaign/:id` (generate action), `/personas` (test action)
- **Notes:** When signed in via password, every AI-triggering action must fail
  closed with `403 ai_forbidden` or `503 ai_not_configured`.

## CLM-007

- **Source:** `README.md:91-99`
- **Claim:** "Vite SPA frontend ... Vercel Functions for the API ... Neon Postgres via `@neondatabase/serverless` + Drizzle ORM ... Participant auth: anonymous, HMAC-signed cookie for vote dedup."
- **Verifiable on surface(s):** `/vote/:slug/play`
- **Notes:** Participants should not need to log in. A vote dedup cookie should
  be present after first vote.

## CLM-008

- **Source:** `index.html:8`
- **Claim:** "ModelArena is the operator console and voting experience for running blind model evaluation campaigns."
- **Verifiable on surface(s):** `/vote/:slug/play`
- **Notes:** Voting must be *blind* — model names must not be revealed to
  participants until results are shown.

## CLM-009

- **Source:** `docs/roadmap/README.md:11-13`
- **Claim:** "Configurable Human Evaluation for AI Products ... built for the people whose job is judging AI output — PMs, content leads, support ops, CX teams — not the engineers who wire it up."
- **Verifiable on surface(s):** entire operator console
- **Notes:** Aspirational, but if the operator console requires engineering
  knowledge to drive (env vars, raw model IDs, etc.), that contradicts the
  positioning.

## CLM-010

- **Source:** `docs/roadmap/README.md:25-28`
- **Claim:** "Multi-mode evaluation ... Modes: Tournament (existing), Slider, Approve/Reject, Best-of-N, Multi-Axis, Qualitative."
- **Verifiable on surface(s):** `/campaign/new`, `/vote/:slug/play`
- **Notes:** Per the roadmap M1 should already be shipping Slider + Approve/
  Reject. The product copy must not claim non-existent modes are available.

## CLM-011

- **Source:** `docs/roadmap/README.md:30-33`
- **Claim:** "Run a campaign without humans (or before humans, to iterate fast). Generic calibrated panels + persona panels."
- **Verifiable on surface(s):** `/personas`, `/campaign/:id`
- **Notes:** Simulated runs must be runnable. If `PersonaLibrary` exists as a
  route but isn't functional, that's `half-built`.

## CLM-012

- **Source:** `AGENTS.md:5`
- **Claim:** "ModelArena, the app behind idea.com, for running blind AI model evaluation campaigns."
- **Verifiable on surface(s):** voting UI
- **Notes:** Reinforces CLM-008 (blind).

## CLM-013

- **Source:** `README.md:46`
- **Claim:** "`db:seed` ... Wipe and re-seed the demo data. Refuses to run in NODE_ENV=production unless ALLOW_PROD_SEED=1"
- **Verifiable on surface(s):** terminal
- **Notes:** Run with NODE_ENV=production and confirm refusal.

## CLM-014

- **Source:** route table in `src/App.tsx`
- **Claim:** Routes that exist (implicit promise to first-time user clicking around): `/`, `/dashboard`, `/team-activity`, `/models`, `/personas`, `/settings/api`, `/campaign/new`, `/campaign/:id`, `/campaign/:id/preview`, `/vote/:slug`, `/vote/:slug/play`, `/vote/:slug/results`, `/login`. Unknown routes redirect to `/`.
- **Verifiable on surface(s):** every route in the SPA
- **Notes:** This is the *implicit* claim every SPA makes — links that point
  somewhere should resolve to a real surface.
