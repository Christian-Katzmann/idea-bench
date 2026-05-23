# UX Forensic Report

## metadata
- target: component "ArenaOnboarding" (first-visit onboarding modal on the model-arena campaign dashboard)
- context: non-technical operators (PMs, content leads, brand managers) opening a campaign for the first time. Goal: in ~30s communicate (1) what kind of arena this is, (2) how it works, (3) what to do next.
- inputs used: source code (`src/components/onboarding/arena-onboarding.tsx`, `src/pages/CampaignDashboard.tsx`, `src/lib/arena-kind.ts`), live DOM/computed-style probes via the running Vite dev server, screenshots at desktop / mobile / dark mode for steps 1 and 3.
- constraints: Base UI Dialog primitive only; existing Tailwind tokens (`border`, `surface-highlight`, `foreground`, `muted-foreground`, `font-heading`, `card`, `muted`); no new dependencies; localStorage-only persistence keyed `arena-onboarding-dismissed-v1:<kind>`; help-button re-trigger must bypass the dismiss flag.
- audit depth: forensic

---

## 0) executive snapshot

**What this UI is trying to accomplish.** Teach a non-technical operator, in three short reads, what a model arena is and what they can do next — once, dismissibly, before they start poking around the dashboard.

**Biggest UX failures (top 5, blunt).**

