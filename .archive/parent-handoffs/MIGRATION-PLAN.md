# ïdea.com → GitSlip Frontend Migration Plan

**Goal:** Port ïdea.com (modelarena) into GitSlip's frontend shell so it feels like a native product in the same family — same interface grammar, design language, shell, and visual identity. Preserve ïdea.com's features, data model, and domain terminology.

**Not a reskin.** The result should feel like GitSlip's frontend system was used to build ïdea.com from day one.

---

## 1. Executive summary

Both apps are React 19 + Vite + TypeScript with Lucide icons and JetBrains Mono for code. That's where the alignment ends.

| Dimension | GitSlip (target) | ïdea.com (current) |
|---|---|---|
| Tailwind | 3.x, CSS vars (`rgb(var(--x))`), tokens via `theme.extend.colors` | 4.x, `@theme inline`, hex vars |
| Component library | None — hand-built Tailwind components | shadcn/ui (base-nova) |
| Router | Custom `window.history` | React Router v7 |
| Font sans | Inter | Geist Variable |
| Palette (light) | **Warm paper** `#F7F6F3`, warm ink, forest green accent `#047857` | Generic shadcn white + `#3b82f6` blue |
| Shell | Sidebar 256px + sticky topbar (h-14) with breadcrumb + search + bell + avatar, `max-w-6xl` content | Sidebar 240px, no topbar, content `p-10` |
| Brand mark | `/` in a small square | ModelArena wordmark + generic blue tile |
| Signature textures | `scanline-bg` hatching, `grid-bg`, dashed-border empty states | None |

**Core recommendation: hybrid port, not reskin.**
- **Replace entirely:** tokens, fonts, layout shell (sidebar + topbar + breadcrumb + command palette), page headers, list/row compositions, status badges, empty states, signup/wizard composition, toast system, brand mark.
- **Keep but restyle:** shadcn primitives (`Button`, `Input`, `Select`, `Dialog`, `Tabs`, `Table`) — their APIs are fine; we align their variants to GitSlip's design via CSS vars and variant classes. This preserves shadcn's accessibility, keyboard handling, and Radix primitives without rebuilding a component library from scratch.
- **Keep untouched:** React Router v7, TanStack Query, `apiFetch`, Drizzle schema, all `/api` endpoints, voting/tournament logic, Bradley-Terry computation. Product logic is sacred.

**Single best path forward:**
1. Install GitSlip's token system + fonts as the ground layer (Tailwind 4 `@theme inline`, warm palette).
2. Replace `OperatorLayout` with a direct port of GitSlip's shell (sidebar + topbar + breadcrumb + search + command palette).
3. Retheme shadcn primitives against the new tokens; add GitSlip-native compositions (`StatusBadge`, `ProjectIcon` equivalent, `PageHeader`, `EmptyState`, `Toast`) to `src/components/ui/gitslip/`.
4. Migrate screens top-down from highest-traffic (Home/Campaigns list, Dashboard, Settings/API) to the long tail (CreateCampaign wizard → GitSlip Signup composition; VotingInterface is product-specific and gets its own treatment inside the new tokens).
5. Only then tune the participant flow, which runs without the operator shell.

Estimated scope: 2–4 focused days if done in the prescribed order. Roughly 40% of the delta is tokens + shell + primitives restyling (mechanical); 40% is screen-by-screen composition rewrite; 20% is the wizard, command palette, and polish.

---

## 2. Key architectural decisions (make these first)

### 2.1 Tailwind 4 vs 3
**Decision: stay on Tailwind 4.** ïdea.com already uses it, and migrating back to 3 loses the `@theme inline` ergonomics. We port GitSlip's *values* but express them in the Tailwind 4 idiom.

### 2.2 Keep or drop shadcn?
**Decision: keep, retheme.** Rewriting every primitive from scratch is low-leverage — GitSlip's distinctive feel comes from tokens, typography, spacing, shell structure, list compositions, and signature textures, not from `<Button>` internals. shadcn's Radix underpinnings give us dialogs, selects, and tabs with proper focus traps, keyboard nav, and ARIA that we'd otherwise have to rebuild.
We override shadcn's defaults at two levels:
- **Token level:** rewrite CSS vars in `src/index.css` to GitSlip values (warm paper, warm ink, forest green, warm border). shadcn components using `bg-primary`, `border-border`, etc. automatically pick up the new look.
- **Variant level:** edit `button.tsx`, `input.tsx`, `card.tsx`, `badge.tsx`, `dialog.tsx`, `tabs.tsx` to adjust radii, padding, borders, and hover states to match GitSlip (e.g., buttons → `rounded-full` for primary actions, `rounded-lg` for secondary; cards → `rounded-xl border border-border shadow-sm`).

