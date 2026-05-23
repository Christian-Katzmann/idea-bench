# Public-Prep Decision Memo — ModelArena

**Step:** 1.1 (public-github-prep campaign)
**Date:** 2026-05-23
**Author:** /grill-me pass (autonomous)
**Status:** Locked. Downstream steps (esp. Phase 4 README + Phase 5 repo rename) read from this file.

This memo locks the four soft decisions that the rest of the campaign depends on. Decisions are deliberately terse — the *grill* is in the rationale paragraphs, not in a transcript.

---

## 1. GitHub repo name & rename vs fresh-create

**Decision: rename in place** — `Christian-Katzmann/-dea.com` → `Christian-Katzmann/modelarena`.

**Slug:** `modelarena` (all lowercase, no hyphen, no diacritic). The product name *is* the repo name; the README hero will spell it "ModelArena" but the URL stays simple. Two-word camel forms (`model-arena`, `Model-Arena`) were rejected — every visible reference today is the single-word "ModelArena", and a clean slug copies/pastes/curls without surprises.

**Mechanism:** GitHub Settings → Repository name → rename. GitHub maintains a permanent redirect from the old slug, so any straggling local clones (Christian's working copy, the Vercel project's `github` integration) keep pulling without re-wiring. After rename, update the local remote with `git remote set-url origin git@github.com:Christian-Katzmann/modelarena.git`.

**Why not fresh-create:**

- The repo is **still private**. There are no stars, forks, issues, or external watchers to preserve — but there is also nothing to lose by renaming. The "preserve history" argument is neutral.
- Fresh-create means re-wiring Vercel's GitHub integration, redoing branch protection from scratch, and risks orphaning the `public-prep` branch the campaign is built on. That's three risks for zero practical upside.
- The `-dea.com` slug came from a URL-encoding accident on the Unicode "ï" in `ïdea.com`. A rename buries it; a fresh repo plus a public-archive of the old one would *advertise* the accident.

**What this does NOT decide:** whether GitHub's "Christian-Katzmann" user namespace is the right home (vs. an `idea-com` org). Out of scope for Step 1.1 — the rename can move *into* a new org later with the same redirect mechanic. If Christian ever wants an org, do it after the public flip, not as a gating decision now.

---

## 2. README hero positioning (one paragraph)

**Decision:** lead with the **behavior**, not the **buyer**. The internal roadmap's pitch — *"Configurable Human Evaluation for AI Products … Buyer. VP Product, Head of Content, Head of AI"* — is a B2B SaaS deck. A stranger landing on a self-hostable GitHub README is not a buyer; they're a builder evaluating whether to spend an evening on this.

**Public hero paragraph (drop-in for README.md, ~70 words):**

> **ModelArena** is a self-hosted tool for running blind head-to-head evaluations of LLM output. Build a campaign, paste in a prompt and a couple of contestants (models, system prompts, or prompt variants), share a link, and let real people — or simulated personas — vote on which response is better without seeing which model produced it. The result is a Bradley-Terry rating you can actually defend in a meeting. Works with any model via OpenRouter.

**What this hero deliberately does:**

- **Says "self-hosted" in the first sentence.** That's the audience's single most important filter — half the readers will bounce on "SaaS-only" if they don't see this immediately.
- **Says "blind" twice (implicitly via "head-to-head" + explicitly).** Blindness is the product's structural promise; voters never see model identity. That's the bit no spreadsheet replicates.
- **Names three contestant kinds.** Reflects Plans 04–06 already shipping (kinded experiments). A stranger sees "this isn't just model bake-offs, I can evaluate my system prompts too" without us having to spell it out.
- **Mentions personas in passing, not as the lede.** Personas are the wedge feature internally, but a stranger needs the core blind-voting story landed before "simulated panels" makes sense. One word ("personas") plants the flag; the dedicated section sells it later.
- **"Bradley-Terry rating you can defend in a meeting"** is the operator's payoff. Not "AI-quality scoring" — concrete enough that someone who's run a campaign before recognizes themselves.
- **Mentions OpenRouter in the last sentence, not omitted.** Rationale: for a self-host audience, OpenRouter is a *cognitive-load reducer*, not a coupling. "One API key, any model" beats "you choose your provider" every time for someone who just wants to start. Model-agnosticism stays true (Anthropic/OpenAI/local can be plumbed if anyone asks) but the default path is OpenRouter and the README should say so.

**What the README hero does NOT do:**