1. **Initial focus lands on Skip.** The Floating-UI focus manager auto-focuses the first tabbable button — `Skip`. A user who hits Enter the moment the dialog opens (extremely common) destroys the entire onboarding without seeing one word of content.
2. **Disabled Back button is rendered, takes space, and is in the tab order on step 1.** It contributes nothing on step 1 except clutter and an extra tab stop.
3. **Dark-mode contrast is broken.** The inner step "card" uses `bg-surface-highlight/40` which over the dark `bg-card` produces a near-invisible 1.0:1-ish contrast against the dialog itself; body copy in `text-muted-foreground` (rgb 168/164/156) fails AA against the dark step container background.
4. **The "Don't show again" checkbox only appears on step 3.** An operator who decides "I've got it" mid-flow has to either Skip (which doesn't suppress) or click Next twice to reach the suppression toggle. There is no early-exit path that also suppresses.
5. **Progress indicator lies on the last step.** All three segments are filled equally at step 3/3, so the current step is visually identical to completed steps. The bar adds chrome without adding state.

**Biggest wins available (top 5, blunt).**

1. **Move initial focus to Next** (or to the dialog body, or — better — to a primary "Got it" CTA). One-line fix; eliminates the destroy-with-Enter footgun.
2. **Hide Back on step 1** and Next on the last step (currently swapped for the CTA — keep that). Either hide the disabled control entirely, or render only the controls that have meaning at this step.
3. **Promote suppression to a one-click "Don't show me this again" link in the footer of every step**, separate from the Skip ghost button. Lets the user dismiss-and-suppress without walking the whole flow.
4. **Re-token the inner step card for dark mode.** Either drop the inner card entirely (let body copy breathe inside the dialog) or use a token that has visible contrast in both themes (e.g. `bg-muted/40` with a real border, or no background at all).
5. **Cut the headline "Welcome to your model arena."** Replace with a concrete one-liner — "How a model arena works" — that doesn't presume freshness (the operator may have created this campaign weeks ago and just opened it for the first time).

**Do first (30 / 60 / 90 minutes).**

- **30 min:** Move initial focus off Skip; hide disabled Back/Next; replace the inner step card background with one that holds contrast in both themes; rename the final-step CTA from "Got it, take me to the dashboard" → "Got it" (they're already on the dashboard).
- **60 min:** Lift the suppression toggle out of step 3 into a footer-level "Don't show this again" link visible from any step; differentiate current vs completed segments in the progress bar; rewrite the welcome header to be situation-neutral ("How a model arena works"); rewrite step 3 body to be action-oriented (explicit verbs: "Activate", "Share", "Recompute").
- **90 min:** Wire `prefers-reduced-motion` parity for the dialog enter/exit; add a polite live region that announces the *step body title* on transition (not just "Step X of Y"); add a small caveat under the suppression toggle so the operator knows the Help button stays available; verify Help button discoverability — promote from icon-only to icon + "How it works" text.

---

## 1) inventory map

### 1.1 component tree

- **P-001** `<ArenaOnboarding>` mounted by `CampaignDashboard`
  - **R-010** Trigger surface (in `CampaignDashboard.tsx`, not in the component itself)
    - **C-011** Help button — `<Button variant="ghost" size="icon-sm" aria-label="Show arena onboarding">` in `PageHeader` action slot
      - **A-011a** `HelpCircle` icon
      - **A-011b** Native `title="What is this?"` tooltip
  - **R-020** First-visit auto-open effect (`useEffect` reading localStorage in `CampaignDashboard`)
    - **C-021** localStorage read of `arena-onboarding-dismissed-v1:model`
    - **C-022** localStorage write on suppress-dismiss
  - **R-030** `<Dialog>` root (Base UI, controlled `open`)
    - **R-031** Backdrop / overlay
      - **A-031a** `onOpenChange(false)` ⇒ `handleClose(false)` (Skip-equivalent)
    - **R-032** `<DialogContent>` popup
      - **R-040** Header region
        - **C-041** Decorative icon tile — 40×40 rounded square, `Sparkles` lucide icon
        - **C-042** `<DialogTitle>` — "Welcome to your {label}"
        - **C-043** `<DialogDescription>` — "A quick walkthrough so you know what you're looking at. Takes about 30 seconds."
      - **R-050** Body region
        - **R-051** Step indicator row
          - **C-051a** Text label "Step X of Y" — uppercase, tracking 0.14em, `text-[11px]`
          - **C-051b** Progress bar with N segments (`role="progressbar"`)
          - **A-051c** `aria-live="polite"` on the row wrapper
        - **R-052** Step body card — bordered, `bg-surface-highlight/40`
          - **C-052a** Step title `<h3 font-heading>`
          - **C-052b** Step body `<p text-muted-foreground>`
          - **A-052c** `id="arena-onboarding-step-{index}"` (referenced from `aria-describedby`)
        - **C-053** Suppression checkbox row (last step only)
          - **A-053a** Native `<input type="checkbox">` — defaulted checked
          - **A-053b** Label "Don't show this again on new {label}s"
      - **R-060** Footer region
        - **C-061** Skip button — `variant="ghost"`, leftmost (rightmost on mobile due to `flex-col-reverse`)
        - **C-062** Back button — `variant="outline"`, disabled on step 1
          - **A-062a** `ArrowLeft` icon
        - **C-063** Next button (steps 1 / 2) OR final CTA (step 3)
          - **A-063a** `ArrowRight` icon (Next variant only)
          - **A-063b** Final CTA label from `content.finalCta?.label` or `'Done'`
  - **R-070** Animation chrome (Base UI / tw-animate-css)
    - **A-071a** `data-open:animate-in fade-in-0 zoom-in-95`
    - **A-071b** `data-closed:animate-out fade-out-0 zoom-out-95`
    - **A-071c** Backdrop fade
  - **R-080** Persistence model
    - **C-081** `arenaOnboardingStorageKey(kind)` helper
    - **C-082** Versioned key prefix `arena-onboarding-dismissed-v1`

### 1.2 element register

#### Element ID: C-011 — Help button
- name: Help / re-trigger button
- type: control (icon button)
- location: `CampaignDashboard.tsx` → `PageHeader.action`
- user intent supported: re-open the onboarding on demand, bypassing the dismissed flag
- visible properties: 32×32 ghost icon button, `HelpCircle` lucide icon (16px), no visible text label, transparent background
- tokens/style: `variant="ghost"`, `size="icon-sm"`, color `rgb(110, 106, 98)` (text-muted-foreground)
- interactions: hover → `text-foreground` + `bg-muted/60`; native `title` tooltip "What is this?" on long hover
- states: default / hover / focus-visible (ring) / active (translate-y-px)
- a11y hooks: `aria-label="Show arena onboarding"`, role=button (implicit), focusable
- dependencies: none
- i18n risk: low — single phrase
- telemetry: unknown (no event)

#### Element ID: R-020 — First-visit auto-open effect
- name: localStorage-gated auto-open
- type: behavior (React effect)
- location: `CampaignDashboard.tsx` lines ~85-100
- user intent supported: surface the explainer the first time, never again (unless explicitly re-triggered)
- visible properties: none
- tokens/style: N/A
- interactions: runs on mount; tries `window.localStorage.getItem(arenaOnboardingStorageKey(arenaKind))`; opens modal if absent
- states: catches throw (private mode / strict cookie modes) → silently does nothing
- a11y hooks: N/A
- dependencies: `localStorage`, `arenaKind` constant currently hardcoded `'model'`
- i18n risk: none
- telemetry: unknown

#### Element ID: R-030 — Dialog root
- name: Base UI Dialog (modal)
- type: container (modal)
- location: top of component
- user intent supported: focus capture + backdrop dismiss
- visible properties: full-screen backdrop (`bg-foreground/40`, `backdrop-blur-sm`), centered popup
- tokens/style: backdrop `bg-foreground/40 backdrop-blur-sm`; popup `bg-card border-border rounded-xl p-6 shadow-2xl sm:max-w-lg`; computed dialog bg light = `rgb(255, 255, 255)`, dark = `rgb(22, 21, 18)`; width clamped 462px on desktop
- interactions: click backdrop / press Esc → `onOpenChange(false)` → calls `handleClose(false)` (does not suppress)
- states: open / closed; animation classes `data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95`, mirror on close
- a11y hooks: `role="dialog"`, `aria-modal="true"` (Base UI default), `aria-labelledby` from DialogTitle, `aria-describedby` overridden to step body id; focus trapped via `FloatingFocusManager`
- dependencies: Base UI `@base-ui/react/dialog`
- i18n risk: none
- telemetry: unknown

#### Element ID: C-041 — Decorative icon tile
- name: Sparkles tile in header
- type: feedback (decoration)
- location: header row, before title
- user intent supported: none beyond visual anchor
- visible properties: 40×40 (size-10) square, rounded-lg, border, `bg-surface-highlight`, `Sparkles` icon at 20px
- tokens/style: `border-border`, `bg-surface-highlight`, `text-foreground`
- interactions: none
- states: default only
- a11y hooks: `aria-hidden="true"` on the tile (good); icon inherits hidden
- dependencies: none
- i18n risk: none
- telemetry: N/A

#### Element ID: C-042 — DialogTitle
- name: "Welcome to your {label}"
- type: text (heading)
- location: header right column, top
- user intent supported: orient the user to the topic
- visible properties: `font-heading`, `text-lg`, `font-semibold`, `leading-tight`, `text-foreground`
- tokens/style: see above
- interactions: none
- states: default only
- a11y hooks: serves as `aria-labelledby` for the dialog
- dependencies: `content.label`
- i18n risk: medium — "Welcome to your model arena" is 30 chars; longer translations + concatenation will wrap on mobile (already wraps to 2 lines at 375px)
- telemetry: N/A

#### Element ID: C-043 — DialogDescription
- name: "A quick walkthrough so you know what you're looking at. Takes about 30 seconds."
- type: text (paragraph)
- location: header right column, below title
- user intent supported: set expectations on length and purpose
- visible properties: `text-sm`, `text-muted-foreground`; computed color light `rgb(110,106,98)`, dark `rgb(168,164,156)`
- tokens/style: dark-mode contrast against the dialog `rgb(22,21,18)` ≈ 5.6:1 — passes AA for normal text but feels washed out
- interactions: none
- states: default only
- a11y hooks: serves as `aria-describedby` for the dialog (overridden by component to step body)
- dependencies: hardcoded copy
- i18n risk: medium — long sentence; concrete but bordering on filler for sighted users
- telemetry: N/A

#### Element ID: C-051a — "Step X of Y" label
- name: step counter
- type: text (meta)
- location: top of body region
- user intent supported: tell the user where they are in a finite flow
- visible properties: 11px, uppercase, tracking 0.14em, `text-muted-foreground`, `font-medium`
- tokens/style: `text-[11px] font-medium uppercase tracking-[0.14em]`
- interactions: none
- states: re-renders on step change (text changes, no animation)
- a11y hooks: inside `aria-live="polite"` wrapper
- dependencies: `stepIndex`, `total`
- i18n risk: low (numbers are universal, "Step" / "of" are short)
- telemetry: N/A

#### Element ID: C-051b — Progress bar
- name: 3-segment progress bar
- type: feedback (progress)
- location: right of step counter, fluid width
- user intent supported: visual where-am-I
- visible properties: N horizontal `h-1` rounded-full segments separated by gap-1; segments where `i <= stepIndex` use `bg-foreground`, others `bg-border`
- tokens/style: `bg-foreground` vs `bg-border`, `h-1`, `rounded-full`, `transition-colors`
- interactions: animates color on transition
- states: every segment fills cumulatively — current step is indistinguishable from completed
- a11y hooks: `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`
- dependencies: `content.steps.length`, `stepIndex`
- i18n risk: none
- telemetry: N/A

#### Element ID: A-051c — `aria-live="polite"` wrapper
- name: live region announcing step changes
- type: a11y hook
- location: wraps step indicator row
- user intent supported: screen-reader announcement of progress
- visible properties: none
- tokens/style: none
- interactions: any text/state change inside fires a polite announcement
- states: announces "Step 2 of 3" + the progress bar's accessible name on every change
- a11y hooks: `aria-live="polite"`
- dependencies: live-region siblings
- i18n risk: none
- telemetry: N/A

#### Element ID: R-052 / C-052a / C-052b — Step body card + title + body
- name: inner content card
- type: container + headings + paragraph
- location: body region, below indicator
- user intent supported: deliver the actual lesson
- visible properties: rounded-lg, `border border-border`, `bg-surface-highlight/40`, `px-4 py-3`; title 16px font-heading semibold; body `text-sm leading-relaxed text-muted-foreground`
- tokens/style: dark-mode background computed `oklab(0.235772 0.000771545 0.00803898 / 0.4)` over dialog `rgb(22,21,18)` — ~indistinguishable from dialog. Body copy `text-muted-foreground` against this background ≈ ~3.0-3.5:1 (estimated), borderline for AA normal text.
- interactions: content swaps when stepIndex changes — no enter/exit animation, content just changes in place
- states: 3 content variants (one per step)
- a11y hooks: `id="arena-onboarding-step-{i}"` referenced by dialog's `aria-describedby`
- dependencies: `step.title`, `step.body`
- i18n risk: medium — long sentences in current copy
- telemetry: N/A

#### Element ID: C-053 — Suppression checkbox
- name: "Don't show this again on new {label}s"
- type: control (checkbox)
- location: below step body card, only on `isLast`
- user intent supported: opt out of future first-visit auto-opens
- visible properties: native checkbox `size-3.5`, `accent-foreground`; label 12px
- tokens/style: native `<input>`, no custom styling beyond size and accent
- interactions: changes `dontShowAgain` state; only consumed when the user clicks the final CTA
- states: checked by default; preserved across step navigation while open; resets to checked on each modal open
- a11y hooks: implicit label association via wrapping `<label>`; no explicit `id` / `htmlFor`
- dependencies: `isLast`
- i18n risk: medium — concatenation with `content.label.toLowerCase()` produces "model arenas" plural; may not pluralize cleanly in other locales
- telemetry: N/A

#### Element ID: C-061 — Skip button
- name: Skip
- type: control (dismiss without suppressing)
- location: footer left on desktop, bottom on mobile
- user intent supported: bail out without permanently suppressing
- visible properties: `variant="ghost"`, `size="sm"`; just the word "Skip"
- tokens/style: ghost (low emphasis)
- interactions: click → `handleClose(false)`
- states: default / hover / focus / active
- a11y hooks: focusable; **first tabbable element in the dialog → receives initial focus from FloatingFocusManager**
- dependencies: none
- i18n risk: low

#### Element ID: C-062 — Back button
- name: Back
- type: control (step navigation)
- location: footer center, immediately before Next
- user intent supported: return to previous step
- visible properties: `variant="outline"`, `size="sm"`, `ArrowLeft` icon, "Back" text
- tokens/style: outline with border
- interactions: click → `setStepIndex(i => max(0, i-1))`
- states: **disabled on step 1** but still rendered and present in tab order; otherwise default / hover / focus
- a11y hooks: `disabled` attribute
- dependencies: `stepIndex`
- i18n risk: low
- telemetry: N/A

#### Element ID: C-063 — Next / final CTA
- name: Next OR final CTA
- type: control (step navigation OR primary action)
- location: footer right
- user intent supported: advance, then complete
- visible properties: `variant="default"` (dark filled), `size="sm"`; on Next: "Next" + `ArrowRight`; on last step: `content.finalCta?.label` ("Got it, take me to the dashboard")
- tokens/style: default / primary
- interactions: Next → `setStepIndex(i => min(total-1, i+1))`; final → `handleClose(dontShowAgain)`
- states: default / hover / focus / active
- a11y hooks: focusable
- dependencies: `isLast`, `dontShowAgain`, `content.finalCta`
- i18n risk: medium — "Got it, take me to the dashboard" is long; on a 375px viewport it nearly fills the row

#### Element ID: R-070 — Animation chrome
- name: open / close animation
- type: motion
- location: dialog content + overlay
- user intent supported: signal modal arrival
- visible properties: `fade-in-0 zoom-in-95` (150ms via dialog's `duration-150`)
- tokens/style: tw-animate-css presets
- interactions: fires on open / close
- states: default — **no `motion-reduce:` variants applied**
- a11y hooks: none related to motion
- dependencies: `tw-animate-css`
- i18n risk: none
- telemetry: N/A

#### Element ID: C-082 — Versioned storage key
- name: `arena-onboarding-dismissed-v1`
- type: persistence convention
- location: `arena-onboarding.tsx` constant
- user intent supported: forced re-show after major copy changes
- visible properties: none
- interactions: read by `CampaignDashboard` mount effect; written by `onDismiss` when `suppress=true`
- states: present (dismissed) / absent (will auto-open)
- a11y hooks: N/A
- dependencies: localStorage
- i18n risk: none
- telemetry: N/A — there's no event when an operator suppresses, completes, or skips, so we can't measure whether the onboarding works

---

## 2) interrogation protocol

### 2.1 standard atomic questions
Applied to every element above. Answers that revealed issues are surfaced in section 3.

### 2.2 context-specific questions
Generated per-element risk profile:

- **Modal (R-030)** — C1: can the user act on the dashboard underneath without dismissing? (No — modal blocks.) C2: focus return on close — does it land on the trigger element (Help button) or somewhere else? (Base UI default returns to popup-opener; for first-visit auto-open there is no opener — so focus likely falls back to `<body>`.)
- **Help button (C-011)** — C1: is the icon's meaning unambiguous? (`?` ≈ help is universal — OK.) C2: where will operators look for help? (Likely page-level, not header-action; this placement is non-obvious.)
- **First-visit auto-open (R-020)** — C1: does the open happen during a navigation (operator just arrived from "Campaigns" list)? (Yes — auto-opens before the operator has scanned the page.) C2: does the modal blank out the actual dashboard contents the operator wanted to see? (Yes, by definition of modal.)
- **Suppression checkbox (C-053)** — C1: defaulted-on is a soft dark-pattern — fair? (For operator-trust-low contexts, defaulted-on can feel presumptuous; the user clicks "Got it" expecting to dismiss, accidentally opts out of all future first-visits.) C2: is dismiss reversible? (Yes — Help button — but the user has to know it's there, and the Help button's discoverability is low.)
- **Initial focus** — C1: what does Enter do on first paint? (Triggers Skip → destroys onboarding without reading it.)
- **Mobile button stack** — C1: does the modal fit on a 320×568 viewport (smallest modern target)? (Tight — three full-width buttons + checkbox + body card pushes content close to the bottom edge.)
- **i18n risk on label concatenation** — C1: "Welcome to your model arena" / "Don't show this again on new model arenas" — does pluralization hold across locales? (No — German would need separate male/female plurals; Japanese has no plural marker; current code naively appends "s".)

---

## 3) element-by-element findings

### Element: C-011 — Help button
- current intent: re-open onboarding on demand, bypassing dismiss flag.
- observed issues:
  - Discoverability is poor — small ghost icon in the header action slot, easily missed because operators don't typically scan PageHeader actions for help.
  - No visible "Help" text — purely iconic. The native `title` only appears on long hover.
  - Lives in `PageHeader.action` instead of next to the title or as a top-of-page chip — operators searching for help look at the page chrome, not the action zone.
- key atomic answers:
  - Q4 (placed where decision happens): No — the decision "I need a primer" tends to happen near the page title, not near "Preview public page".
  - Q8 (predictable in 1 second): Marginal — the `?` icon is universal but the placement is not.
  - Q13 (safest failure): Click does nothing destructive — safe.
- context-specific answers:
  - C1: Icon is unambiguous — yes.
  - C2: Placement is suboptimal — see above.
- verdict: keep but recompose
- recommendation: Promote from icon-only to a small `variant="ghost"` button with `HelpCircle` + "How it works" text on `sm:inline`, falling back to icon-only on mobile. Place it where the operator looks for context — adjacent to the campaign title (left of `StatusBadge`), not in the right-side action zone next to the share/preview CTAs.
- proposed spec:
  - structure: `<Button variant="ghost" size="sm" onClick={() => setIsOnboardingOpen(true)} aria-label="Show arena onboarding"><HelpCircle className="size-3.5" /><span className="hidden sm:inline">How it works</span></Button>` rendered inline next to the StatusBadge in the PageHeader title slot.
  - copy: "How it works" (sm+), icon-only on mobile.
  - tokens: existing ghost variant; no new tokens.
  - interactions: same handler; tooltip "Re-open the onboarding" via existing title attribute.
  - states: default / hover / focus-visible / active.
  - a11y: keep `aria-label`; icon `aria-hidden`.
  - responsive rules: text hidden < sm, icon-only.
  - motion rules: none.
- acceptance checks:
  - The button is visible at 1440px and 375px without overflow.
  - Tab order from page title goes: title region → How-it-works → tabs.
  - Click reopens the modal regardless of localStorage state.

### Element: R-020 — First-visit auto-open effect
- current intent: surface the explainer the first time, then never again.
- observed issues:
  - Effect runs on mount with no debounce — modal pops as soon as the dashboard mounts, including during snappy navigations from the campaigns list. The user has zero time to register the dashboard's existence before the modal slams in.
  - When `arenaKind` becomes data-driven (from the campaign payload), the effect's `[arenaKind]` dependency may cause re-firing on a stale-then-fresh render, briefly flashing the modal.
  - No grace period — operator with 1 model arena who's seen onboarding gets auto-opened on every NEW kind without any warning.
- key atomic answers:
  - Q19 (transitions avoid surprise): Fails — the dashboard renders, then the modal pops on top after first paint.
  - Q44 (anxiety / consequence ambiguity): Mild — it's not destructive but the abrupt overlay over data the operator wanted to see is jarring.
- verdict: keep but defer
- recommendation: Wait for the dashboard query to land (`!isLoading && !error && data`) before triggering auto-open, so the operator at least sees the canvas behind the modal. When `arenaKind` becomes data-driven, gate the effect on `data?.campaign.arenaKind` and only open after the campaign payload is non-null.
- proposed spec:
  - structure: replace the on-mount effect with one keyed on `data?.campaign.id` (i.e. when the campaign payload arrives), guarded by `!data` early-return.
  - copy: N/A.
  - tokens: N/A.
  - interactions: same as today, but delayed by data settle.
  - states: never opens during the loading skeleton; never opens on error.
  - a11y: dialog mounts after the live region of the loading skeleton closes — no double announcement.
  - responsive rules: N/A.
  - motion rules: N/A.
- acceptance checks:
  - On a slow 3G simulation, the dashboard skeleton renders, then the dashboard, then the modal.
  - On error, no modal.
  - On localStorage-dismissed, no modal.

### Element: R-030 — Dialog (modal) container
- current intent: focus capture, backdrop dismiss, modal blocking.
- observed issues:
  - Modal is fully blocking — operator cannot inspect the page underneath without dismissing. For a soft "explainer" the friction may be excessive.
  - Backdrop click and Esc both dismiss without suppression. Acceptable, but combined with **initial focus on Skip**, the cumulative escape-without-suppression pressure is high.
  - No close (X) button (`showCloseButton={false}`) — the only ways out are Skip / Esc / backdrop / final CTA. Acceptable but no obvious "X" affordance.
- key atomic answers:
  - Q12 (immediate feedback): Modal opens with fade-zoom — fine.
  - Q22 (can it get stuck): No.
  - Q29 (color alone): Doesn't rely on color.
- context-specific answers:
  - C1: Modal blocks underlying interaction — yes.
  - C2: Focus return on close — Base UI returns to opener; on first-visit auto-open there is no opener, so focus may drop to body. After moving the Help button per C-011 recommendation, the help button becomes the implicit "owner" but won't receive focus on first-visit close.
- verdict: keep but harden
- recommendation: After Skip / final-CTA / Esc / backdrop close, programmatically move focus to the new "How it works" Help button so the operator immediately sees that re-entry exists. This also gives screen reader users a continuity cue.
- proposed spec:
  - structure: pass a `triggerRef` prop or use a callback ref on the Help button; after `onDismiss`, call `triggerRef.current?.focus()` inside a `requestAnimationFrame` to wait for the dialog unmount.
  - copy: N/A.
  - tokens: N/A.
  - interactions: focus moves visibly to Help button on close.
  - states: focus visible ring appears on the Help button after dismiss.
  - a11y: focus restored deterministically.
  - responsive rules: N/A.
  - motion rules: N/A.
- acceptance checks:
  - After Skip, focus ring is visible on Help button.
  - Tab from there moves into the page chrome predictably.

### Element: C-041 — Sparkles tile
- current intent: visual anchor for the header.
- observed issues:
  - Generic "magic AI" iconography — adds no information specific to model-arena context.
  - Adds 40px of horizontal real estate that pushes the title and description into a narrower column, exacerbating the 2-line-wrap on mobile.
- key atomic answers:
  - Q1 (problem solved): None concrete — purely decorative.
  - Q7 (visual weight matches priority): No — competes with the title.
- verdict: remove (or replace with kind-specific iconography in a later pass)
- recommendation: Drop the icon tile. Move the title and description to the natural full-width header column. If a visual anchor is needed at all, use a much smaller `Sparkles` glyph inline before the title (12px), or — better — replace with a kind-specific icon when prompt / system_prompt arenas land (e.g. swords for arena, stylus for prompt).
- proposed spec:
  - structure: header becomes `<DialogHeader><DialogTitle>How a {label.toLowerCase()} works</DialogTitle><DialogDescription>…</DialogDescription></DialogHeader>` with no decorative tile.
  - copy: title rewritten (see C-042).
  - tokens: existing.
  - interactions: none.
  - states: default only.
  - a11y: tile was already aria-hidden — removal is silent for SR.
  - responsive: title now has full width — no 2-line wrap on 375px.
  - motion: none.
- acceptance checks:
  - Title fits on one line at 375px.
  - No regression in sm+ rendering.

### Element: C-042 — Dialog title
- current intent: orient the user.
- observed issues:
  - "Welcome" presumes freshness — operators may have created this campaign weeks ago and just opened it for the first time; they're not "arriving" at anything new from their perspective.
  - "your model arena" personalizes — but the campaign is a *thing they made*, not a place they were welcomed into.
  - Title doesn't preview the actual content — the user has to read the body to find out this is a "what is this" explainer.
- key atomic answers:
  - Q9 (label unambiguous): Marginal — title is friendly but generic.
  - Q39 (concrete copy): Soft.
- verdict: recopy
- recommendation: Title becomes "How a {label.toLowerCase()} works." This previews the content, doesn't presume newness, reads cleanly in any locale, and matches the Help button's promoted "How it works" label.
- proposed spec:
  - copy: "How a model arena works." / "How a prompt arena works." / "How a system-prompt arena works."
  - tokens: existing `font-heading text-lg font-semibold`.
- acceptance checks:
  - Title fits one line at 375px (≤30 chars).
  - Re-trigger from Help button: title and Help-button label are the same phrase.

### Element: C-043 — Dialog description
- current intent: set length expectation, signal "low commitment".
- observed issues:
  - "30 seconds" is a soft promise — fine but already implied by the 3-step UI.
  - Sentence is wordy: "A quick walkthrough so you know what you're looking at."
- key atomic answers:
  - Q39 (concrete): Marginal.
  - Q41 (i18n string growth): Long enough that German would push past two lines on mobile.
- verdict: recopy
- recommendation: "Three short steps. Skip any time." — leaves room for the body, sets length without a number, makes the escape route explicit (matters for trust).
- proposed spec:
  - copy: "Three short steps. Skip any time."
  - tokens: existing.
- acceptance checks:
  - Reads cleanly screen-reader-first.
  - One line at 375px.

### Element: C-051a / C-051b — Step counter + progress bar
- current intent: where-am-I.
- observed issues:
  - Two indicators do the same job: text label and visual segments. Acceptable for redundancy, but on the last step both are misleading because every segment is filled.
  - Progress bar fills cumulatively (`i <= stepIndex`) — the current step is visually identical to completed steps, so on step 3 the bar communicates "100% done" while the user is still mid-content.
  - `aria-live="polite"` wraps both — every step change announces "Step 2 of 3" and the (silent) progress bar; the body content's title is NOT announced because it lives outside the live region.
- key atomic answers:
  - Q9 (unambiguous): Fails on last step.
  - Q27 (SR behavior): Announces meta, not content.
- context-specific answers:
  - C1: SR users know where they are but not what step is about until they read the body.
- verdict: redesign
- recommendation:
  - Visual progress: differentiate completed (`bg-foreground`), current (`bg-foreground` with a 4px ring or 1.5× height), future (`bg-border`). Or simpler: completed = filled, current = half-filled gradient or a dot indicator under the active segment, future = empty.
  - Move `aria-live="polite"` to wrap the step body title so SR announcements include "How it works" / "What's next" not just "Step 2 of 3".
- proposed spec:
  - structure: add a state-aware className: `i < stepIndex ? 'bg-foreground' : i === stepIndex ? 'bg-foreground ring-2 ring-foreground/20' : 'bg-border'`
  - copy: keep "Step X of Y".
  - tokens: existing.
  - interactions: animate ring-in on transition.
  - states: completed / current / future explicitly distinguished.
  - a11y: live region wraps the step title H3 and announces it on change.
  - responsive: identical at all viewports.
  - motion: `transition-all` on the ring + `motion-reduce:transition-none`.
- acceptance checks:
  - On step 3 of 3, the third segment is visually distinct from the first two.
  - SR announces "How it works" when user clicks Next, not just "Step 2 of 3".

### Element: R-052 / C-052a / C-052b — Step body card
- current intent: deliver the lesson.
- observed issues:
  - **Dark mode contrast failure.** `bg-surface-highlight/40` over `bg-card (rgb 22,21,18)` produces a near-invisible inner card; body copy in `text-muted-foreground` on this background is in the AA-fail zone.
  - The card-in-card pattern adds visual noise without separating concerns — there's only one piece of content; the inner card is theatrical.
  - No transition between steps — content swaps in place instantly, which is jarring at 60Hz; a 150ms cross-fade would aid the "same place, new content" mental model.
- key atomic answers:
  - Q26 (contrast pass): Fails in dark mode.
  - Q19 (avoid surprise): Marginal — content swap with no animation feels like a flash.
  - Q40 (reading level): Step bodies are concrete, conversational — good.
- verdict: restyle (remove inner card) + recopy step 3
- recommendation:
  - Drop the bordered inner card. Render the step title + body inline in the dialog's normal padding, separated from the indicator by margin only. This eliminates the dark-mode contrast issue and reduces vertical real estate.
  - Animate the body title + paragraph cross-fade on step change (`AnimatePresence` from framer-motion is already in deps via `motion`).
  - Step 3 body should be action-shaped, not narrative: "**Activate** to open voting · **Share** the link · **Recompute** ratings any time from Settings." Three quick verbs map to three discoverable controls.
- proposed spec:
  - structure: replace `<div className="rounded-lg border border-border bg-surface-highlight/40 ...">` with a borderless `<div className="px-1 py-2">`; keep title h3 and body p.
  - copy: rewrite step 3 to verb-first triplet (see above).
  - tokens: drop `bg-surface-highlight/40` and the border.
  - interactions: cross-fade content via `<motion.div key={stepIndex}>` with `initial={{opacity: 0, y: 4}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -4}} transition={{duration: 0.12}}`.
  - states: 3 content variants, one per step; cross-fades on switch.
  - a11y: the live region (per C-051) now wraps the title; SR announces title + body cleanly.
  - responsive: same on all viewports.
  - motion: respect `prefers-reduced-motion` — when reduced, `transition: { duration: 0 }`.
- acceptance checks:
  - In dark mode, the step body contrasts ≥ 4.5:1 against the dialog.
  - Step transition is smooth at 60Hz; reduced-motion users see instant swap.
  - Step 3 mentions Activate / Share / Recompute by name (matches dashboard verbs).

### Element: C-053 — Suppression checkbox
- current intent: opt out of future first-visit auto-opens.
- observed issues:
  - Only available on step 3 — operators who form an opinion mid-flow can't both dismiss AND suppress.
  - Defaulted ON — the user clicking "Got it" expects to dismiss; they may not realize they're also turning off all future first-visits. Soft dark-pattern.
  - Label "Don't show this again on new model arenas" — the plural "model arenas" implies the operator runs many; some only ever run one.
  - Native `<input type="checkbox">` rather than the project's design-system style; visually inconsistent with the rest of the modal (corners, accent color OK but size is small).
- key atomic answers:
  - Q5 (needed for all users): Yes — useful.
  - Q43 (asks for more info than needed): Soft yes — defaulted-on is presumption.
  - Q44 (anxiety / ambiguity): The user may worry "wait, did I just permanently turn off help?"
- context-specific answers:
  - C1: defaulted-on is a soft dark-pattern. Compare with most "remember me" checkboxes which default off.
  - C2: dismiss is reversible (Help button) — but only if discoverable.
- verdict: redesign
- recommendation:
  - Promote suppression to a footer-level toggle ("Don't show again" link) **available on every step**, not just step 3.
  - Default to OFF. Make suppression an explicit choice, not a side effect of completing.
  - Add a one-line caveat under the toggle: "You can re-open this any time from the *How it works* button."
  - Drop the kind-specific plural "on new model arenas" — the per-kind scoping is implementation detail; the user just needs "Don't show this again."
- proposed spec:
  - structure: footer becomes `[Don't show again ☐] ───── [Back] [Next | Got it]`. Skip becomes a small text link ("Maybe later") OR collapses into the X-close affordance.
  - copy: "Don't show this again" + below it (in muted): "You can re-open from *How it works* in the page header."
  - tokens: native checkbox kept (consistent with `CreateCampaign.tsx` precedent at line 2162); 12px label.
  - interactions: checkbox state read by every dismiss path (Skip / final CTA / Esc / backdrop). When checked, suppression always applies; when unchecked, never.
  - states: unchecked default; toggle persists during the session.
  - a11y: explicit `id` + `htmlFor` on label, even though wrapping label association works.
  - responsive: full row on mobile; left of footer on desktop.
  - motion: none.
- acceptance checks:
  - Checking "Don't show again" + clicking Skip suppresses (parity with final CTA path).
  - On a fresh visit, the box is unchecked.
  - The caveat is visible adjacent to the toggle.

### Element: C-061 — Skip button
- current intent: dismiss without suppressing.
- observed issues:
  - **Receives initial focus** — Enter on first paint kills the onboarding.
  - "Skip" is binary with the final CTA but not differentiated by intent — both close the modal; difference is the suppression flag, which is now defaulted on. Confusing.
  - On mobile (`flex-col-reverse`), Skip ends up at the visual bottom — separated from Back and Next which are the navigation duo.
- key atomic answers:
  - Q9 (unambiguous): Marginal.
  - Q24 (focus order): Skip first is wrong — it should be the *least* prominent focus target.
- verdict: re-interact + relocate
- recommendation:
  - **Demote Skip to a small text link** in the top-right of the dialog (where the close-X usually lives), or replace it with a real X-close button. This separates "I want to bail" from the navigation cluster, and stops it from being the first tabbable element.
  - Show a real `<X>` close icon button (size-8, ghost) in the top-right (we already have `showCloseButton` infrastructure in `DialogContent`) — don't suppress this affordance, just style it.
- proposed spec:
  - structure: pass `showCloseButton={true}` to `<DialogContent>` (or render a custom X-button). Remove the "Skip" footer button entirely.
  - copy: tooltip on X = "Close (you can re-open from How it works)".
  - tokens: existing `X` icon, ghost variant.
  - interactions: click → `handleClose(dontShowAgain)` (read from the now-footer-level toggle).
  - states: default / hover / focus.
  - a11y: `aria-label="Close onboarding"`.
  - responsive: top-right at all viewports (already supported in DialogContent).
  - motion: none.
- acceptance checks:
  - Tab order: H3 step title (or first body link) → Don't show again → Back → Next → X-close (or some sane flow).
  - Initial focus moves to Next (or to the dialog body), NOT to Skip.

### Element: C-062 — Back button
- current intent: return to previous step.
- observed issues:
  - **Disabled on step 1 but rendered** — adds tab stop, takes space, communicates nothing.
  - Disabled state via `disabled` attribute — `disabled` removes the button from sequential focus per HTML spec; verified via probe that it's still in the DOM but the browser skips it. So the *visual* clutter remains even if the *focus* clutter doesn't.
- key atomic answers:
  - Q2 (what breaks if removed on step 1): Nothing.
  - Q7 (visual weight matches priority): No — disabled outline button still has visual mass.
- verdict: hide on step 1
- recommendation: Conditionally render Back only when `stepIndex > 0`. The Next button slides to fill the space; on step 1 the footer reads `[Don't show again]      [Next →]` — clean, single primary action.
- proposed spec:
  - structure: `{stepIndex > 0 && <Button variant="outline" size="sm" onClick={…}>Back</Button>}`
  - copy: existing.
  - tokens: existing.
  - interactions: same.
  - states: hidden / default / hover / focus / active.
  - a11y: nothing announced when hidden.
  - responsive: identical.
  - motion: optional fade-in when reaching step 2; cheap and respectful.
- acceptance checks:
  - Step 1 footer has no Back button.
  - Step 2 has Back enabled.
  - Tab order on step 1: Don't show again → Next → close.

### Element: C-063 — Next / final CTA
- current intent: advance, then complete.
- observed issues:
  - "Got it, take me to the dashboard" is awkward — they're already on the dashboard; the modal sits over it.
  - Long string nearly fills the row at 375px.
  - On step 3 the `ArrowRight` icon vanishes (no longer Next) but the visual continuity is lost — there's no "complete" affordance icon.
- key atomic answers:
  - Q9 (unambiguous): "Got it" is fine; the trailer is wrong.
  - Q39 (concrete): "Take me to the dashboard" is concrete but inaccurate.
- verdict: recopy + add icon
- recommendation:
  - "Got it" on the final step. No trailer. Optionally pair with a `Check` icon for visual completion.
- proposed spec:
  - structure: `<Button variant="default" size="sm" onClick={…}><Check className="size-3.5" />Got it</Button>`
  - copy: "Got it" (final), "Next" + ArrowRight (intermediate).
  - tokens: existing.
  - interactions: same.
  - states: default / hover / focus / active.
  - a11y: focusable; on completion, focus restores to Help button (per R-030 recommendation).
  - responsive: identical.
  - motion: none.
- acceptance checks:
  - 375px viewport: "Got it" plus Check icon fits without wrapping.
  - On step 3 the button is visually the obvious primary.

### Element: R-070 — Animation chrome
- current intent: signal arrival.
- observed issues:
  - No `motion-reduce` variants applied — users with `prefers-reduced-motion` still get the zoom-in-95 + fade.
  - No animated transition between steps — content swap is instant.
- verdict: extend
- recommendation:
  - Add `motion-reduce:animate-none` to the dialog content open/close classes (already provided by tw-animate-css presets — verify they take effect).
  - Add intra-step cross-fade per R-052 recommendation.
- proposed spec:
  - tokens: extend dialog className `motion-reduce:transition-none motion-reduce:animate-none`.
  - motion: enter/exit at 150ms easeOut; reduced-motion users skip animations.
- acceptance checks:
  - DevTools → Rendering → Emulate `prefers-reduced-motion: reduce` → opening the dialog shows no animation.

### Element: C-082 — Versioned storage key
- current intent: forced re-show after major changes.
- observed issues:
  - Bumping to v2 orphans the v1 entries — minor disk leak; users unaffected. Consider a one-time cleanup that removes any `arena-onboarding-dismissed-*` whose version is below current. Not urgent.
- verdict: keep
- recommendation: Document the cleanup convention in a code comment so the next dev knows to add a sweep when bumping to v2.

### Element: telemetry — *missing*
- current intent: N/A
- observed issues: There's no event for shown / step-advanced / completed / suppressed / skipped / re-triggered. Without these, the team can't tell whether onboarding is read, abandoned, or actively rejected.
- verdict: add
- recommendation: Fire lightweight events through whatever client-side analytics already exists in the project (out of scope to wire if none exists). At minimum: `arena_onboarding_shown`, `arena_onboarding_step_advanced` (with `from`/`to`), `arena_onboarding_completed` (with `suppressed` boolean), `arena_onboarding_skipped`, `arena_onboarding_reopened` (Help button).
- proposed spec:
  - structure: optional `onEvent?: (name: string, props?: Record<string, unknown>) => void` prop on `ArenaOnboarding`. CampaignDashboard wires it (or leaves it unset). Component fires events at known transitions.
  - copy: N/A.
  - tokens: N/A.
- acceptance checks:
  - Triggering each interaction with an `onEvent` spy in tests fires the named events with expected props.

---

## 4) system-level evaluation

### 4.1 flow and task success

**Primary user journey supported.** Operator → opens campaign for first time → modal pops → reads three short cards → clicks Got it (with default suppression on) → modal closes → operator sees dashboard.

**Decision vs forced-decision misalignments.**
- Operator wants to **see the dashboard**, but is forced into a 3-step explainer first. A user who opened this campaign months after creating it is being treated like a new user.
- Operator wants to **dismiss-and-suppress mid-flow** but the suppression toggle only appears on the last step.
- Operator wants to **read in any order**, but is locked into a linear walkthrough.

**Cognitive load hotspots (top 5).**
1. Initial focus on Skip — ambiguous "what happens if I press Enter?"
2. Defaulted-on suppression on the final step — ambiguous "is the checkbox how I dismiss, or is it a setting?"
3. Final CTA "Got it, take me to the dashboard" — wait, where am I now?
4. Inner card-in-card — low signal, adds visual layers.
5. Progress bar showing all-filled on last step — does that mean done or current?

**Interruption points.** The biggest is the modal itself — it interrupts the dashboard's first-paint. Mitigated by deferring open until after data load (R-020 recommendation).

**Error recovery quality.** Good — Esc / backdrop / Skip / Help all work and are non-destructive. The one missing piece is focus restoration after dismiss.

### 4.2 information architecture and hierarchy

**Does the first screen establish what / why / now?**
- What: yes (step body answers).
- Why: marginal (description "so you know what you're looking at" is vague).
- Now: no — the operator has to wait to step 3 to see "what's next."

**Competing primaries.** The dialog has *two* primary affordances on the final step: the suppression checkbox (defaulted on) and the final CTA. The operator may not notice the checkbox because their eye is on the dark CTA button.

**Progressive disclosure opportunities.**
- The whole onboarding could be a single short panel with a "Tell me more" expand affordance, instead of a 3-step modal. Out of scope for the initial polish pass but worth noting.

**Density assessment.** Dialog is currently 462×307 on desktop — comfortable. Remove the inner card and tile and you free another 60-80px of vertical space, allowing more breathing room.

### 4.3 consistency and design-system health

**Pattern deviations + cost.**
- The component sets `showCloseButton={false}` on `DialogContent` while every other modal in the project uses the default close-X behavior. The omission is a deliberate "force them to choose Skip / Next" — but it's inconsistent with `EditCampaignDialog` and others. Cost: low; revisit if Skip is removed (per C-061 recommendation, the X-close pattern returns).
- Suppression checkbox is a native `<input type="checkbox">` — same pattern as `CreateCampaign.tsx`'s "Require feedback to continue" checkbox, so this is internally consistent. Acceptable; no design-system Checkbox component exists yet.

**Token drift.** None major. The inner step card's `bg-surface-highlight/40` is the only token usage that breaks under dark mode.

**Naming drift.** `arenaKind` is local to the component file via the `ArenaKind` import — consistent. The localStorage key naming convention uses kebab + colon — readable.

### 4.4 accessibility summary

**Top violations.**
1. Initial focus on Skip — breaks the principle that initial focus should support the primary task, not the escape route. (WCAG 2.4.3 / 2.4.7.)
2. `aria-live="polite"` wraps meta but not content — SR users hear "Step 2 of 3" but not the content of step 2's title until they tab into it.
3. Dark-mode contrast fail on step body card — `text-muted-foreground` on `bg-surface-highlight/40` over `bg-card` in dark mode is below AA.
4. No `motion-reduce` parity — users with reduced-motion prefs still get the zoom-in animation.

**Keyboard flow issues.** Skip → Back (disabled) → Next is the order. Move Skip out of the navigation cluster and away from initial focus.

**Screen reader issues.** As above — content changes are not announced.

**Motion / contrast issues.** As above.

**Must-fix vs nice-to-have.**
- **Must-fix:** initial focus, dark-mode contrast, reduced-motion parity.
- **Nice-to-have:** live region scope, focus restoration on close.

### 4.5 performance UX summary

- No perceived speed issues — modal mounts instantly, no network calls.
- No layout shift — modal is fixed-position centered.
- No image / font payload — only lucide icons (already in bundle).
- Animations use `transform + opacity` (safe properties).

---

## 5) proposed redesign

### 5.1 updated component tree

- **P-001** `<ArenaOnboarding>` (mounted by `CampaignDashboard`)
  - **R-010** Trigger surface
    - **C-011′** Help chip — `<Button ghost sm>` with `HelpCircle` + "How it works" text, placed next to the campaign title (not in the action slot)
  - **R-020′** Data-aware first-visit auto-open (waits for `data?.campaign.id`)
  - **R-030** `<Dialog>`
    - **R-031** Backdrop (keep) — Esc / click → close (no suppression unless toggle is on)
    - **R-032** `<DialogContent>` (with `showCloseButton={true}`)
      - **R-040′** Header
        - ~~C-041 Sparkles tile~~ (removed)
        - **C-042′** Title — "How a {label} works."
        - **C-043′** Description — "Three short steps. Skip any time."
      - **R-050′** Body
        - **R-051′** Step indicator
          - C-051a Step counter (kept)
          - **C-051b′** Progress bar with completed / current / future states
          - **A-051c′** `aria-live="polite"` wraps **the step title H3**, not the indicator
        - **R-052′** Borderless step body (no inner card)
          - C-052a Step title
          - C-052b Step body (with cross-fade on transition)
      - **R-060′** Footer
        - **C-053′** Suppression toggle (visible on every step, defaulted OFF, with caveat)
        - Spacer
        - **C-062** Back button (rendered only when `stepIndex > 0`)
        - **C-063′** Next OR "Got it" CTA (with `Check` icon on completion)
      - **C-064** Top-right close X (`showCloseButton={true}`) — read suppression flag, then close
  - **R-070′** Animation
    - dialog open/close + step cross-fade — both with `motion-reduce` parity
  - **R-080′** Persistence (unchanged: `arena-onboarding-dismissed-v1:<kind>`)
  - **R-090** Telemetry hooks (optional `onEvent` prop)

### 5.2 prioritized change list

| # | change | rationale | impact | effort | risk | dependencies | how to verify |
|---|---|---|---|---|---|---|---|
| 1 | Move initial focus off Skip → onto Next (or dialog body / "How it works" close-X) | Eliminates Enter-to-destroy footgun — single biggest UX failure | High | 5 min | Low | Base UI `initialFocus` API on `Dialog.Popup` | Open dialog, press Enter → Next fires (advances step), not Skip |
| 2 | Replace inner step card with borderless body | Fixes dark-mode contrast fail, reduces visual noise | High | 10 min | Low | None | Dark mode contrast probe ≥ 4.5:1; visual review |
| 3 | Hide Back on step 1 | Removes meaningless control + tab stop | Medium | 2 min | None | None | Step 1 footer has no Back button |
| 4 | Promote suppression toggle to footer-of-every-step, default OFF, with caveat | Lets users suppress without completing; removes soft dark-pattern; preserves trust | High | 20 min | Low | None | Toggle visible on step 1; checking it + Skip suppresses; default unchecked on fresh visit |
| 5 | Differentiate progress segments: completed vs current vs future | Honest progress communication | Medium | 10 min | None | None | On step 3/3, third segment is visually distinct |
| 6 | Move `aria-live="polite"` to wrap step title | SR users hear content, not just meta | Medium | 5 min | Low | None | Test with VoiceOver: "Next" announces "How it works" |
| 7 | Rename title to "How a {label} works." | Concrete, no presumption of newness | Low | 5 min | None | None | Visual review |
| 8 | Rename description to "Three short steps. Skip any time." | Tighter, sets explicit escape | Low | 5 min | None | None | Visual review |
| 9 | Rewrite step 3 body to verb-first: "Activate · Share · Recompute" | Maps to dashboard verbs | Low | 5 min | None | None | Visual review |
| 10 | Replace final CTA copy with "Got it" + Check icon | Stops misleading "take me to the dashboard" | Low | 5 min | None | None | 375px viewport: button fits without wrapping |
| 11 | Delete Sparkles header tile | Decoration only; reduces width pressure | Low | 5 min | None | None | Title fits on one line at 375px |
| 12 | Promote Help button to "How it works" chip next to the campaign title | Discoverability | Medium | 10 min | Low | `PageHeader` accepts `title` ReactNode | Visual review at 1440px and 375px |
| 13 | Defer auto-open until campaign data has loaded | Stops modal slamming over empty space | Medium | 5 min | Low | `data?.campaign.id` check | Slow 3G: skeleton renders, then dashboard, then modal |
| 14 | Replace Skip button with top-right X close (re-enable `showCloseButton`) | Separates "bail" from navigation cluster, stops Skip-as-first-focus | Medium | 10 min | Low | Existing `DialogContent` supports `showCloseButton` | Tab order: title region → body → toggle → Back → Next → X |
| 15 | Restore focus to Help button on close | Continuity for keyboard / SR users | Medium | 10 min | Low | Ref forwarding from CampaignDashboard | After Skip / Got it / Esc, Help button shows focus ring |
| 16 | Add `motion-reduce:` parity to dialog enter/exit + step cross-fade | A11y best practice | Low | 5 min | None | None | DevTools `prefers-reduced-motion: reduce` → no animation |
| 17 | Cross-fade step body on transition | Smoother "same place, new content" mental model | Low | 10 min | Low | Already-installed `motion` package | Step transition is smooth at 60Hz; reduced-motion users see instant swap |
| 18 | Optional `onEvent` prop for telemetry | Future-proofs measurability | Low | 10 min | None | None | Test fires expected events |
| 19 | Document v→v cleanup convention in a code comment | Avoids localStorage cruft when bumping versions | Trivial | 2 min | None | None | Code review |

**Total estimated effort: ~2 hours of focused work for changes 1-17.**

### 5.3 implementation notes

**Component boundaries and responsibilities.**
- `ArenaOnboarding` owns: dialog rendering, step state, suppression toggle, content lookup by kind, internal animations, focus initial-target.
- `CampaignDashboard` owns: localStorage read/write, first-visit gating (after data load), Help-button trigger, focus restoration on close.

**State machine notes.**
- Internal: `{ stepIndex: 0..total-1, dontShowAgain: boolean }`. Reset on every `open=true` transition.
- External: `open: boolean`, `onDismiss(suppress: boolean)`. Suppression flag is what the parent uses to write localStorage.

**A11y notes.**
- `role="dialog"`, `aria-modal="true"` (Base UI default).
- `aria-labelledby` → DialogTitle.
- `aria-describedby` → step body title (not the description, since dialogs only allow one describedby).
- `aria-live="polite"` wraps the step title H3 ONLY (so SR announces titles on transition).
- Initial focus → Next button (or dialog body via `tabindex=-1` autofocus div).
- Focus restoration on close → opener button (Help chip) via parent-supplied ref.

**Responsive notes.**
- 375px: title 1 line, body fits without scroll, footer stacks `[toggle] / [Back] [Next/CTA]` with toggle on its own row.
- ≥640px (sm): title 1 line, footer single row `[toggle] ... [Back] [Next/CTA]` with X-close in top-right.

**Motion notes + reduced-motion behavior.**
- Open/close: 150ms fade + zoom (existing).
- Step cross-fade: 120ms opacity + 4px y-translate via `<motion.div key={stepIndex}>`.
- All wrapped in `motion-reduce:` variants (or `useReducedMotion` from framer-motion).

**Analytics / telemetry notes.**
- Optional `onEvent` prop. Event names: `arena_onboarding_shown`, `arena_onboarding_step_advanced` (`{from, to}`), `arena_onboarding_completed` (`{suppressed: boolean}`), `arena_onboarding_skipped` (`{atStep, suppressed: boolean}`), `arena_onboarding_reopened`.

---

## 6) appendices

### 6.1 visual evidence captured

- Light-mode desktop step 1 — modal centered, three-button footer (Skip / Back disabled / Next).
- Light-mode mobile step 1 — modal at 375px, three buttons stack vertically (Next on top, then Back, then Skip).
- Light-mode mobile step 3 — suppression checkbox visible, "Got it, take me to the dashboard" CTA fills nearly the full row.
- Dark-mode desktop step 1 — inner step card barely distinguishable from the dialog background; body copy washed out.
- Help button position — small ghost icon at top-right of the page header action zone, easily missed.

### 6.2 measured values
- Dialog width @ desktop: 462px.
- Dialog dark-mode bg: `rgb(22, 21, 18)`.
- Step body card dark-mode bg: `oklab(0.235772 0.000771545 0.00803898 / 0.4)` over the dialog (≈ rgb 25-30 effective).
- Step body text color light: `rgb(110, 106, 98)`; dark: `rgb(168, 164, 156)`.
- Initial focus: `<button>Skip</button>` (verified via `document.activeElement` probe).
- Tab order in dialog: `Skip → Back (disabled) → Next` (3 stops total on intermediate steps; +checkbox + CTA on last step).

### 6.3 not verified / flagged for the implementation pass

- Behavior when `prefers-reduced-motion: reduce` is set in OS — needs verification with DevTools emulation after the `motion-reduce` parity fix lands.
- Behavior when localStorage throws (private mode / strict cookies) — Help button still works per code, but auto-open silently no-ops; verify by simulating a throw.
- Behavior of focus restoration after dismiss — flagged as "needs ref wiring", not currently implemented.