### 2.3 Router
**Decision: keep React Router v7.** ModelArena has real URL semantics (`/vote/:slug`, `/campaign/:id`). GitSlip's hand-rolled history management works only because it has fewer deep links. Do not regress.

### 2.4 Fonts
**Decision: switch sans to Inter.** Replace `@fontsource-variable/geist` with a font loader for Inter (self-host via `@fontsource-variable/inter` for parity, or use Google Fonts link in `index.html` as GitSlip does). Keep JetBrains Mono. Update `--font-sans` in `@theme inline`.

### 2.5 Tokens
**Decision: wholesale replace.** Delete the shadcn-default palette in `src/index.css` and install GitSlip's warm palette + its chart/sidebar mappings. See §5 for exact values.

### 2.6 Brand
**Decision: adopt GitSlip's `/` mark and `gitslip / Page` breadcrumb pattern — with a naming question to the user.**
The app is still ModelArena / ïdea.com functionally. GitSlip uses `gitslip` as the org prefix and a `/` mark. Two options:

- **A — full visual brand transfer:** Use GitSlip's `/` mark and `gitslip` breadcrumb root. Treat ModelArena as the product name shown only in titles/meta.
- **B — product name preserved, GitSlip treatment applied:** `/` mark stays (it reads as a generic operator mark, not a logo), but the breadcrumb/org prefix uses the user's actual org or product name ("modelarena" or "ïdea.com").

Recommendation: **B**, because the user is the owner of both but the two are distinct products. The `/` in a black square is neutral enough to carry both brands; the breadcrumb root is what distinguishes them. **See open question Q1.**

