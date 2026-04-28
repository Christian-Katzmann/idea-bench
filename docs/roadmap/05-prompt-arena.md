# Plan 05 — Prompt Arena

> Status: Drafted, not approved. Depends on Plan 04 (Arena Modes
> Foundation) and Plan 01 (Multi-Mode Evaluation).
> Last updated: 2026-04-28.
> See [roadmap README](./README.md) for cross-plan context.

## Context

Today ModelArena answers "which model writes the best email?" The
operator brings prompts; we vary the model. The dual question is just as
common in practice and unsupported: "which way of asking the model
produces the best email?" The model is held — usually because the
operator already knows which one they're shipping, or the production
system is locked to a specific model — and we vary the prompt.

Prompt engineers and content leads iterate on prompt phrasing constantly.
A typical cycle: write three or four candidate prompts, run them on a
handful of representative inputs, judge the outputs, pick the winner.
That cycle today happens in playgrounds, spreadsheets, and Slack threads.
Prompt Arena moves it into the same blind-evaluation loop ModelArena
already runs for models, with the same shareable URL, simulated runs,
and ratings infrastructure.

The wedge here isn't novelty — it's that the same operators running model
arenas are running prompt experiments in worse tools. Adding this kind
turns ModelArena from a model-selection product into a
prompt-iteration product, doubling the use cases per buyer.

## User-Facing Behavior

### Operator (campaign creation)

After picking **Prompt Arena** at Step 0:

1. **Basics** — name, description, categories. Identical to model arenas.
2. **Inputs** — optional list of test inputs. Each input is a short
   string (or structured `{instructions, input, outputFormat}` like
   today's prompts) that gets substituted into every variant's
   `{{input}}` token. Empty list is permitted (see Advanced); typical
   campaigns have 3–10 inputs.
3. **Variants** — at least 2 prompt variants. Each variant is a
   multiline editor with the existing TipTap rich text component.
   Variants display side-by-side as cards in a horizontal row, so
   the operator can scan differences between them. A "Diff with previous
   variant" toggle highlights edits.
4. **Pinned model** — single model picker, defaults to the most-used
   model in the operator's recent campaigns. Below the picker, an
   **Advanced settings** disclosure exposes:
   - **Pinned system prompt** (optional, multiline). Held constant
     across all variants and inputs. Use case: a sticky persona ("you
     are a customer support agent") that frames every response without
     becoming part of the variable being tested. Distinct from a
     System-Prompt Arena, where the system message *is* the variable;
     copy in the disclosure helper text spells this out.
   - `[ ] Standalone variants (no `{{input}}` substitution)` — variants
     run as-is, ignoring Inputs. Use case: comparing fully-formed
     prompts that don't share a template.
   - `[ ] Run across multiple models` — disabled, badge **Coming soon**.
     UI only; no backend support in V1.
5. **Voting mode default** — Best-of-N (see below). Operator can change
   per-input prompt via Plan 01's mode picker, with the same caveats.
6. **Generate / Launch** — unchanged.

The minimum **2 variants** rule is firm; the bracket-only ≥4 rule no
longer applies because Best-of-N handles arbitrary N. If the operator
explicitly picks Tournament mode, the ≥4 rule kicks back in.

### Voter

The voter sees outputs from each variant (anonymized as "Response A",
"Response B", …) for one input at a time, then advances to the next
input. The voter never sees the variant text itself — that would defeat
blinding. They see the input as plain text above the responses, framed
like:

> **Input:** Here's a customer email — please draft a polite refusal.
>
> **Which response would you ship?**
>
> [ Response A ] [ Response B ] [ Response C ]

The interaction shape is dictated by Plan 01's voting modes; only the
labelling differs. Voter URL stays `/vote/<slug>`.

### Leaderboard

Per-input drilldown plus an across-input rollup. The default view is
"Across all inputs," computed by Bradley-Terry over the full set of
votes. A per-input table is one click away. Variants are displayed by
their operator-assigned `display_name` (defaults to "Variant 1", "Variant
2", … but editable).

A side panel renders each variant's full text — the operator wants to
read the winner, not just see "Variant 3 won." Generations from each
variant are linked from the leaderboard rows.

### Default voting mode

**Best-of-N**. Rationale: prompt arenas typically have 2–5 variants
(operators don't iterate 12 versions); voters comparing all variants on
the same input is the natural shape; produces a chosen-variant rate per
input directly. Tournament works for exactly 4 variants and is one click
away. Slider works when the operator wants absolute scores, e.g., on
quality rubrics.

Multi-Axis is a strong fit when the operator already knows the
dimensions they care about (correctness, tone, brevity). Worth surfacing
in the mode picker copy.

## What's reused vs. new

| Surface | Status |
|---|---|
| Database schema | Reuses Plan 04's foundation. No new tables. |
| Voting modes | All six work as-is. |
| Bradley-Terry pipeline | Unchanged — ranks contestants. |
| Simulated runs | Work immediately. Persona panels especially valuable here ("which prompt does the Skeptical CFO prefer?"). |
| Exports | Column "Model" → "Variant" per-kind. Otherwise identical. |
| Voter dedup | Unchanged — same participant cookie. |
| Operator dashboard | Reuses campaign-list and detail views. Header pill shows "Prompt arena" badge. |

New work, all UI:

- **Step 0** kind picker on campaign creation.
- **Variants step** with side-by-side editors and the Standalone-variants
  toggle.
- **Pinned model** UI with the disabled cross-model toggle.
- **Per-input drilldown** on the dashboard leaderboard.
- **Variant text panel** on the leaderboard.
- **Onboarding copy** for `kind='prompt'` (lands via the onboarding
  feature; this plan only contributes the copy).

## Templating and held-constant context

Single-token substitution — `{{input}}` — in V1. Rules:

- Exactly the literal token `{{input}}`. No whitespace tolerance, no
  alternate spellings. Documented in the editor's helper text.
- If a variant contains `{{input}}` and the campaign has no inputs, the
  campaign is rejected at activate-time with a clear error.
- If a variant has no `{{input}}` and the campaign has inputs, the input
  is appended after a blank line. This is intentional — operators
  iterating on phrasing often forget the token, and the natural fallback
  is "the input goes at the end."
- Standalone-variants mode skips substitution entirely; inputs are
  ignored.

**Where context lives.** Two distinct held-constant slots, deliberately
kept separate:

- **Per-input situational context** uses the existing `prompts.context`
  field. Captures input-specific framing — "the customer is angry about
  a refund" — that should be present alongside that input regardless of
  variant. Edited per-input in the Inputs step.
- **Campaign-level system message** uses the new
  `campaigns.pinned_system_prompt` (Plan 04). Captures the sticky
  persona or stance — "you are a customer support agent" — held
  constant across every variant *and* every input. Edited once in the
  Advanced settings disclosure.

Variants do **not** carry their own context or system message. That
constraint is intentional: the variant is the variable, and the
variable is the user-facing prompt. An operator who wants per-variant
system messages is running a System-Prompt Arena, not a Prompt Arena.
Inline help text in the variant editor reinforces this.

V2 (deferred): named slots like `{{customer_email}}` + `{{instruction}}`.
Useful but requires a richer test-case shape; not blocking V1.

## Validation rules

- Variants ≥ 2.
- Inputs ≥ 0 (empty allowed, but only with Standalone-variants on, or
  with all variants having no `{{input}}` token).
- Variant text length ≤ 8000 chars (matches today's prompt limit).
- Pinned model must be in the registry and currently selectable.
- `display_name` per variant ≤ 60 chars; defaults to "Variant N" if
  blank.

## Surfaces touched

| File / area | Change |
|---|---|
| `src/pages/CreateCampaign.tsx` | Variants step, pinned model picker, advanced disclosure |
| `src/pages/CampaignDashboard.tsx` | Variant text panel, per-input drilldown, "Prompt arena" header pill |
| `src/components/prompt/PromptDisplay.tsx` | Per-kind labelling helpers |
| `src/server/routes/campaigns/generate.ts` | Templating renderer |
| `src/server/campaigns/detail.ts` | Per-kind dashboard payload |
| `src/server/campaigns/export.ts` + `export-xlsx.ts` | Column headers |
| `src/server/simulated-runs/judge-calls.ts` | Verify prompt rendering composes correctly |

Tests:
- `src/server/__tests__/`: templating renderer (token, no-token,
  standalone), validation rules, simulated-run behavior on a
  prompt-arena campaign.
- `src/pages/__tests__/`: variants step renders, advanced disclosure
  toggles, leaderboard variant panel.

## V1 scope

- Single pinned model.
- `{{input}}` single-token templating.
- Standalone-variants advanced toggle.
- Cross-model toggle wired but disabled (Coming soon).
- Best-of-N default mode; operator can switch.
- Per-input drilldown + across-input rollup.

## Deferred / out of scope

- Cross-model fan-out (UI present, ships post-V1).
- Named-slot templating (`{{customer_email}}`).
- Variant version history / branching. The Plan 03 Collections work
  may eventually cover this; if not, a follow-up.
- Auto-generated variant suggestions (LLM-rewrite of a base prompt). A
  good idea but a different product surface.
- Diff visualization across more than two variants. V1 ships
  pairwise-vs-previous; an N-way diff is a polish item.

## Risks

- **Operators conflate variant identity with input identity.** Voters
  see "Response A" but operators reading the leaderboard need to know
  which variant won, where, by how much. Mitigation: make the variant
  text panel always-visible (default expanded) on the leaderboard.
- **Empty inputs + token-bearing variants is a confusing failure.**
  Mitigation: validate at activate-time, not at vote-time. Inline
  error in the launch step.
- **Variants too long to compare visually.** Side-by-side cards work
  for 200-char prompts and get unwieldy at 2000+ chars. Mitigation:
  collapse-by-default for long variants with a "Compare" view that
  opens a focused modal with two variants side-by-side.

## Resolved decisions

Captured from the 2026-04-28 review pass; previously listed as open.

- **Variant naming**: editable per-variant `display_name`, defaulting to
  "Variant 1", "Variant 2", … Operator-only — voters never see the
  names regardless (preserves blinding, especially important in orgs
  where colleagues recognize each other's phrasing).
- **Held-constant context**: per-input context lives on
  `prompts.context` (situational framing); campaign-level system
  message lives on `campaigns.pinned_system_prompt`. Variants do not
  carry their own context or system message — keeping the kinds
  conceptually clean is more valuable than flexibility within a kind.