- **Does not call out idëa.com as the origin story.** ModelArena ships as a clean product. Christian's company name belongs in the LICENSE copyright line and maybe a single line in CONTRIBUTING; not in the hero. (Reasoning: an "originally built at idëa.com" line in the hero quietly tells strangers "this is one team's internal tool we open-sourced" — which lowers their expectation of community support. Cleaner to introduce the product on its own merits and let curious readers find the origin via commit history.)
- **Does not name the buyer persona.** "VP Product / Head of Content" disappears entirely from public docs. If we want it back later for landing pages, that's a marketing surface, not a README.
- **Does not mention multi-mode evaluation, simulated runs, prompt collections by name.** Those are the roadmap; the hero is the present tense.

**The "30-second test":** if a stranger reads only this paragraph, they know (a) what it does, (b) that they can run it themselves, (c) what's distinctive about it (blind), (d) what they get (rating), and (e) how it talks to LLMs. Five facts in 70 words. Nothing about the company, nothing about the buyer, nothing about the future.

---

## 3. Hero screenshot

**Decision: two screenshots in the README hero region.**

**Primary (above the fold):** `vote-play-blind-pair-b5c6d7.png` — the blind voting interface, two model generations side by side with A / B / Tie / Both-bad buttons and token counts. This is the product's most distinctive surface — every eval tool has a dashboard, but the clean blind-tournament UI is what ModelArena specifically *is*. The audit confirmed this surface is verified-clean (no model-identity leak in DOM or API response).

**Secondary (just below):** `campaign-detail-active-c0d1e2.png` — the operator campaign view with the leaderboard tab visible (Bradley-Terry ratings, multiple models, group-alignment column). This closes the loop for the GitHub reader (who is the operator, not the voter): "here is what your participants do; here is what you get out the other side."

**Why two, not one:**

- The product has two sides. One screenshot tells half the story.
- A single voter screenshot lands "what is this?" but not "why bother?" — the reader needs the payoff before they'll clone.
- A single operator screenshot lands "this is an eval tool" but blends into every other ratings dashboard on the internet. The blind UI is the differentiator.
- Two well-placed screenshots is standard idiom in 2026 OSS READMEs (see chat-sdk, langchain-ui, etc.). Strangers expect it.

**Rejected alternatives:**

- `dashboard-pulse-tab-6a7b8c.png` (operator home with stats / movement feed) — looks generic; doesn't reveal what the product does.
- `vote-personal-results-c6d7e8.png` (participant results) — F-006 minor (huge CI on tiny sample) means the visible numbers are misleading without context. Wait for Phase 3 to clean this up before featuring it.
- `personas-library-aebfc0.png` (persona library) — too feature-specific for the hero; better as an in-line illustration in a "Simulated Panels" subsection.

**One screenshot to use IF Christian later prefers a single hero:** the **blind voting interface**. Operator dashboards look like every other dashboard; the blind A/B UI is the identity.

**Production note for Phase 4.3:** the audit screenshots are 1280-wide PNGs taken from the running dev server. Acceptable for README — no need to re-shoot. They live in `audit-2026-05-23T18-00-00Z/evidence/` and should be copied into `docs/img/` (or `assets/readme/`) before the audit folder gets archived; do not reference the audit folder path from the README.

---

## 4. docs/ triage

The principle: a stranger cloning the repo should see docs that **help them use or contribute**. Internal handoffs, dated implementation plans, UX audits, and roadmap-as-product-strategy are agent-and-team artifacts that pollute the contributor surface. Move them under `.archive/` (which Phase 5.1 may gitignore or prune).

### Keep — these go public as-is or with minor polish

| Path | Action | Reason |
|---|---|---|
| `docs/design-system/DESIGN-SYSTEM.md` | **Keep** | Genuine contributor doc — tokens, components, conventions. Useful to anyone touching UI. |
| `docs/desktop-launcher.md` | **Keep** | Real user-facing capability (Mac Dock launcher). Should be linked from README under "Optional: macOS desktop app". |

### Keep with edits — public-facing but currently mis-toned

| Path | Action | Reason |
|---|---|---|
| `docs/roadmap/README.md` | **Rewrite, then keep** | Currently contains "Buyer: VP Product, Head of Content, Head of AI" — pure B2B language. Rewrite as a short, public "Where this is going" page (3 bullets max, no buyer personas, no positioning axes). Drop the M1–M9 sequencing table; that's internal. |
| `README.md` (project root) | **Rewrite in Phase 4.3** | Current README is operator/dev-onboarding flavored. Phase 4.3 replaces the hero with §2 above, keeps the operator-auth + scripts sections lower down. |

### Archive — useful history, not public

Move to `.archive/` (preserve git history; do not delete outright — Christian or a future agent may want to grep them later).