### 2.7 Theme mode
**Decision: default to light (GitSlip's primary target); keep dark as a toggle.** ModelArena currently defaults to dark — flip the default in `ThemeProvider`. Voting UI (currently feels dark-native) gets both themes.

---

## 3. GitSlip audit (distilled)

**Stack:** React 19, Vite 6, Tailwind 3.4, Lucide 0.562, self-hand-rolled everything. No shadcn, no Radix, no Router lib.

**Tokens (light mode — values as RGB triples, consumed via `rgb(var(--x) / <alpha-value>)`):**
```
--bg-background: 247 246 243   /* #F7F6F3 warm paper */
--bg-surface:    255 255 255
--bg-surface-highlight: 244 243 240
--text-primary:  31 27 22      /* #1F1B16 warm ink */
--text-secondary:110 106 98    /* #6E6A62 warm muted */
--border:        232 230 225   /* #E8E6E1 */
--accent:        4 120 87      /* #047857 forest green */
--success:       34 197 94
```

**Typography scale:** `text-[10px]` (uppercase labels "PLATFORM"/"PRODUCTION"), `text-xs` (12px meta), `text-sm` (14px body/buttons/nav), `text-lg` (section), `text-xl` (page title), `text-3xl` (secondary H). Letter spacing `tracking-wide` on labels. Font sans Inter, mono JetBrains Mono.

**Radii:** `rounded` (4px) on small chips, `rounded-md` on the brand `/` tile and some buttons, `rounded-lg` (8px) on inputs/secondary buttons, `rounded-xl` (12px) on cards/panels/modals, `rounded-full` on primary CTAs and avatars.

**Shell:**
- Sticky topbar `h-14 z-30`: breadcrumb (`gitslip / Page`) left, search + ⌘K center, bell + avatar right.
- Sidebar `fixed inset-y-0 w-64 hidden md:flex` with two labeled sections (PLATFORM / ACCOUNT), uppercase `text-[11px] tracking-wider` labels, icon + text nav rows, active state `border border-border/50 bg-surface font-medium text-primary shadow-sm`.
- Content `max-w-6xl p-4 md:p-8`.
- Mobile drawer for the sidebar.

**Signature UI compositions:**
- **Project/list rows:** letter-badge (5×5 with first letter) + name + uppercase PRODUCTION/ENV label + external-link icon (hover reveal) + right-side meta (commit hash + branch + time-ago + status chip + chevron).
- **Status chips:** `Live` (green on transparent), `Building` (green with spinner), `Failed` (amber). Tight `rounded-full border text-[10px] font-medium px-2 py-0.5`.
- **Empty states:** dashed border (`border-2 border-dashed border-border`), centered icon in circle, headline, helper copy, primary CTA.
- **Creation wizard (Signup):** centered max-w-md card, numbered step indicator, back/next inline, real-time build logs with stages.
- **Command palette (⌘K):** full-viewport overlay with backdrop-blur, grouped results (Projects / Navigation / Actions), keyboard nav.
- **Toasts:** `fixed bottom-4 right-4`, `animate-fade-in-up`, auto-dismiss, optional action link.
- **Diagonal hatching (`scanline-bg`):** subtle texture on list containers; dual-frequency 163° lines with radial edge mask.

**Direct-port targets (files to copy or transplant):**
```
gitslip/frontend/src/index.css           → tokens + scanline-bg + grid-bg utilities
gitslip/frontend/tailwind.config.js      → color/font/animation extensions (adapt to TW4)
gitslip/frontend/components/Dashboard.tsx → shell (sidebar + topbar + command palette + mobile drawer)
gitslip/frontend/components/CommandPalette.tsx → nearly verbatim
gitslip/frontend/components/ui/StatusBadge.tsx → verbatim
gitslip/frontend/components/ui/ProjectIcon.tsx → rename to EntityIcon, verbatim
gitslip/frontend/components/ui/Toast.tsx → verbatim
gitslip/frontend/components/modals/DeleteConfirmation.tsx → verbatim
gitslip/frontend/components/Settings.tsx → take tab composition + form patterns
gitslip/frontend/components/Signup.tsx → take wizard composition for CreateCampaign
gitslip/frontend/components/Domains.tsx → take empty-state pattern
```

---

## 4. ïdea.com audit (distilled)

**What it is:** ModelArena. Operator-authenticated tool to run head-to-head tournament voting on AI model outputs. Operators create campaigns, define prompts, pick ≥4 models from a registry, generate outputs via OpenRouter (SSE-streamed), activate the campaign, share a public slug. Anonymous participants vote pairwise in 5-position brackets; Bradley-Terry ratings are computed personally and globally. Also has a team activity feed and model library with availability toggles.

**Domain entities (preserve terminology):** `Campaign`, `Prompt`, `CampaignModel`, `ModelRegistry`, `Generation`, `Participant`, `Tournament`, `Vote`, `Rating`, `bracketPosition b1..b5`, `stability` (directional / preliminary / stable).

**Routes (11 pages):**
- Operator (auth-gated): `/login`, `/` (Campaigns list), `/dashboard`, `/team-activity`, `/models`, `/settings/api`, `/campaign/new`, `/campaign/:id`.
- Participant (public): `/vote/:slug`, `/vote/:slug/play`, `/vote/:slug/results`.

**Current shell:** `OperatorLayout` — 240px sidebar with logo, "Main"/"System" sections, ModeToggle + Log Out at bottom. Main content `p-10`. No topbar. No breadcrumb. No command palette. No search.

**Current UI quality:** Functional shadcn dashboard — correct and coherent but generic. KpiCards are minimal number tiles. No shared `PageHeader`; every page reimplements the `<h1> + description + action button` row. Error state is ad-hoc red alert divs. No skeleton loading. Primary color is shadcn blue `#3b82f6`. No signature textures. No empty-state pattern. No toast system.

**Existing strengths to preserve:**
- TanStack Query patterns (`apiFetch`, `useQuery`, `useMutation`) — solid; keep.
- Optimistic updates in `ModelLibrary` — keep.
- shadcn primitives in `src/components/ui/` — keep the file, retheme the styles.
- Drizzle schema + `/api` endpoints — out of scope.

---

## 5. Token & typography migration (concrete)

**Action:** replace `modelarena/src/index.css` wholesale with this shape. Keep the `@theme inline` block, swap the `:root` and `.dark` values, and add GitSlip's utility layer.

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/inter";
@import "@fontsource-variable/jetbrains-mono";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-sans: 'Inter Variable', 'Inter', -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono Variable', 'JetBrains Mono', Menlo, monospace;
  --font-heading: var(--font-sans);

  /* Map shadcn token names → GitSlip semantics */
  --color-background: var(--bg-background);
  --color-foreground: var(--text-primary);
  --color-card: var(--bg-surface);
  --color-card-foreground: var(--text-primary);
  --color-popover: var(--bg-surface);
  --color-popover-foreground: var(--text-primary);
  --color-primary: var(--text-primary);              /* dark-on-light CTAs */
  --color-primary-foreground: var(--bg-background);
  --color-secondary: var(--bg-surface-highlight);
  --color-secondary-foreground: var(--text-primary);
  --color-muted: var(--bg-surface-highlight);
  --color-muted-foreground: var(--text-secondary);
  --color-accent: var(--accent);                     /* forest green */
  --color-accent-foreground: var(--bg-background);
  --color-destructive: 220 38 38;                    /* red-600, restrained */
  --color-border: var(--border);
  --color-input: var(--border);
  --color-ring: var(--accent);
  --color-sidebar: var(--bg-background);
  --color-sidebar-foreground: var(--text-primary);
  --color-sidebar-border: var(--border);
  --color-sidebar-accent: var(--bg-surface);
  --color-sidebar-accent-foreground: var(--text-primary);
  --color-sidebar-primary: var(--text-primary);
  --color-sidebar-primary-foreground: var(--bg-background);

  /* GitSlip-native surfaces, exposed for bespoke components */
  --color-surface: var(--bg-surface);
  --color-surface-highlight: var(--bg-surface-highlight);
  --color-success: var(--success);

  --radius: 0.75rem;          /* bump to favor rounded-xl feel */
  --radius-sm: calc(var(--radius) * 0.5);
  --radius-md: calc(var(--radius) * 0.66);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.33);
}

