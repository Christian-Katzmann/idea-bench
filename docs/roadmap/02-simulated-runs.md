# Plan 02 — Simulated Runs

> Status: Approved, not started. Depends on Plan 01 (Multi-Mode Evaluation).
> Last updated: 2026-04-20.
> See [roadmap README](./README.md) for cross-plan context.

## Context

Human voting doesn't scale. A real campaign caps out around 20–200 human
votes across a handful of prompts. That's fine for a one-off model bake-off
but falls short of the volume needed to run a rigorous benchmark, to iterate
quickly during a content project, or to answer "what would my target
audience think?" before recruiting real ones.

**Simulated Runs** adds automated evaluators — calibrated LLM panels that
vote on outputs the same way humans do. Two distinct flavors ship:

- **Generic panels** — diverse, cross-family judges focused on overall
  quality. "Is this objectively good?"
- **Persona panels** — judges instructed to evaluate from a specific point
  of view. "You are a corporate finance manager evaluating outbound client
  emails. You value precision and professional tone; you dislike filler and
  informal contractions. Evaluate this output from your perspective."

The persona dimension is the product wedge. Any eval tool can call an LLM to
judge an output. None treat personas as a first-class, customizable, saved
library the way ModelArena will. This feature reframes simulated runs from
a dev-tool idea ("LLM as judge") into a product-research idea ("simulated
audiences of my target users"). That reframe opens a budget line competing
eval platforms don't touch — user-research spend, not eval-tool spend.

**Self-preference bias is real.** Published work (Panickssery et al. 2024,
Zheng et al. 2023) documents that LLMs favor outputs from their own family
by 5–10% over blinded human judgment. Untreated, this poisons ratings. The
feature design must address it explicitly, not hope for the best. Three
mitigations are non-negotiable and ship on day one: diverse panels,
cross-family exclusion, and a calibration loop against real human votes
(when available).

Cost is manageable. Cheap judges (Haiku, Gemini Flash, GPT-4o-mini) run at
$0.0001–0.001 per call. A 30-prompt × 4-model × 20-simulated-voter run is
~$3–$30 at current OpenRouter rates. The operator controls voter count via
a slider (10–500) — trade cost for confidence.

## User-Facing Behavior

### Operator: configuring a simulated run

On the campaign creation or dashboard, a new **Simulated Run** action lets
the operator configure:

1. **Panel type**: Generic (default) or Persona (pick one or more personas
   from the library)
2. **Voter count**: slider 10–500 simulated voters. Default 30.
3. **Model mix**: by default, system picks three cheap models from three
   different families. Operator can override (for bias control, cost
   control, or experimentation).
4. **Cross-family exclusion**: shown as an info chip, not a toggle —
   enforced automatically and not disableable. The UI explains why
   ("Claude judges are excluded when comparing Claude outputs. This
   prevents measurable self-preference bias.").
5. **Cost estimate**: shown before the run starts. "~$12–18 at current
   rates."

Launching a simulated run kicks off a job that mirrors the human voting
loop — one "simulated voter" per seat in the panel, each submitting through
whichever evaluation modes the campaign uses. Progress streams to the
operator's dashboard just like generation does today.

### Persona library

Personas are saved, named, reusable voter profiles. Each persona defines:

- **Name** (e.g., "Corporate Finance Manager")
- **Description** (one-line; shown in pickers)
- **System prompt template** (the instructions given to the LLM judge)
- **Priorities** (what this persona values)
- **Anti-patterns** (what this persona dislikes)
- **Tags** (industry, role, seniority — for filtering)

Library design: **a strong curated starter set + custom authoring +
"duplicate and edit" on any persona** (starter or custom). Operator never
starts from a blank page.

Starter set (ship with ~15–20 personas covering common B2B + consumer
roles):
- Corporate Finance Manager
- Municipal Office Worker
- Enterprise SaaS Admin
- SMB Marketing Lead
- Customer Support Agent
- Legal Counsel
- Healthcare Administrator
- Retail Shopper (casual)
- Technical End User (developer)
- Non-Technical End User (general consumer)
- Content Editor
- Creative Director
- Compliance Officer
- Executive Assistant
- Product Manager (B2B)
- Customer Success Manager
- (plus 3–4 more, chosen during Phase 2)

Each starter persona is authored by hand, reviewed for bias, and version-
tracked. The starter set matters — it's what an operator sees on day one.
Phoning it in ruins the first-run experience.

### Simulated run results

In the leaderboard, simulated run results are **visibly distinct** from
human votes:
- A "Run" filter shows: Human votes / Simulated (all) / Simulated by persona
- Confidence intervals reflect the sample size of the selected filter
- The "humans only" view always exists — the operator can strip out
  simulated signal entirely at any time
- When both exist, a side-by-side view compares real vs simulated
  leaderboards ("Real voters prefer Claude. Corporate Finance persona
  prefers GPT.")

Persona-segmented leaderboards answer "what does *this audience* think?"
for each persona in the run. This is the persona-run analogue of Cohort
Arenas (real humans segmented by metadata) — same UX, different data
source.

## Architecture

### Schema additions

```typescript
// Simulated voter profiles — personas + a reserved 'generic' profile
export const personas = pgTable('personas', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  priorities: text('priorities').array().notNull().default([]),
  antiPatterns: text('anti_patterns').array().notNull().default([]),
  tags: text('tags').array().notNull().default([]),
  isStarter: boolean('is_starter').notNull().default(false),
  derivedFromPersonaId: uuid('derived_from_persona_id').references(() => personas.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// A simulated run = one batch execution of a panel against a campaign
export const simulatedRuns = pgTable('simulated_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  panelType: text('panel_type').notNull(), // 'generic' | 'persona'
  voterCount: integer('voter_count').notNull(),
  modelMix: jsonb('model_mix').notNull(), // [{ providerModelId, weight }, ...]
  personaIds: uuid('persona_ids').array(), // null for generic
  status: text('status').notNull().default('pending'), // pending | running | complete | failed
  costEstimateUsd: numeric('cost_estimate_usd', { precision: 10, scale: 4 }),
  costActualUsd: numeric('cost_actual_usd', { precision: 10, scale: 4 }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

// Simulated participants — one row per simulated voter in a run
export const simulatedParticipants = pgTable('simulated_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  simulatedRunId: uuid('simulated_run_id').notNull().references(() => simulatedRuns.id, { onDelete: 'cascade' }),
  personaId: uuid('persona_id').references(() => personas.id), // null for generic
  judgeModelId: text('judge_model_id').notNull(), // providerModelId used as judge
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

`participants` and `simulated_participants` stay separate — different
identity model, different dedup rules, different lifecycle. Responses
(votes, slider_responses, etc. from Plan 01) grow a nullable
`simulated_participant_id` column alongside the existing `participant_id`.
Exactly one of the two is populated per response.

### Cross-family exclusion

Maintained as a static map in code, not schema:

```typescript
const MODEL_FAMILY: Record<string, string> = {
  'openai/gpt-4o': 'openai',
  'anthropic/claude-3.5-sonnet': 'anthropic',
  'google/gemini-1.5-pro': 'google',
  // ...
};

function excludedFromJudging(comparisonModels: string[]): string[] {
  const families = new Set(comparisonModels.map(m => MODEL_FAMILY[m]));
  return Object.entries(MODEL_FAMILY)
    .filter(([_, fam]) => families.has(fam))
    .map(([model]) => model);
}
```

At panel-assembly time, the server filters the operator's requested model
mix against this exclusion list. If the remaining pool is empty or
unbalanced, the run fails fast with an explainable error.

### Judge call pipeline

Simulated voting reuses `openrouter.ts`. Each simulated participant, for
each prompt, runs the relevant evaluation mode — submits the same shape of
response a human would. A persona's system prompt is prepended to the
judge call.

Example tournament-mode judge prompt (generic panel):

```
You are a careful evaluator of AI model outputs. You will see two responses
to the same prompt. Decide which response is better overall, considering
clarity, correctness, and usefulness. If they are equally good, answer
"tie". If both are unacceptable, answer "both_bad".

Prompt: <prompt text>

Response A: <generation A>

Response B: <generation B>

Answer with exactly one of: A, B, tie, both_bad.
```

Persona version (Corporate Finance Manager):

```
<persona.systemPrompt>

You will see two responses to the same prompt. Decide which response is
better *from your perspective as a Corporate Finance Manager*. If they are
equally good for you, answer "tie". If both are unacceptable, answer
"both_bad".

Prompt: <prompt text>

Response A: <generation A>

Response B: <generation B>

Answer with exactly one of: A, B, tie, both_bad.
```

Mode-specific prompts are needed for slider, approve/reject, etc. Keep
them in `src/server/simulated-runs/prompts/` so they're auditable and
diffable.

### Concurrency and cost control

- Run job is durable — if the server dies mid-run, restart continues from
  the last completed simulated participant
- Per-run rate limit: operator-configurable max parallel judge calls
  (default 20)
- Hard cost ceiling: if projected cost exceeds 2× the estimate, pause
  and notify the operator
- Abort button: stops the run, keeps completed responses

### Calibration (future, Phase 3)

When both human votes and simulated votes exist on the same (prompt,
output) pairs, compute per-judge and per-persona agreement rates with
humans. Show this in the UI. De-weight or flag judges that systematically
under-agree.

Calibration is **not** in scope for V1 — it requires enough human votes
to anchor against. Ship it when Cohort Arenas lands (deferred) and
accumulated data makes the signal meaningful.

## Implementation Phases

### Phase 0 — Prereqs

- Plan 01 (Multi-Mode Evaluation) must be in at least Phase 1 — simulated
  runs vote in the same modes as humans, so the mode dispatcher must
  exist

### Phase 1 — Generic panels

- Schema: `simulated_runs`, `simulated_participants`, nullable
  `simulated_participant_id` on response tables
- `src/server/simulated-runs/` module: panel assembly, cross-family
  exclusion, judge call pipeline, durability
- Operator UI: launch a generic simulated run on an active campaign,
  monitor progress
- Leaderboard: "Human / Simulated / Both" filter
- Ship personas table empty — Phase 2 populates it

Exit: an operator can run 30 simulated voters against a campaign, see the
resulting leaderboard, and filter humans vs simulated.

### Phase 2 — Persona panels + starter library

- Personas CRUD + library UI: browse, search, tag filter, duplicate-and-
  edit
- Starter library seeded (15–20 handcrafted personas — this is real
  editorial work, budget time for it)
- Launch a simulated run with one or more personas; leaderboard segments
  results by persona
- Persona authoring UI: structured fields, not just free-text system
  prompt — guides the operator toward good personas

Exit: an operator can run the full "20 Corporate Finance Managers + 20
Municipal Office Workers" comparison and see two persona-segmented
leaderboards.

### Phase 3 — Polish

- Cost estimates shown before launch, with breakdown by judge model
- Hard cost ceiling + abort button
- Improved persona authoring: structured rubric fields per dimension (for
  multi-axis mode), persona "test" action that runs 1–2 prompts to
  preview voting style
- Per-judge latency tracking, auto-exclude judges that time out
  repeatedly

Exit: simulated runs feel production-grade — reliable, predictable cost,
no surprises.

## Acceptance Criteria

- [ ] Operator can launch a generic simulated run with configurable voter
  count (10–500) and see live progress
- [ ] Cross-family exclusion is enforced automatically — Claude judges
  don't vote on Claude outputs; same for every other family
- [ ] Simulated run results appear in leaderboards, distinctly marked vs
  human votes, with the ability to filter to humans-only
- [ ] Persona library ships with 15+ handcrafted starter personas
- [ ] Operator can duplicate any persona (starter or custom) and edit
- [ ] Persona-segmented leaderboards render correctly for runs with
  multiple personas
- [ ] Failed runs are durable — restart continues from last completed
  simulated participant
- [ ] Cost estimate shown before launch is within 25% of actual cost on
  typical runs
- [ ] All six evaluation modes (Plan 01) work for simulated voters, not
  just tournament

## Risks & Watchouts

1. **Self-preference bias is real and measurable.** Ship the three
   mitigations together — panels + cross-family exclusion + (eventually)
   calibration. Don't ship "LLM as judge" as a single-judge feature "for
   MVP" — that's worse than not shipping it.

2. **Persona quality is editorial craft.** A mediocre starter library
   makes the first-run experience feel like cheap AI filler. Budget real
   time — a day per persona, reviewed by a human with domain knowledge —
   not "generate them with an LLM."

3. **Cost control is load-bearing.** A runaway loop is a $1000 bill.
   Ship the hard cost ceiling + abort in Phase 1, not Phase 3. Make it
   impossible to accidentally spend more than 2× the estimate.

4. **Don't overload "simulated".** The word can mean personas or just
   automated judging. Maintain the distinction in the UI consistently —
   "Generic Panel" vs "Persona Panel", not "Simulated Type 1" / "Type 2".

5. **Cross-family exclusion needs a maintained model→family map.** When
   a new provider ships, the map must be updated or judges for that
   provider's family won't be excluded from judging its outputs. Add a
   CI check that every model in `src/lib/models.ts` has a family entry.

6. **OpenRouter dependency.** Simulated runs multiply API traffic. Have
   a circuit breaker for OpenRouter — if judge calls start failing in
   bulk, pause the run rather than burning through retries.

7. **Personas are not audiences.** A "Corporate Finance Manager"
   persona's vote is a model's imagination of that role, not a real CFM's
   vote. Messaging in the UI must never elide this — persona results are
   labeled "Simulated Corporate Finance Manager" not "Corporate Finance
   Managers." The calibration loop is what earns the right to trust
   personas over time.

## Critical Files

- `src/server/db/schema.ts` — personas + simulated_runs +
  simulated_participants tables
- `src/server/simulated-runs/index.ts` — new module
  - `panel-assembly.ts` — cross-family exclusion, model mix validation
  - `judge-calls.ts` — judge prompt templates per mode; OpenRouter
    integration
  - `durability.ts` — checkpoint + restart logic
  - `cost.ts` — estimation + hard ceiling enforcement
- `src/server/simulated-runs/prompts/` — mode-specific judge prompt
  templates (one file per mode)
- `src/server/simulated-runs/starter-personas.ts` — seeded starter library
- `src/lib/models.ts` — add family metadata to every model entry
- `api/simulated-runs/*.ts` — launch, status, abort endpoints
- `api/personas/*.ts` — persona CRUD
- `src/pages/SimulatedRunConfig.tsx` — operator configurator UI
- `src/pages/PersonaLibrary.tsx` — browse/edit/duplicate personas
- `src/components/dashboard/leaderboard/` — human / simulated / persona
  filter and segmented rendering
- `drizzle/000X_simulated_runs.sql` + `drizzle/000X_personas.sql`

## Verification

1. `npm run db:migrate` + `npm run db:seed` — migration applies; seed
   populates starter persona library
2. `npm run test:run` — all tests pass; new unit tests for panel
   assembly, cross-family exclusion, cost estimation
3. Integration: create a campaign with 4 models from 4 different
   families, launch a generic simulated run with 30 voters, verify the
   panel composition respects cross-family exclusion (inspect
   `simulated_participants` rows)
4. Integration: launch a persona run with 2 personas × 20 voters each,
   verify leaderboard shows separate per-persona segments
5. Failure injection: mid-run, kill the server process. Restart, verify
   run resumes from the last completed simulated participant, total
   responses match expected count
6. Cost check: estimated cost for a typical run is within 25% of actual
   cost logged in `simulated_runs.costActualUsd`
7. Bias check: run the same campaign once with cross-family exclusion
   and once without (dev-only debug toggle). Expect measurable
   difference in family-of-judge → family-of-winner correlation. Document
   the finding.
8. Regression: existing tournament campaigns with only human votes
   behave identically; the leaderboard defaults to "Human" filter
   when no simulated runs exist

Any failure in 1–8 means the feature isn't done.