| Path | Destination | Reason |
|---|---|---|
| `docs/desktop-launcher.appify-report.md` | `.archive/docs/` | One-shot artifact from the `/appify` skill run. Not user-facing; describes a process, not a feature. |
| `docs/roadmap/01-multi-mode-evaluation.md` | `.archive/roadmap-internal/` | Implementation plan with internal milestone numbering. Useful internally; not public docs. |
| `docs/roadmap/02-simulated-runs.md` | `.archive/roadmap-internal/` | Same. |
| `docs/roadmap/03-prompt-collections-and-duplication.md` | `.archive/roadmap-internal/` | Same. |
| `docs/roadmap/04-arena-modes-foundation.md` | `.archive/roadmap-internal/` | Same. Foundation already shipped per `plans/done/`. |
| `docs/roadmap/05-prompt-arena.md` | `.archive/roadmap-internal/` | In-progress plan (per `plans/active/`). |
| `docs/roadmap/06-system-prompt-arena.md` | `.archive/roadmap-internal/` | Per `plans/done/`. |
| `docs/roadmap/HANDOFF-PLAN-02.md` | `.archive/roadmap-internal/` | Cross-session handoff document. Internal-flavored by definition. |
| `docs/superpowers/plans/2026-04-17-operator-sidebar-pages.md` | `.archive/superpowers/plans/` | Dated implementation plan. |
| `docs/superpowers/specs/2026-04-17-operator-sidebar-pages-design.md` | `.archive/superpowers/specs/` | Companion design spec. |
| `docs/ux-reports/arena-onboarding-forensic.md` | `.archive/ux-reports/` | Internal UX audit with action items already shipped. Useful as a process artifact, noise as a contributor doc. |
| `audit-2026-05-23T18-00-00Z/` (root) | `.archive/audits/` | The product-walkthrough run that drove this campaign. Copy hero/screenshot PNGs to `docs/img/` first, then archive the whole folder. |
| `plans/active/`, `plans/done/` (root) | `.archive/plans/` | Internal in-flight and shipped implementation plans (Plans 04, 05, 06). Mirror of `docs/roadmap/` numbering. Same logic applies. |
| `campaigns/` (root) | `.archive/campaigns/` | The Campaigns app artifacts (this very campaign markdown lives here). Internal workflow tool output — not public. |
| `AGENTS.md` (root) | **Keep with edits, or archive** | Decision deferred to Phase 4.3 — if it documents how AI agents should operate in the repo (CLAUDE.md style), keep. If it's a personal scratchpad, archive. Inspect during README rewrite. |

### Delete — outright

None. The cost of preserving anything in `.archive/` is one folder and a `.gitignore` line; the cost of deleting something Christian later wants is non-zero. Archive aggressively; delete nothing in this pass.

### What to do AFTER triage moves

1. Add `.archive/` to `.gitignore` only if the campaign explicitly wants the archive out of the public tree. **Default recommendation: commit `.archive/` to the public repo.** Burying internal docs in git history is a form of dishonesty; visibly archiving them ("here's the work that led here") is more honest and costs almost nothing — the directory is just plain markdown. Phase 5.1 (secret-history audit) is the gate that determines whether anything in `.archive/` contains sensitive data; if so, redact, don't gitignore.

2. After moves, run `grep -r "docs/roadmap/0" docs/ README.md` to find any lingering internal links. Update or remove them in Phase 4.3.

3. Update the README's "see also" or footer to point at the surviving public docs (`docs/design-system/DESIGN-SYSTEM.md`, `docs/desktop-launcher.md`, rewritten `docs/roadmap/README.md`).

---

## Cross-references for downstream steps

- **Step 4.3 (README rewrite + screenshots + docs triage)** is the primary consumer of this memo. Sections 2, 3, and 4 are drop-in.
- **Step 5.1 (secret audit, demo-data cleanup)** should grep the archived files for any leaked secrets before deciding whether `.archive/` ships public.
- **Step 5.2 (rename + flip public)** executes §1. The rename happens *after* Phase 4 ships and *before* the public flip — the order matters so the public-facing URL is correct from the first commit anyone sees.

---

## Decisions explicitly NOT made here

- **`AGENTS.md` keep-or-archive** — deferred to Phase 4.3 where the file is actually read.
- **Whether to add a `marketing/` or `landing/` directory for a future product site** — out of scope; this campaign is the GitHub release, not the marketing surface.
- **Whether to maintain a public CHANGELOG** — deferred. Phase 4.1 (LICENSE + CONTRIBUTING + SECURITY + CODE_OF_CONDUCT) can revisit; not required for the first public flip.
- **Domain / homepage URL in the GitHub repo settings** — Phase 5.2 decision (after Christian decides if `modelarena.dev` or similar gets registered). Not load-bearing for the README.