:root {
  /* Light — warm paper */
  --bg-background: 247 246 243;
  --bg-surface: 255 255 255;
  --bg-surface-highlight: 244 243 240;
  --text-primary: 31 27 22;
  --text-secondary: 110 106 98;
  --border: 232 230 225;
  --accent: 4 120 87;
  --success: 34 197 94;
}

.dark {
  --bg-background: 8 7 6;
  --bg-surface: 22 21 18;
  --bg-surface-highlight: 32 30 26;
  --text-primary: 250 249 247;
  --text-secondary: 168 164 156;
  --border: 42 40 36;
  --accent: 16 185 129;
  --success: 34 197 94;
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground antialiased; }
  html { @apply font-sans; }
  ::selection { background: rgba(4, 120, 87, 0.2); }
}

@layer components {
  /* port grid-bg, scanline-bg, spotlight-card verbatim from gitslip/src/index.css */
}
```

Notes:
- `--primary` intentionally maps to `--text-primary` (dark) in light mode. GitSlip's primary CTA is dark-on-light ("New Project" black pill). Do not map it to `--accent`; the forest green is reserved for status and subtle highlights, not primary action.
- `--destructive` is tightened from shadcn's `#ef4444` to a slightly muted red-600 to match GitSlip's restraint.
- `--radius` bumped from `0.5rem` to `0.75rem` so default shadcn rings land on the "gently rounded" feel.

---

## 6. Screen-by-screen mapping

Format: **ïdea.com screen** → **GitSlip pattern** → _action_.

| ïdea.com | Closest GitSlip pattern | Action |
|---|---|---|
| `/login` — OperatorLogin | `Login.tsx` (centered card, `/` mark header, email input, primary button) | **Rebuild** against GitSlip composition. Replace blue primary tile with `/` mark. Keep password field (ModelArena uses password, GitSlip uses email/OAuth — preserve ModelArena's auth mechanism, adopt GitSlip's visual). |
| `/` — OperatorHome (Campaigns list) | Dashboard "All Projects" list | **Rebuild** as list using `scanline-bg` container. Each campaign row: letter-badge + name + status chip ("ACTIVE"/"DRAFT"/"CLOSED" uppercase small), share-slug URL as subtitle, right-side: votes count + participants + time-ago + status. Chevron on hover. |
| `/dashboard` — OperatorDashboard | GitSlip overview rhythm (breadcrumb + stacked panels, tight meta) | **Rebuild** as a grid of small panels: KPI tiles as compact cards with `text-[10px] tracking-wide` labels + `text-3xl` numbers; Recent Campaigns and Top Models as secondary lists styled like project rows; AttentionPanel becomes a GitSlip-style alert (border-l-4 accent or dashed card). |
| `/team-activity` — TeamActivity | Activity-feed pattern (derive from GitSlip's Audit Log tab in Settings) | **Adapt.** Vertical timeline with faint left rail, action icon, actor, verb, object, relative time. Density matches Settings/Audit Log. |
| `/models` — ModelLibrary | Projects list + detail side panel pattern (no direct GitSlip equivalent — compose from patterns) | **Compose.** List body styled as rows (name + provider id + usage meta + status chip). Detail panel as rounded-xl card with key/value grid. Availability toggle uses restyled shadcn `Switch`. |
| `/settings/api` — ApiSettings | Settings page (General tab pattern) | **Direct adapt.** Settings tabs pattern (General / Team / Billing / Audit Log) → (General / API / OpenRouter / Audit Log) or similar. Read-only config rows follow GitSlip's security rows (label + subtitle + right-aligned status/link). |
| `/campaign/new` — CreateCampaign wizard | `Signup.tsx` (stepped onboarding with progressive disclosure and streamed build logs) | **Rebuild as GitSlip-native flow.** Replace the numeric stepper with GitSlip's progressive card-per-step pattern. Step 4 (Generation SSE) becomes GitSlip's streamed logs panel almost verbatim — same stages, same typography, same monospace log lines, same success/fail aggregation. |
| `/campaign/:id` — CampaignDashboard | GitSlip project detail (tabs + production card + right sidebar of metadata) | **Compose.** Tabs: Overview / Ratings / Prompts / Votes / Settings. Overview has the share-link card (mirroring "Production Deployment" card) with share URL, copy button, open-in-new, stats. Right sidebar has Status / Created / Closed At / Actions (Recompute, Close, Export CSV). |
| `/vote/:slug` — ParticipantLanding | Login/Signup centered card | **Rebuild.** Single centered `max-w-md` card. Campaign name as title, description, estimated time / battles as muted meta row, optional email input, primary CTA "Start". Use `/` mark at top. |
| `/vote/:slug/play` — VotingInterface | No equivalent — product-specific | **Redesign within GitSlip tokens.** Keep split-pane battle. Retype prompt header as `text-[10px] tracking-wide` "PROMPT" + `text-lg` body. Model outputs in mono on `bg-surface`. A/B buttons as dark pills (primary). Tie/Both-bad as outline pills. Top progress bar thin (`h-1`) to reduce chrome. Header shows `/` mark + campaign name + quit (X) on the right. Keyboard shortcuts made visible as `kbd`-styled hints next to each button. |
| `/vote/:slug/results` — PersonalResults | Tables inside Settings-style card | **Rebuild.** Header as page-title row. Overall preferences = a single rounded-xl card containing a table styled like GitSlip's deployment list (first row highlighted with `bg-surface-highlight`, rank index in mono, stability tier as a small chip). Per-prompt rankings = secondary cards below. |

**Screenshots vs code — noted divergences:**
- Screenshots show a **settings "Team" tab** and **"Billing" tab** that the Settings.tsx audit didn't explicitly surface; the code has General/Security sections. Treat the screenshot as intent — the tab bar pattern is real, even if Team/Billing are empty placeholders in the codebase. Mirror the tab shell; the tabs we need in ModelArena are different.
- Screenshots show a **"DEV: VIEW EMPTY STATE"** toggle on the Domains page (top-right pill). Useful pattern for dev ergonomics; do not carry into ModelArena unless asked.
- Screenshot project list shows letter badges in **rounded squares, not circles** — audit mentioned "5×5px" which is ambiguous; screenshots are authoritative. Use `rounded-lg` squares.

---

## 7. Component mapping

| GitSlip component | ïdea.com destination | Notes |
|---|---|---|
| `ui/StatusBadge.tsx` | `src/components/ui/status-badge.tsx` | Verbatim. Extend variants to cover `draft / active / completed` (ModelArena states) in addition to `live / building / failed`. |
| `ui/ProjectIcon.tsx` | `src/components/ui/entity-icon.tsx` | Verbatim, renamed. Used for campaigns, models, and participants. |
| `ui/Toast.tsx` | `src/components/ui/toast.tsx` | Verbatim. Expose a `useToast` hook. Remove ModelArena's ad-hoc red alert divs; route errors through toasts. |
| `CommandPalette.tsx` | `src/components/command-palette.tsx` | Port. Wire to React Router's `useNavigate`. Groups: "Campaigns" (fetched from `/api/campaigns`), "Navigation" (hardcoded), "Actions" (New Campaign, Recompute Ratings if on a campaign page). |
| `modals/DeleteConfirmation.tsx` | `src/components/modals/confirm-destructive.tsx` | Verbatim. Reuse for Close Campaign, Recompute Ratings (destructive variant), Disable Model. |
| `modals/EnvModals.tsx` | — | Skip. Not relevant to ModelArena. |
| Sidebar+Topbar shell (from `Dashboard.tsx`) | `src/components/layout/app-shell.tsx` | Extract into a clean shell component. Replace `OperatorLayout` imports everywhere. |
| `Signup.tsx` (wizard composition) | — (reference) | Don't import. Use as the structural reference for the CreateCampaign rewrite. |
| `Settings.tsx` (tabs composition) | — (reference) | Likewise. Extract `SettingsTabs` subcomponent if reusable elsewhere. |

**shadcn primitives to retheme (in-place edits, no new files):**
- `button.tsx`: default = dark pill (`rounded-full bg-primary text-primary-foreground h-10 px-5 shadow-sm`); `outline` = `rounded-lg border border-border bg-surface`; `ghost` = subtle hover only.
- `input.tsx`: `h-10 rounded-lg border-border bg-surface px-4 text-sm focus:ring-1 focus:ring-accent/20`.
- `card.tsx`: `rounded-xl border-border bg-surface shadow-sm p-6`.
- `badge.tsx`: variants mirror `StatusBadge` — `rounded-full text-[10px] font-medium px-2 py-0.5`.
- `dialog.tsx`: content `rounded-xl border-border bg-surface max-w-md`; overlay `bg-black/50 backdrop-blur-sm`.
- `tabs.tsx`: trigger uses bottom-border active style (not pill). Match GitSlip's settings tab row: inactive = `text-secondary`, active = `text-primary border-b-2 border-primary -mb-px`.
- `table.tsx`: header `text-[10px] uppercase tracking-wide text-secondary`, row `border-b border-border/60 hover:bg-surface-highlight/40`.
- `select.tsx`: same treatment as Input.

**New ïdea.com primitives to add:**
- `ui/page-header.tsx` — DRY the h1 + description + action row used on every operator page.
- `ui/empty-state.tsx` — dashed-border card + icon + title + helper + CTA. Reused for Campaigns list empty, Models library empty, filtered-out states.
- `ui/brand-mark.tsx` — the `/` in square. Used in sidebar top-left, auth pages, voting header.
- `ui/key-hint.tsx` — small `kbd`-styled key indicators for voting shortcuts (a/b/t/x) and the command palette (⌘K).

---

## 8. Migration architecture

### 8.1 Directory plan
```
modelarena/src/
├── components/
│   ├── layout/
│   │   ├── app-shell.tsx          # NEW — replaces OperatorLayout
│   │   ├── topbar.tsx             # NEW
│   │   ├── sidebar.tsx            # NEW
│   │   ├── breadcrumb.tsx         # NEW
│   │   └── participant-shell.tsx  # NEW — minimal shell for /vote/* pages
│   ├── command-palette.tsx        # NEW
│   ├── modals/
│   │   └── confirm-destructive.tsx # NEW
│   ├── ui/                        # shadcn — retheme in place
│   │   ├── button.tsx             # edit
│   │   ├── input.tsx              # edit
│   │   ├── card.tsx               # edit
│   │   ├── tabs.tsx               # edit
│   │   ├── dialog.tsx             # edit
│   │   ├── badge.tsx              # edit
│   │   ├── select.tsx             # edit
│   │   ├── table.tsx              # edit
│   │   ├── status-badge.tsx       # NEW
│   │   ├── entity-icon.tsx        # NEW
│   │   ├── toast.tsx              # NEW
│   │   ├── page-header.tsx        # NEW
│   │   ├── empty-state.tsx        # NEW
│   │   ├── brand-mark.tsx         # NEW
│   │   └── key-hint.tsx           # NEW
│   └── ... (existing product components — retheme during screen rewrites)
└── index.css                       # wholesale replace
```

### 8.2 Order of operations inside a single screen rewrite
For each screen, follow this pattern to avoid inconsistent half-states:
1. Replace `OperatorLayout` wrapper with `<AppShell breadcrumb={...}>`.
2. Replace the inline `<h1>...description...button</h1>` row with `<PageHeader>`.
3. Replace ad-hoc cards with shadcn `Card` (now GitSlip-themed) or direct `<div className="rounded-xl border border-border bg-surface p-6 shadow-sm">`.
4. Replace ad-hoc status colors (`bg-emerald-500`, `bg-amber-500`) with `<StatusBadge variant="active|draft|completed|failed">`.
5. Replace loading states (`<p>Loading...</p>`) with skeleton rows matching the final layout.
6. Replace ad-hoc error divs with `toast.error(message)` + inline fallback state.
7. Verify in light mode first (primary target), then dark.

### 8.3 Keep shadcn upgrade path clean
All shadcn edits stay in the files `components.json` manages, so `npx shadcn add` for future primitives still works. Do not introduce a wrapper module that re-exports with different names.

---

## 9. Execution order (phased, concrete)

### Phase 0 — prep (30 min)
- Decide answers to open questions (§11).
- Create a branch. Nothing merges until Phase 2 closes one screen completely.

### Phase 1 — foundation (1–2 hours, highest leverage)
Mechanical, sets the visual baseline. After this the whole app looks 70% GitSlip without touching any page.
1. Swap font package: remove `@fontsource-variable/geist`, add `@fontsource-variable/inter` + `@fontsource-variable/jetbrains-mono`.
2. Replace `src/index.css` with the §5 shape. Verify no build errors.
3. Retheme shadcn primitives (`button`, `input`, `card`, `badge`, `dialog`, `tabs`, `table`, `select`) in-place per §7 rules.
4. Add new primitives: `StatusBadge`, `EntityIcon`, `BrandMark`, `PageHeader`, `EmptyState`, `Toast` (+ provider wired in `main.tsx`), `KeyHint`.
5. Flip `ThemeProvider` default from `dark` → `light`.

**Done when:** the app still runs; every existing page now has warm palette, Inter, rounded-xl cards, new primary button shape, but layout shell is still OperatorLayout.

### Phase 2 — shell swap (2–3 hours, decisive)
1. Build `AppShell` with sidebar + sticky topbar + breadcrumb + search input + avatar menu + mobile drawer. Use GitSlip's `Dashboard.tsx` as the near-verbatim source; adapt imports to React Router (`useLocation`, `useNavigate`, `<Link>`).
2. Build sidebar nav sections:
   - **PLATFORM:** Dashboard, Campaigns, Team Activity, Models
   - **ACCOUNT:** API Settings, (optional) Log out at bottom
3. Build `ParticipantShell` for `/vote/*` — no sidebar, just a thin topbar with `/` mark + campaign name + ModeToggle.
4. Wire `CommandPalette`, bound to ⌘K, with campaigns and nav as groups.
5. Replace every `<OperatorLayout>` usage with `<AppShell>`. Delete `OperatorLayout.tsx`.

**Done when:** shell matches GitSlip screenshot. Pages inside still look mid-migration — that's next.

### Phase 3 — operator screens, high-traffic first (4–6 hours)
In this order, one PR per screen is ideal:
1. **`/` OperatorHome (Campaigns list)** — map to Projects list. Biggest visual payoff. Validates `StatusBadge` + `EntityIcon` + list row composition.
2. **`/dashboard`** — KPI tiles + Recent Campaigns list + Top Models list + AttentionPanel. Reuses list composition from (1).
3. **`/settings/api`** — Settings tab composition. Cheap win.
4. **`/models`** — list + detail side panel. Use `Sheet` (shadcn) or modal for detail; retheme similarly.
5. **`/team-activity`** — activity feed timeline.
6. **`/campaign/:id`** — project-detail-style layout (tabs + production card equivalent + right sidebar). Highest composition complexity among operator screens.
7. **`/campaign/new`** — GitSlip Signup composition rebuild. Keep SSE generation stage; retype logs as GitSlip-style `LogsConsole`.
8. **`/login`** — centered card with `/` mark.

### Phase 4 — participant screens (2 hours)
1. **`/vote/:slug`** (ParticipantLanding) — centered card.
2. **`/vote/:slug/play`** (VotingInterface) — custom layout within tokens; add `KeyHint` on buttons.
3. **`/vote/:slug/results`** — table-in-card pattern.

### Phase 5 — polish (1–2 hours)
- Skeleton loaders for every page.
- Error boundaries.
- Responsive pass: mobile drawer, table overflow, voting split-pane stacking on narrow screens.
- Dark mode audit — walk every page in dark, fix any hardcoded colors not mapped to tokens.
- Kill all remaining raw hex/tailwind-color references in product code (grep for `bg-emerald`, `bg-amber`, `text-blue`, `bg-red`).

---

## 10. Risks

1. **Shallow reskin (biggest risk).** If we do Phase 1 and stop, the app will look *close* to GitSlip but still feel like a shadcn dashboard — same page-header patterns, same generic tables, no shell, no breadcrumb, no command palette, no empty states. Phase 2 is non-negotiable; Phase 3 is where the identity actually transfers.
2. **Tailwind 4 shadcn friction.** shadcn's class-variance-authority variants may bake in tokens that don't recompose well. If retheme-in-place gets gnarly for a specific primitive, fall back to rewriting it as a small GitSlip-native component (Tabs is the most likely candidate).
3. **React Router + GitSlip shell mismatch.** GitSlip's `Dashboard.tsx` manages view state via custom setters, not URLs. Porting requires translating `setView('domains')` etc. to `navigate('/domains')`. Keep the shell's internal state purely for open/closed (mobile drawer, command palette, avatar menu); all navigation goes through `useNavigate`.
4. **Command palette vs data fetching.** GitSlip's palette has the full project list in memory. ModelArena should fetch `/api/campaigns` lazily on first palette open, then cache via TanStack Query. Don't block the palette on network.
5. **Voting UI tokenization.** The split-pane battle has strong contrast requirements (model A vs model B must be visually symmetric without favoring one side). Forest green `--accent` as a winner indicator is fine, but avoid using color to distinguish A vs B — rely on position.
6. **Destructive action styling drift.** GitSlip uses the accent green for Delete-Confirm buttons (with typed-name guard), not red. ModelArena has red "Close campaign" / "Recompute" buttons. Unify: destructive primary = dark pill + typed confirmation; amber/red reserved for error states. Decide once, apply everywhere.
7. **Branding ambiguity.** See §11 Q1. If unresolved, screens get mixed `/` + "ModelArena" treatments that feel half-finished.
8. **Dark mode regressions in voting.** Participants currently see a dark-default voting UI that works. Swapping to light-default may make long voting sessions tiring. Consider keeping `/vote/*` on dark-default while operator screens go light-default. **See Q3.**

---

## 11. Decisions (answered)

**Q1. Branding → B.** ModelArena breadcrumb root (`modelarena / Page`). GitSlip logo (`/` mark), favicon, and other visual elements carry over. No "GitSlip" wordmark anywhere.

**Q2. Sidebar top-left → C.** Repurpose the `/ Org / Plan` control as a **view-mode switcher**. Primary use: toggle between "Operator" (default) and "Participant Preview" (renders the participant voting experience for a selected campaign — useful for sanity checks). Phase 1–2 ship this as a non-interactive `/ ModelArena / Operator` tile with the dropdown-chevron present but disabled. Live switching wiring in a later phase.

**Q3. Theme default → Light everywhere.** Operator screens and `/vote/*` both default to light. Dark remains a toggle.

**Q4. Destructive actions → GitSlip restraint.** Dark pill + typed-name confirmation. No red buttons. Red reserved for error/inline validation only.

**Q5. Primary CTA → Confirmed.** Dark ink (`--text-primary`) on light surface. Forest green `--accent` reserved for status chips, small links, subtle highlights.

**Q6. Auth → Password primary, alternatives de-emphasized.** Password field is the dominant affordance on `/login`. "Or sign in with [GitHub/email]" appears as a secondary row below (smaller, muted). Implemented as UI scaffolding only — backend stays password-only until alternatives are actually wired.

**Q7. Voting shortcuts → Visible kbd hints.** Small `KeyHint` pills directly under each voting button (`A` / `B` / `Tie` / `Both bad`). Discoverable without asking. A `?` help popover can still live in the header but is secondary.

**Q8. Results page shell → ParticipantShell.** Keeps the public/operator boundary clean. Gets full GitSlip treatment — typography, tokens, list-in-card composition — just without the operator sidebar.

---

## 12. Recommendation — the single best path forward

**Do phases 0 → 5 in order. Do not skip the shell swap (Phase 2) or the top three operator screens (Phase 3.1–3.3) before declaring success.** The identity transfer happens in Phase 2 + Phase 3. Phase 1 alone produces a polished-but-still-generic result.

**Inside each screen, rebuild the composition from the GitSlip reference first, then plug in ModelArena's data.** Do not try to "refactor ModelArena's JSX into GitSlip classes" — that's the shortest path to the shallow-reskin failure mode. Delete the screen's body, rewrite from the GitSlip pattern reference, wire in the existing TanStack Query calls and business logic.

**Success criterion to verify at every PR:** open the screen side-by-side with the closest GitSlip screenshot. If a visitor couldn't tell the two are different products without reading the text, that screen is done. If you can point to anything that "feels shadcn-default," it isn't.

---

## Appendix A — file-level checklist

Files to edit:
- `modelarena/src/index.css` — wholesale replace
- `modelarena/package.json` — swap fonts, add `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`; remove `@fontsource-variable/geist`
- `modelarena/src/components/ui/button.tsx` — retheme
- `modelarena/src/components/ui/input.tsx` — retheme
- `modelarena/src/components/ui/card.tsx` — retheme
- `modelarena/src/components/ui/dialog.tsx` — retheme
- `modelarena/src/components/ui/tabs.tsx` — retheme
- `modelarena/src/components/ui/badge.tsx` — retheme
- `modelarena/src/components/ui/table.tsx` — retheme
- `modelarena/src/components/ui/select.tsx` — retheme
- `modelarena/src/components/ThemeProvider.tsx` — default to `light`
- `modelarena/src/App.tsx` — swap `<OperatorLayout>` → `<AppShell>`; add ToastProvider, CommandPaletteProvider

Files to delete:
- `modelarena/src/components/layout/OperatorLayout.tsx`

Files to create (new):
- `modelarena/src/components/layout/app-shell.tsx`
- `modelarena/src/components/layout/topbar.tsx`
- `modelarena/src/components/layout/sidebar.tsx`
- `modelarena/src/components/layout/breadcrumb.tsx`
- `modelarena/src/components/layout/participant-shell.tsx`
- `modelarena/src/components/command-palette.tsx`
- `modelarena/src/components/modals/confirm-destructive.tsx`
- `modelarena/src/components/ui/status-badge.tsx`
- `modelarena/src/components/ui/entity-icon.tsx`
- `modelarena/src/components/ui/toast.tsx`
- `modelarena/src/components/ui/page-header.tsx`
- `modelarena/src/components/ui/empty-state.tsx`
- `modelarena/src/components/ui/brand-mark.tsx`
- `modelarena/src/components/ui/key-hint.tsx`

Files to rewrite (inside, not the file path):
- All pages under `modelarena/src/pages/` — rewrite body using GitSlip composition references while preserving data hooks.

Files untouched:
- `modelarena/api/**` (all Vercel Functions)
- `modelarena/src/server/**`
- `modelarena/drizzle/**`
- `modelarena/src/lib/api.ts`
- `modelarena/src/lib/models.ts`
- `modelarena/src/lib/stability.ts`
- `modelarena/src/hooks/useDocumentTitle.ts`

---

_End of plan. Awaiting answers to §11 questions before Phase 0 kickoff._
