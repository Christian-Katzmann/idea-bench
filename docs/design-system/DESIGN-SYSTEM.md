# ïdea Bench — Design System

A complete specification for the visual, typographic, interaction, and UX language of ïdea Bench. Hand this to a designer or engineer and they should be able to produce work that feels indistinguishable from the rest of the product.

---

## 0. Philosophy & Tone

The design language is **idea.com-native** — restrained, serious, and anchored by the split-sphere identity: deep ink, off-white paper, electric blue, teal, violet, coral, and warm orange. It is explicitly **not**:

- Playful
- Bright everywhere
- Neon / synthwave
- Colorful for the sake of colorful
- "Dashboard-y" in the Material / Bootstrap sense

It **is**:

- **Paper-like.** Never stark white. Backgrounds use the brand's off-white paper.
- **Restrained.** Color is information. The gradient palette appears in marks, charts, focus, and status cues; neutral chrome stays neutral.
- **Typographically serious.** Small uppercase labels do heavy lifting. Monospace is reserved for numbers and identifiers.
- **Density-aware.** Prefers compact, information-rich surfaces over generous SaaS whitespace. Lines of data, not cards of marketing copy.
- **Confident about hierarchy.** Primary actions are dark pills. Secondary actions are quiet. Destructive actions are quiet too — intent is communicated through friction (typed-name confirmation), not red paint.
- **No decorative illustrations.** Icons are Lucide, at a consistent stroke weight. No custom illustrative art.

### Voice of the UI (copy)

- Sentence case everywhere except the small uppercase labels.
- Direct, conversational, slightly dry. "Run blind pairwise evaluations across models." not "Unlock the power of AI evaluation!"
- Honesty over reassurance: surfaces tell users when data is directional, when samples are small, when they can quit and come back.
- Never exclamation marks except in error copy. Never emojis in product UI.

---

## 1. Color

### 1.1 Tokens

All color is defined through two parallel systems:

1. **`--clr-*`** — hex values, consumed by Tailwind 4's `@theme inline` block. Enables opacity modifiers (`bg-primary/80`) via `color-mix`.
2. **`--rgb-*`** — raw `R G B` triples, consumed by bespoke CSS utilities that need `rgba()` with inline alpha.

The two must stay in sync. A change to one is a bug unless the other changes with it.

### 1.2 Light palette (primary target — brand paper)

| Token | Hex | RGB | Role |
|---|---|---|---|
| `--clr-bg` | `#FEFEF5` | `254 254 245` | Page background. Brand paper, never pure white. |
| `--clr-surface` | `#FFFFFF` | `255 255 255` | Card surface. Elevated above `bg`. |
| `--clr-surface-highlight` | `#F4F6FF` | `244 246 255` | Hover/active row background. Also used for subtle inset panels and the avatar letter tile. |
| `--clr-fg` | `#0B0F2B` | `11 15 43` | Primary text / brand ink. Used for primary buttons. |
| `--clr-fg-muted` | `#64697A` | `100 105 122` | Secondary text, icons, muted body copy. |
| `--clr-border` | `#E3E6F1` | `227 230 241` | Default border for cards, inputs, dividers. |
| `--clr-accent` | `#4361EE` | `67 97 238` | Accessible brand blue. Links, active status, focus ring. |
| `--clr-success` | `#008F84` | — | Accessible teal for success chips and toasts. |
| `--clr-warning` | `#B8641E` | — | Darkened brand orange for draft/building chips and directional warnings. |
| `--clr-destructive` | `#B91C1C` | — | Deep red. **Inline error surfaces and destructive chips only — never fills a button.** |

### 1.3 Dark palette

| Token | Hex | RGB | Notes |
|---|---|---|---|
| `--clr-bg` | `#070A16` | `7 10 22` | Near-black with navy undertone. Not `#000`. |
| `--clr-surface` | `#101424` | `16 20 36` | Card surface. |
| `--clr-surface-highlight` | `#181D31` | `24 29 49` | Hover state. |
| `--clr-fg` | `#FEFEF5` | `254 254 245` | Brand paper. Not pure `#FFF`. |
| `--clr-fg-muted` | `#AEB4C7` | `174 180 199` | |
| `--clr-border` | `#252B44` | `37 43 68` | |
| `--clr-accent` | `#00D4C4` | `0 212 196` | Brand teal for readability on dark. |
| `--clr-success` | `#20E0A8` | — | |
| `--clr-warning` | `#FFA66D` | — | Brand orange. |
| `--clr-destructive` | `#F87171` | — | Softer red. |

### 1.4 Semantic map (shadcn bridge)

Tokens fed to shadcn-compatible primitives so third-party components pick up the brand automatically.

```css
--color-background:        var(--clr-bg);
--color-foreground:        var(--clr-fg);
--color-card:              var(--clr-surface);
--color-card-foreground:   var(--clr-fg);
--color-popover:           var(--clr-surface);
--color-primary:           var(--clr-fg);          /* dark ink */
--color-primary-foreground:var(--clr-bg);
--color-secondary:         var(--clr-surface-highlight);
--color-muted:             var(--clr-surface-highlight);
--color-muted-foreground:  var(--clr-fg-muted);
--color-accent:            var(--clr-accent);      /* brand blue/teal */
--color-accent-foreground: var(--clr-bg);
--color-destructive:       var(--clr-destructive);
--color-border:            var(--clr-border);
--color-input:             var(--clr-border);
--color-ring:              var(--clr-accent);      /* focus ring */

--color-surface:           var(--clr-surface);
--color-surface-highlight: var(--clr-surface-highlight);
--color-success:           var(--clr-success);
--color-warning:           var(--clr-warning);
```

### 1.5 Chart palette

Deliberately restrained, sampled from the identity gradient. No rainbow.

```
chart-1: var(--clr-accent)   /* brand blue/teal */
chart-2: var(--clr-fg)       /* ink */
chart-3: #00AFA3             /* accessible teal */
chart-4: #7B5CFF             /* violet */
chart-5: #FF8A5C             /* warm orange */
```

### 1.6 Color rules

1. **Primary CTA is dark ink on brand paper.** Not blue, not teal, not gradient-filled. The dark pill *is* the brand cue.
2. **Blue/teal is for state, not decoration.** Use for: active/live status, success toasts, focus ring, inline links, "top pick" labels. Never as a primary button fill.
3. **Red never fills a button.** It appears only on chips (e.g. "Failed"), in inline validation error surfaces (border + 10% tint + red text), and in error toasts.
4. **Amber is for provisional states.** Draft, directional, building, "treat with caution."
5. **Opacity is information too.** Directional/low-confidence rows get `opacity-70`. Placeholder text and dividers use `/60`, `/40` of the tokens.
6. **Never introduce a new hue.** If a new state is needed, it maps to one of: default (outline), success (teal), warning (orange), destructive (red), muted (secondary filled), or ghost.

---

## 2. Typography

### 2.1 Families

- **Sans (body + headings):** `Inter Variable` → fallback `Inter`, `-apple-system`, `BlinkMacSystemFont`, `sans-serif`.
  Loaded via `@fontsource-variable/inter`.
- **Monospace (numbers, IDs, kbd, `code`):** `JetBrains Mono Variable` → fallback `JetBrains Mono`, `Menlo`, `Courier New`, `monospace`.
  Loaded via `@fontsource-variable/jetbrains-mono`.
- **Heading family** = sans. There is no separate display face. Hierarchy is carried by weight and size, not by switching families.

### 2.2 Type scale & roles

| Role | Size / line | Weight | Tracking | Notes |
|---|---|---|---|---|
| Page title (default) | `text-xl` (20px) `leading-snug` | `font-semibold` | `tracking-tight` | `<PageHeader>` default. |
| Page title (large) | `text-2xl` (24px) | `font-semibold` | `tracking-tight` | Entity detail pages (campaign, model). |
| Dialog title | `text-lg` (18px) `leading-tight` | `font-semibold` | default | |
| Section title (in card header) | `text-sm` (14px) | `font-semibold` | default | `font-heading` prefix. |
| Card title | `text-base` (16px) `leading-snug` | `font-medium` | default | `text-sm` when card `size=sm`. |
| Body | `text-sm` (14px) | `font-normal` | default | Default for all surface copy. |
| Small body / description | `text-sm text-muted-foreground` | normal | default | |
| Helper / hint | `text-xs` (12px) `text-muted-foreground` | normal | default | |
| Tiny helper | `text-[11px]` | normal | default | Timestamps, subrow meta. |
| **Section label (UPPERCASE)** | `text-[10px]` | `font-medium` | `tracking-wide` or `tracking-wider` | The signature element. Used for: KPI labels, table headers, sidebar section labels, form field labels, filter group names. **Always uppercase, always 10px.** |
| Badge / chip text | `text-[10px]` | `font-medium` | `tracking-wide` | Uppercase. Pill-shaped. |
| Kbd hint | `font-mono text-[10px]` | `font-medium` | default | On a bordered pill. |
| Mono numeric | `font-mono tabular-nums` | varies | `tracking-tight` at 3xl+ | Ratings, counts, percentages. Always `tabular-nums` so column totals align. |
| KPI value | `font-mono text-3xl font-semibold tabular-nums tracking-tight` | | | The big number in a KPI tile. |
| Code inline | `font-mono text-xs text-foreground` | | | IDs, slugs, API paths. |

### 2.3 Base body

```css
html { font-family: var(--font-sans); }
body {
  @apply bg-background text-foreground antialiased;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transition: background-color 0.3s, color 0.3s;
}
```

### 2.4 Typography rules

1. **The 10px uppercase label is sacred.** Every section header, table column head, KPI label, form field label, filter group label, and metadata row uses it. Never scale it up; never change the casing. If a label doesn't fit as 10px uppercase, the label is too long — rewrite it.
2. **Monospace means "data."** Numbers you can compare, identifiers you can copy, keyboard hints. Never use mono for prose.
3. **`tabular-nums` is mandatory** anywhere numbers appear in a list, table, or column so digits don't jitter between rows.
4. **Selection is intentional.** Custom `::selection` uses `rgba(accent, 0.2)` in light and semi-transparent white in dark — it shouldn't look like browser default.
5. **Headings never get a different family.** Weight + tracking-tight + color is enough.
6. **No text-shadow.** Exception: `.text-glow` utility on very specific marketing-adjacent surfaces (extremely rare). Do not introduce new shadow effects on type.

---

## 3. Radii, Spacing, Elevation

### 3.1 Border radius scale

Radii are tokenized via a single `--radius: 0.75rem` (12px) knob. The scale derives from it:

```
--radius-sm:  calc(var(--radius) * 0.5)   /*  6px */
--radius-md:  calc(var(--radius) * 0.66)  /*  8px */
--radius-lg:  var(--radius)               /* 12px — DEFAULT for cards, panels */
--radius-xl:  calc(var(--radius) * 1.33)  /* 16px */
--radius-2xl: calc(var(--radius) * 1.8)   /* ~22px */
--radius-3xl: calc(var(--radius) * 2.4)
--radius-4xl: calc(var(--radius) * 3)
```

**Usage conventions:**

| Surface | Radius |
|---|---|
| Cards, panels, dialogs, popovers, toasts | `rounded-xl` (12px) |
| Inputs, selects (h-10), outline/secondary buttons (default size) | `rounded-lg` |
| Outline/secondary buttons at `sm` / `xs` | `rounded-md` |
| **Primary filled button (`variant=default`)** | `rounded-full` (pill) |
| Ghost icon button | `rounded-full` |
| Ghost / nav-row hover state | `rounded-md` |
| Avatar (user) | `rounded-full` |
| Entity icon (letter tile) | `rounded-md` at `sm`, `rounded-lg` at `md/lg` |
| Brand mark image | n/a; the asset carries its own circular geometry |
| Badges / chips | `rounded-full` |
| KeyHint (kbd pill) | `rounded` (4px) |
| Skeleton | `rounded-md` |
| Progress track | `rounded-full` |

### 3.2 Spacing scale

Follows Tailwind's default 4px grid. In practice the interface uses:

- `gap-1` (4px), `gap-1.5` (6px) — icon ↔ label, inline meta.
- `gap-2` (8px) — button row, form row.
- `gap-3` (12px) — card internal stacks.
- `gap-4` (16px) — default card body.
- `gap-6` (24px) — section-to-section within a page.
- `gap-8` to `gap-12` — table column gaps on wide screens.

**Card padding:**

- Default card: `p-6` (body 24px), header `px-6`.
- `size="sm"` card: `p-4` / `px-4`.
- Dashboard page main: `p-4` mobile, `md:p-8` desktop.

**Page container:** `max-w-6xl mx-auto` (1152px). Operator pages live inside this. Participant voting UI uses `max-w-5xl` for the main two-column area so outputs stay readable.

### 3.3 Elevation / shadow

Shadows are tiny and warm-neutral. No colored shadows, no glows (except the dark-mode `.text-glow` utility, used sparingly).

| Token | Use |
|---|---|
| `shadow-sm` | Default card. Barely perceptible lift. |
| `shadow-lg` | Popovers, select content, toasts. |
| `shadow-xl` | Avatar/view-switcher menus. |
| `shadow-2xl` | Dialogs (modal + mobile sidebar drawer + command palette). |
| No shadow | Sidebar, topbar, empty states, inline cards with `shadow-none`. |

**Focus ring** = `ring-2 ring-ring/30 ring-offset-0`. The ring uses the accent color. Offset is zero (ring hugs the element).

**Active ring** on inputs = `ring-2 ring-accent/20` with `border-accent/60`.

**Active press** on primary buttons = `active:translate-y-px` (subtle 1px nudge).

---

## 4. Layout & Grid

### 4.1 Global layout archetypes

**Operator shell** (`AppShell`)

- Fixed left sidebar, **256px** (`w-64`), desktop only.
- Sticky topbar, **56px** (`h-14`), translucent background with `backdrop-blur-md`.
- Main content centered, `max-w-6xl`, padding `p-4 md:p-8`.
- Mobile: sidebar collapses to a drawer with a 200ms slide-in; scrim is `bg-foreground/30 backdrop-blur-sm`.

**Participant shell** (`ParticipantShell`)

- Topbar is 48px (`h-12`) — thinner than operator.
- No sidebar. No command palette. No avatar menu.
- Topbar contents: split-sphere brand mark, optional divider + campaign name, optional right slot, theme toggle.
- Content fills full width; sub-pages choose their own max-width.

**Auth shell** (login, landing)

- No sidebar, no topbar chrome.
- Centered card, `max-w-sm` to `max-w-md`, vertical stack.
- Theme toggle pinned top-right (`absolute`).

### 4.2 Sidebar

- `w-64`, `border-r border-border`, `bg-background/80 backdrop-blur-xl`.
- First element: **ViewSwitcher** — the brand tile + product name + view-mode dropdown. 56px tall.
- Sections: grouped nav with a 10px uppercase section label, then stacked nav rows.
- Nav row:
  - Height: `py-2` + `text-sm`.
  - Layout: `icon (16px) + gap-3 + label`.
  - **Active** state: `bg-card` + `ring-1 ring-border` + `shadow-sm` + `font-medium text-foreground`. Reads as "elevated on surface," not "tinted."
  - Inactive: `text-muted-foreground` with `hover:bg-surface-highlight/60 hover:text-foreground`.
- Mobile drawer version adds a "Search" row that opens the command palette.

### 4.3 Topbar

```
[menu][breadcrumb]                       [search ⌘K] [avatar]
```

- Sticky, `z-30`.
- `bg-background/80 backdrop-blur-md`, bottom border.
- Breadcrumb = `idea-bench / Section / Detail`. Leading root links to `/`. Separator is a muted `/` glyph (`text-border`). Final segment is `font-medium text-foreground`; earlier segments are hover-underlined muted links.
- Search trigger is a 32px-tall bordered pill with `Search` icon + "Search..." text + `⌘K` right-aligned mono hint. Hidden below `md`.
- Avatar menu: circular `size-8` tile of `bg-surface-highlight`, single-letter "O" (Operator). Ring grows on hover.

### 4.4 Breakpoints

Tailwind defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.

- `md` is the sidebar breakpoint — below, the drawer pattern kicks in.
- Tables collapse columns at `md` and `lg` (status cells drop, secondary categories hide).
- Voting UI switches from single-column stack to two-column side-by-side at `md`.
- KPI grids use `grid sm:grid-cols-3` (or equivalent).

---

## 5. Components

### 5.1 Button

Built on Base UI (`@base-ui/react`) with `class-variance-authority`.

Variants:

| Variant | Shape | Fill | Use |
|---|---|---|---|
| `default` (primary) | `rounded-full`, pill | `bg-primary text-primary-foreground` — dark ink on paper | Primary CTA: "New Campaign", "Save", "Sign in", "Start voting". |
| `outline` | `rounded-lg` | `bg-card` + `border-border` | Secondary actions. Neutral weight. |
| `secondary` | `rounded-lg` | `bg-muted` (surface-highlight) | Subtle filled action, same geometry as outline. |
| `ghost` | `rounded-lg` (or `rounded-full` at icon) | Transparent | Icon buttons, menu rows, toolbars. |
| `destructive` | **Visually identical to outline.** | `bg-card` + `border-border` | Intent is communicated via typed-name confirmation, NOT color. |
| `link` | none | `text-accent underline-offset-4 hover:underline` | Inline links. |

Sizes:

| Size | Height | Gap | Padding | Text | Icon-only equivalent |
|---|---|---|---|---|---|
| `xs` | `h-6` (24) | `gap-1` | `px-2` | `text-xs` | `icon-xs: size-6` |
| `sm` | `h-8` (32) | `gap-1.5` | `px-3` | `text-[13px]` | `icon-sm: size-8` |
| `default` | `h-10` (40) | `gap-2` | `px-5` | `text-sm` | `icon: size-10` |
| `lg` | `h-11` (44) | `gap-2` | `px-6` | `text-sm` | `icon-lg: size-11` |

Behavior:

- SVG icons auto-size to `size-4` (16px) unless explicitly sized.
- `active:translate-y-px` on press — a 1px tactile nudge.
- `focus-visible` → `ring-2 ring-ring/30 ring-offset-0`.
- `aria-invalid` → `border-destructive` + `ring-2 ring-destructive/20`.
- `disabled:opacity-50` + `pointer-events-none`.

### 5.2 Card

- Base: `rounded-xl border border-border bg-card shadow-sm`.
- Default padding: `py-6`, child sections use `px-6`.
- Density via `size` prop: `sm` → `py-4`, `px-4`, tighter gap.
- `CardHeader`: auto-grid. When `CardAction` is present, switches to `grid-cols-[1fr_auto]` so the action sits flush-right.
- `CardFooter`: `border-t border-border bg-muted/40 px-6 py-4`, rounded bottom-corners. Used for form commit rows ("Save" / "Discard").
- Cards wrap list-style content by using `overflow-hidden` + `divide-y divide-border` on an inner `<ul>`. This is the **list-in-card** pattern used for campaign lists, ratings tables, action lists.

### 5.3 Input / Textarea / Select

- All share the same geometry: `h-10`, `rounded-lg`, `border-border`, `bg-card`, `px-3.5`, `text-sm`.
- Focus: `border-accent/60` + `ring-2 ring-accent/20`.
- Invalid: `border-destructive` + `ring-2 ring-destructive/20`.
- Disabled: `bg-muted/60`, `opacity-60`, `cursor-not-allowed`.
- Placeholder: `text-muted-foreground`.
- Select trigger matches Input height (`h-10` default, `h-8` for `size=sm`), uses a `ChevronDown` icon on the right.
- Select content: `rounded-lg border border-border bg-card shadow-lg`, animated in with `data-open:animate-in fade-in-0 zoom-in-95`. Item focus uses `bg-surface-highlight`, not a tinted color.

### 5.4 Label

- Sits directly above its input.
- **Form field labels use the 10px uppercase treatment** when the form is dense / card-embedded.
  Pattern: `text-[10px] font-medium uppercase tracking-wide text-muted-foreground`.
- Larger standalone labels (e.g. dialog body) fall back to `text-sm font-medium`.

### 5.5 Badge (chip)

`rounded-full`, `h-5`, `px-2`, `text-[10px]`, `font-medium`, `uppercase`, `tracking-wide`.

Variants:

| Variant | Look | Use |
|---|---|---|
| `default` | dark pill | Neutral emphasis (rare). |
| `outline` | border + muted text | **Default.** Category tags, "Completed" status. |
| `secondary` | `bg-muted` | Filled neutral tag. |
| `success` | `border-success/20 bg-success/10 text-success` | "Live", "Active", "Stable". |
| `warning` | `border-warning/25 bg-warning/10 text-warning` | "Draft", "Building", "Preliminary". |
| `destructive` | `border-destructive/25 bg-destructive/10 text-destructive` | "Failed" chips only. |
| `ghost` | text only | Inline tags without chrome. |

Icons inside badges: `size-3` (12px), optionally `animate-spin` for "Building" state.

### 5.6 StatusBadge — semantic wrapper

Maps ïdea Bench's state machines to chip variants:

| State | Variant | Icon | Label |
|---|---|---|---|
| `active` | success | — | Active |
| `live` | success | — | Live |
| `building` | warning | `Loader2` (spin) | Building |
| `draft` | warning | `CircleDashed` | Draft |
| `completed` | outline | `Check` | Completed |
| `failed` | destructive | `XCircle` | Failed |
| `directional` | outline | — | Directional |
| `preliminary` | warning | — | Preliminary |
| `stable` | success | `Zap` | Stable |

### 5.7 Tabs

Two variants, **underline is default**.

**Default (underline):**
- Tab list: full-width flex row, `gap-6`, bottom-bordered.
- Triggers: `h-10`, `-mb-px`, bottom-border transparent → `border-foreground` when active.
- Active text switches from `muted-foreground` → `foreground`.

**Pill variant:**
- Tab list: `bg-muted p-1 rounded-lg`, `h-9`.
- Triggers: `h-7`, `rounded-md`. Active → `bg-card text-foreground shadow-sm`.
- Used only in narrow toolbars where the underline would read as page chrome (currently nowhere — held for future use).

### 5.8 Table

Table is not "styled rows" — it has a distinctive head treatment.

- Container: `w-full overflow-x-auto`.
- Header: rows get `border-b border-border`. **Header cells are the 10px uppercase treatment:** `h-9`, `text-[10px] font-medium uppercase tracking-wide text-muted-foreground`. They read like section labels, not column headers.
- Body rows: `border-b border-border/60`, hover uses `bg-surface-highlight/50` (NOT `bg-muted`). Last row drops its border.
- Body cell: `px-3 py-2.5`, `align-middle`, `whitespace-nowrap`.
- Footer: `border-t border-border bg-muted/40 font-medium`.
- For leaderboards (ratings), the table is implemented as a CSS grid inside a `<ul>` so the first-place row can get a `bg-surface-highlight/30` tint. Same 10px uppercase column heads.

### 5.9 Dialog / Modal

- Built on Base UI `@base-ui/react/dialog`.
- Overlay: `fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm`, fades in 150ms.
- Content: `max-w-md` (`calc(100% - 2rem)` mobile), centered via 50/50 translate, `rounded-xl border border-border bg-card p-6 shadow-2xl`.
- Animation in: `fade-in-0 zoom-in-95`, 150ms.
- Close button: ghost icon-sm, top-right (`top-3 right-3`).
- **Header layout for destructive confirm:**
  ```
  [size-10 amber-tinted icon square]  [title + description]
  ```
  The icon square is `rounded-lg border border-warning/20 bg-warning/5 text-warning` holding `AlertTriangle`. Note: **amber, not red.**
- Footer: negative-margin flush to edges, `border-t border-border bg-muted/40`, `flex-col-reverse sm:flex-row sm:justify-end gap-2`.

### 5.10 ConfirmDestructive

Special-cased destructive flow. **Do not replace with a red button.**

- Triggers a dialog with the amber warning icon treatment above.
- Body shows a typed-name guard:
  ```
  Type [confirmWord] to confirm
  [input]
  ```
  The `confirmWord` (e.g. campaign name) is rendered inline in `font-mono font-medium text-foreground select-all` so the user can click-select it if they want.
- Confirm button is a normal primary pill — disabled until `input === confirmWord`.
- Cannot be closed during pending mutation.
- Resets input on close.

### 5.11 EmptyState

- `flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-card/30 px-6 py-14 text-center`.
- Icon in a circular container: `size-12 rounded-full border border-border bg-card text-muted-foreground`, icon `size-5`.
- Headline: `text-base font-medium text-foreground`.
- Description: `text-sm text-muted-foreground`, `max-w-sm`.
- Optional CTA below.

### 5.12 Toast

- Fixed bottom-right, `max-w-sm`, z-index `100`.
- Types: `success` (teal-border tint), `error` (red-border tint), `info` (neutral).
- Each toast: `rounded-xl border bg-card shadow-lg p-4`, `flex items-start gap-3`.
- Leading icon is color-matched (CheckCircle / AlertCircle / Info), `mt-0.5 size-4`.
- Auto-dismiss after **5 seconds** (overridable).
- Enter: `animate-in fade-in slide-in-from-bottom-2 duration-200`.
- Leave: `fade-out slide-out-to-right-2 duration-120`.
- Optional `details` (small muted subline), optional `link` (accent colored, `ExternalLink` icon).
- API: `toast.success(msg, opts?)`, `toast.error(...)`, `toast.info(...)`. Module-level store, single `<Toaster />` mount at app root.

### 5.13 Command Palette (⌘K)

- Summoned by `⌘K` / `Ctrl+K` globally within the operator shell.
- Centered overlay, starts `20vh` from top.
- Scrim: `bg-foreground/30 backdrop-blur-sm`.
- Panel: `max-w-lg rounded-xl border border-border bg-card shadow-2xl`, `fade-in-0 zoom-in-95` 150ms.
- Search input row: `h-12`, `Search` icon at left, "ESC" hint pill at right (`bg-surface-highlight`, mono 10px).
- Three groups, in order: **Campaigns** (only when there's a query), **Navigation**, **Actions**.
- Each group has a 10px uppercase label.
- Result row: `rounded-md px-3 py-2 text-sm`, `gap-3`, left-aligned icon.
- Active row: `bg-surface-highlight text-foreground`, shows a muted `↵` on the right.
- Arrow keys navigate through the flattened group order; Enter invokes; Esc closes.

### 5.14 KeyHint (kbd)

Used under voting buttons and in shortcut help popovers.

```
h-5 min-w-5 rounded border border-border bg-card
px-1 font-mono text-[10px] font-medium text-muted-foreground
shadow-[0_1px_0_rgb(var(--border))]
```

The `1px` bottom shadow mimics a physical keycap.

**Inside a primary button**, KeyHints switch to inverted tones: `border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground/80`.

### 5.15 BrandMark — split-sphere mark

The idea.com split-sphere mark: a textured circular form with dark/teal on the left, warm coral/violet on the right, and a clean vertical split. Use the image asset, not a text fallback.

Sizes:
- `sm` — 20×20, used inline in menu/list contexts.
- `md` — 28×28, used in the ViewSwitcher.
- `lg` — 36×36, used in auth-card headers.
- `xl` — 48×48, used as the hero brand on landing/login.

Assets:

- Runtime UI mark: `/public/logo-brand.png`
- Desktop/browser icon source: `assets/app-icon.png`
- Identity board references: `assets/brand/idea-identity-light.png`, `assets/brand/idea-identity-dark.png`

### 5.16 EntityIcon — letter tile

Monochrome letter avatar. **Intentionally not color-hashed** — colored avatars would read as playful and clash with the restraint.

```
border border-border bg-surface-highlight
font-medium uppercase text-muted-foreground leading-none
```

Sizes: `sm` (28px), `md` (36px), `lg` (44px) with matching type scale.

### 5.17 KPI tile

Not a shadcn Card. A denser primitive that foregrounds the number.

```
<div class="rounded-xl border border-border bg-card p-5 shadow-sm">
  <div class="mb-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
    {label}
  </div>
  <div class="font-mono text-3xl font-semibold tracking-tight tabular-nums text-foreground">
    {value}
  </div>
  <div class="mt-2 text-xs text-muted-foreground">{hint}</div>
</div>
```

Three-up on `sm:grid-cols-3` for overview dashboards.

### 5.18 ViewSwitcher

The top-left sidebar control. Combines brand + product name + view-mode dropdown.

- Resting state: `h-14`, `px-4`, BrandMark md + "ïdea Bench" (medium sm) + subtitle ("Operator" or "Participant" — the *current* view).
- On click: dropdown below with `rounded-lg border border-border bg-card shadow-xl`, a 10px uppercase "View mode" label, and menu items.
- Active item: `bg-surface-highlight` with a right-aligned `Check` icon.
- Disabled item ("Participant preview" when not on a campaign): `cursor-not-allowed text-muted-foreground/70` with a hint ("Open a campaign").

### 5.19 Skeleton

- `animate-pulse rounded-md bg-surface-highlight`.
- **No shimmer.** Pulse only. Shimmer clashes with the warm palette.
- Skeletons mirror the real layout so content settles without reflow.

### 5.20 Progress

- Track: `h-1 w-full rounded-full bg-muted`.
- Indicator: `h-full bg-primary transition-all`.
- **1px tall** — quiet, not celebratory. For voting progress, etc.

---

## 6. Signature utilities

Three custom utilities that carry distinctive visual identity. These exist as CSS classes, not components.

### 6.1 `.glass-nav`

Semi-transparent blurred bar — the topbar uses this treatment.

```css
background: rgb(var(--rgb-bg) / 0.8);
backdrop-filter: blur(16px);
border-bottom: 1px solid rgb(var(--rgb-border) / 0.5);
```

### 6.2 `.grid-bg`

Dotted-line grid, fading to center — used as a background on hero/empty sections for subtle texture.

```css
background-size: 40px 40px;
background-image:
  linear-gradient(to right, rgb(var(--rgb-border) / 0.15) 1px, transparent 1px),
  linear-gradient(to bottom, rgb(var(--rgb-border) / 0.15) 1px, transparent 1px);
mask-image: radial-gradient(circle at center, black 40%, transparent 100%);
```

### 6.3 `.scanline-bg`

The "paper texture" scanline treatment. Two crossing repeating-linear-gradients at 163° with very low-alpha warm + cool tones, masked radially. In dark mode the ochre swaps for near-black and the cool tones get a touch of warm cream. **Reserved for list-container wrappers that need texture** (e.g., "we want this feel the card patterns, not just shadcn default").

### 6.4 `.spotlight-card`

An optional hover effect: a radial light follows the mouse across a card's border (`--mouse-x`, `--mouse-y` CSS vars updated via JS). Used sparingly on marketing-adjacent hero cards. Not for dashboards.

### 6.5 `.text-glow`

A soft 40px halo behind big type.

- Light: `text-shadow: 0 0 40px rgb(var(--rgb-fg) / 0.1)` — barely perceptible.
- Dark: `text-shadow: 0 0 40px rgba(255,255,255,0.3)` — gives headlines a faint luminance.

Use on hero headlines only, never body text.

---

## 7. Iconography

- **Library:** [`lucide-react`](https://lucide.dev). Do not mix icon sets.
- **Default stroke:** Lucide default (2px). Do not restroke.
- **Sizing scale:**
  - `size-3` (12px) — inside badges.
  - `size-3.5` (14px) — inside `sm` buttons, status rows.
  - `size-4` (16px) — default inside buttons and nav rows.
  - `size-5` (20px) — topbar menu, empty-state icons.
  - Large tiles (empty states, dialog warning) = `size-5` in a `size-10` to `size-12` container.
- **Color:** `text-muted-foreground` by default; `text-foreground` when interactive-active; semantic colors (`text-success`, `text-warning`, `text-destructive`, `text-accent`) only when the icon carries state.
- **Pairing:** icon + label → `gap-1.5` to `gap-3`. Icon alone → use `icon-xs/sm/default/lg` button size.

Specific icon mapping (keep consistent across the product):

| Concept | Icon |
|---|---|
| Campaigns / Collection | `Boxes` |
| Dashboard | `LayoutDashboard` |
| Team Activity | `Activity` |
| Models / People | `Users` |
| API Settings / Key | `Key` |
| Search | `Search` |
| Create | `Plus` |
| External open | `ExternalLink` |
| Next / forward | `ChevronRight`, `ArrowRight` |
| Warn / attention | `AlertTriangle` (amber) |
| Success | `CheckCircle` / `Check` |
| Error | `AlertCircle` / `XCircle` |
| Info | `Info` |
| Close / dismiss | `X` |
| Shortcuts | `HelpCircle` |
| Theme | `Sun` / `Moon` |
| Loading | `Loader2` with `animate-spin` |
| Download / Export | `Download` |
| Copy | `Copy` → flips to `Check` for 2s on click |
| Refresh / recompute | `RefreshCw` |
| Stop / close campaign | `StopCircle` |
| Menu (mobile) | `Menu` |
| Top pick / award | `Crown` |
| Share | `Share2` |

---

## 8. Motion & Interaction

Motion is subtle, fast, and never celebratory. Target durations: **120–200ms**. Animations use Tailwind's `animate-in` / `animate-out` primitives plus Motion (Framer) for imperative transitions.

| Element | Enter | Exit |
|---|---|---|
| Dialog content | `fade-in-0 zoom-in-95`, 150ms | `fade-out-0 zoom-out-95`, 150ms |
| Dialog overlay | `fade-in-0`, 150ms | `fade-out-0`, 150ms |
| Popover / select content | `fade-in-0 zoom-in-95` (+ side-aware `slide-in-from-*-2`), 100ms | mirror |
| Toast | `fade-in slide-in-from-bottom-2`, 200ms | `fade-out slide-out-to-right-2`, 120ms |
| Menu (avatar, view-switcher) | `fade-in-0 slide-in-from-top-1`, 150ms | — |
| Mobile sidebar drawer | `translate-x` 0 → −100%, 200ms | |
| Voting card swap | Motion, `initial={opacity:0, scale:0.98}` → `animate={opacity:1, scale:1}` → `exit={opacity:0, scale:1.02}`, duration 0.15s | |
| ChevronRight on row hover | `translate-x-0.5`, color muted→foreground | |
| Button press | `active:translate-y-px` | |
| Theme swap | `body { transition: background-color 0.3s, color 0.3s; }` | |

### Interaction principles

1. **Keyboard first.** ⌘K opens palette. A/B/Tie/X vote. ?/escape toggles shortcut help. Arrow keys navigate lists. Enter submits. Esc closes.
2. **Visible shortcuts.** Where a shortcut exists, a `KeyHint` pill is shown — never hidden behind a help popover (per product stance).
3. **Optimistic feedback.** "Copied" flips `Copy` icon → `Check` for 2 seconds. "Saved" shows a toast.
4. **Pending is explicit.** Buttons swap label to "Signing in…" / "Recomputing…" with a `Loader2` spinner. Dialogs block close during pending.
5. **No skeleton shimmer.** Pulse only (see 5.19).
6. **Hover is gentle.** Row hover = `bg-surface-highlight/40` to `/60` — a whisper, not a highlight.
7. **Motion respects reduced-motion.** Built-in animation utilities honor `prefers-reduced-motion`.

---

## 9. UX patterns

### 9.1 Page composition

The standard operator page is:

```
AppShell(breadcrumb=[...])
├── PageHeader(title, description, action)
├── optional error banner (destructive tint)
└── main content
    ├── stat grid (KPIs)
    ├── main card (list | table | form)
    └── sub-cards (actions, settings)
```

**Breadcrumbs are required** on operator pages. There is no default — every page passes its trail. The root "idea-bench" segment is rendered automatically.

### 9.2 List-in-card (signature pattern)

The default list surface is a bordered card wrapping a `<ul>` with `divide-y divide-border`:

```
<div class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
  <ul class="divide-y divide-border">
    <li>[row]</li>
    ...
  </ul>
</div>
```

Each row is a `Link` with:

- Left: `EntityIcon` + name + inline category tag (10px uppercase) + optional inline-hover external-link icon.
- Right: status/metadata (hidden on mobile), `StatusBadge`, `ChevronRight` (shifts 2px on hover).

Row padding: `px-4 py-3.5` mobile, `px-5 py-4` desktop.

### 9.3 Key-value metadata blocks

For "share link, model count, prompt count" style info:

```
<div class="flex flex-col gap-1">
  <div class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
    {label}
  </div>
  <div class="flex min-h-[20px] items-center">{value}</div>
</div>
```

Values are typically mono for numeric/identifier data.

### 9.4 Inline alert surfaces

Inline banners use tinted backgrounds with matching borders — **not full-bleed colored blocks**:

```
/* warning */
flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning/10 p-3 text-xs text-warning

/* destructive */
flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive

/* info */
(same structure with border-border bg-card)
```

Icons sit `mt-0.5` (2px optical offset from the text baseline).

Title (if any) is `font-medium text-foreground` — switching to the foreground color makes the heading grounded against the tinted surface.

### 9.5 Tab pattern for entity detail pages

Entity detail pages (campaign, model) follow:

```
PageHeader(icon + title + status-badge, description, action)
Tabs: Overview | <Ratings {count}> | <Prompts {count}> | Settings
  Overview  -> KPIs + primary card + info banner
  Ratings   -> leaderboard table in card
  Prompts   -> list or empty state
  Settings  -> status card + actions card (stacked action rows)
```

Tab counts appear as a small inline `font-mono text-[10px] tabular-nums text-muted-foreground/80` suffix.

### 9.6 Action list inside settings card

Each action row (destructive or otherwise) uses:

```
[size-9 rounded-lg icon tile]  [title + description]                [outline sm Button]
```

- Icon tile: `border-border bg-surface-highlight text-muted-foreground`.
- Title: `text-sm font-medium text-foreground`.
- Description: `text-xs text-muted-foreground`.
- Button: `variant=outline size=sm`, even for destructive actions (friction via confirm dialog, not color).

### 9.7 Forms

- Labels: 10px uppercase above input.
- Single-column stack, `gap-3` to `gap-4`.
- Optional fields marked `(optional)` in the muted subline.
- Commit row: `Button` primary + `Button` variant=outline for cancel. Labels "Sign in", "Save", "Start voting" — verbs, no redundant "Submit".
- Errors: inline destructive tinted surface below the field group, not floating tooltips.
- Autofocus the first field on auth and landing screens.

### 9.8 Destructive flow

- Action lives in a "Settings" or "Danger" card as an **outline** button.
- Clicking opens a `ConfirmDestructive` dialog (see 5.10).
- The user types the entity name to unlock the confirm button.
- Confirm is a normal primary pill. Loader appears on pending. Dialog cannot be closed while pending.

### 9.9 Loading / skeleton

- Pages load into shell → render a **layout-mirroring** skeleton, not a generic spinner.
- Small inline data (fetch-then-render within a panel) uses `Loader2 + "Loading…"` centered.
- Buttons use spinner + text swap during mutation.

### 9.10 Empty states

Always use the `EmptyState` component. The dashed-border treatment + circular icon + short helpful description + single primary CTA. Never just show "No data."

### 9.11 Honesty & provisional states

A signature UX move: **the product tells the user when data is weak.**

- `StabilityChip` next to every rating. Tiers: `directional` (outline, faded row), `preliminary` (amber), `stable` (success + `Zap` icon).
- "Preference ≠ correctness" warning banner at the bottom of campaign overviews (amber tint, info icon).
- Personal results surface a directional warning when the sample is under 20 battles.
- Tooltips on stability tiers explain the sample thresholds.

Other interfaces flatter users; this one is honest about uncertainty.

### 9.12 Dual-identity shells

Operator and participant are **two separate experiences** with their own shells:

- Operator is the full app with sidebar, palette, avatar.
- Participant gets only a thin topbar with brand mark + campaign name + theme toggle.

The `ViewSwitcher` in the operator sidebar lets an operator preview the participant experience for a given campaign — opens `/campaign/:id/preview` in the same shell, switching the sidebar subtitle to "Participant."

---

## 10. Accessibility

1. **Focus visible is non-negotiable.** Every interactive element has a 2px accent ring with a transparent offset.
2. **Color is never the only signal.** Status chips have icons. Invalid inputs get a ring *and* border color change. Errors include text.
3. **Tap targets.** Minimum 40×40 on mobile for primary actions. Tertiary vote buttons (Tie / Both bad) step up to `h-11` on mobile and down to `h-8` on desktop.
4. **Reduced motion.** All animations go through `animate-in` utilities and Motion — both honor `prefers-reduced-motion`.
5. **Screen readers.**
   - Icon-only buttons always have `aria-label` or an accompanying `<span class="sr-only">`.
   - Decorative brand marks and letter tiles use `aria-hidden="true"`.
   - Breadcrumb uses `<nav aria-label="Breadcrumb">`.
   - Current nav item has `aria-current="page"`.
   - Toast container is `aria-live="polite"`.
   - Status rows use `role="status"` where appropriate.
6. **Keyboard parity.** Dialogs and menus trap focus (via Base UI). Esc closes everything dismissible. ⌘K is global within the operator shell.
7. **Scroll chrome.** Custom scrollbars are 6px, subtle (`bg-border` thumb); never disable scrollbars on long content.

---

## 11. Dark mode

Both palettes are first-class. Neither is the default hero. Theme is persisted to `localStorage['vite-ui-theme']` and applied by toggling `.dark` on `<html>`.

Rules:

- **Never use pure white or pure black.** Dark mode hero text is `#FEFEF5` (brand paper); dark mode backgrounds are `#070A16` (navy near-black).
- Every `--clr-*` and `--rgb-*` token has a dark-mode counterpart defined under `.dark`.
- Custom utilities (`.scanline-bg`, `.text-glow`, `::selection`) have explicit dark-mode variants.
- Accent shifts from brand blue (`#4361EE`) to brand teal (`#00D4C4`) for dark-mode readability.
- Theme toggle is always reachable — in the avatar menu for operators, and pinned top-right for auth / participant shells.

---

## 12. Responsiveness

Target behaviors by breakpoint:

| Breakpoint | Behavior |
|---|---|
| `<md` (mobile) | Sidebar becomes drawer. Topbar gains hamburger. Secondary table columns hide. Voting columns stack. Tertiary vote buttons grow to `h-11`. Tap targets ≥ 40px. |
| `md` (tablet) | Sidebar appears. Topbar search trigger appears. Voting columns side-by-side. Tables gain their secondary columns back progressively. |
| `lg`+ | Table columns fully expanded. Campaign rows gain inline category chips. KPI grid stays 3-up. |
| `xl`+ | Max content width is `max-w-6xl` — no further growth. |

Mobile-specific patterns:

- Drawer sidebar: scrim + 256px panel, slide-in 200ms, closes on route change.
- Dialogs: `max-w-[calc(100%-2rem)]` with 16px inset.
- PageHeader: `flex-col` below `sm`, `flex-row` at `sm+`.
- Action rows: stack footer buttons `flex-col-reverse sm:flex-row`.

---

## 13. Content & copy conventions

1. **Product name:** "ïdea Bench" in UI strings, `idea-bench` in breadcrumb root. Title-case in human-facing copy.
2. **Document title:** `{section} · ïdea Bench` (middle-dot separator).
3. **Uppercase labels** use **short noun phrases**: "SHARE LINK", "TOTAL VOTES", "WIN RATE", not sentences.
4. **Buttons are verbs:** "Sign in", "Create campaign", "Copy share link" — not "Submit" or "Go."
5. **Empty states are helpful, not cute.** Example: "No campaigns yet / Create a campaign to start evaluating models pairwise."
6. **Pending states are present progressive:** "Signing in…" "Recomputing…" "Closing…" with an ellipsis.
7. **Data-density phrasing:** "4 campaigns · 2 running" not "You have 4 campaigns and 2 of them are running."
8. **Warn with fact, not alarm:** "Your sample is small — treat this as directional." not "Warning! Low confidence!"
9. **Use `—` (em-dash)** as a null/unknown placeholder in tables and stats.

---

## 14. Tech stack & conventions

For engineers implementing new surfaces:

- **React 19** with **React Router 7**. Pages are lazy-loaded (`React.lazy`) and rendered under a `<Suspense fallback="min-h-screen bg-background">`.
- **Tailwind CSS 4** with `@theme inline` tokens. Tailwind class order follows Prettier's default.
- **Base UI (`@base-ui/react`)** for primitives — Button, Dialog, Select, Tabs, Progress, Input. `data-slot`, `data-open`, `data-active` attribute hooks power CSS states.
- **class-variance-authority (cva)** for variant-driven components (`Button`, `Badge`, `Tabs`).
- **`cn()` helper** (`clsx` + `tailwind-merge`) for merging class names. Never template-string classes.
- **Motion** (`motion/react`) for imperative animation (the voting-card crossfade). Tailwind `animate-in` utilities elsewhere.
- **TanStack Query** for all server state. `useQuery` + `useMutation`. Keys follow `['campaign', id]`, `['campaigns']`, etc.
- **Toasts** are called imperatively: `toast.success("Saved", { details: "..." })`.
- **Fonts** are self-hosted via `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono`. Never load Google Fonts directly.
- **Icons** are `lucide-react`. Use the import-per-icon pattern for tree-shaking.
- **Component files** follow shadcn's pattern: composite components (`Card`, `CardHeader`, ...) exported as siblings. Decorate with `data-slot` attributes for CSS targeting.

Folder layout:

```
src/
├── App.tsx                — router root
├── index.css              — tokens, base layer, signature utilities
├── components/
│   ├── ui/                — primitives (button, card, dialog, badge, ...)
│   ├── layout/            — app-shell, participant-shell, sidebar, topbar, breadcrumb, view-switcher, avatar-menu
│   ├── dashboard/         — KPI, AttentionPanel, other dashboard widgets
│   ├── models/            — domain component for models feature
│   ├── modals/            — ConfirmDestructive and other cross-page modals
│   ├── command-palette.tsx
│   └── ThemeProvider.tsx
├── pages/                 — one file per route
├── hooks/
├── lib/                   — api, utils, domain helpers
└── server/                — server-only primitives
```

---

## 15. Do / Don't quick reference

**Do**

- Use `rounded-full` for primary pills; `rounded-lg` for secondary controls; `rounded-xl` for containers.
- Use 10px uppercase for every label, section header, table head, metadata caption.
- Use mono + `tabular-nums` for every number you'd want to compare down a column.
- Use `EntityIcon` for list avatars (monochrome letter tile).
- Use `ConfirmDestructive` with typed-name for anything destructive.
- Honor dark mode on every new surface.
- Use `motion` or `animate-in` utilities at 120–200ms durations.
- Use shadcn's list-in-card pattern (card wrapping `ul.divide-y`) for any list with more than two items.
- Tell the truth about uncertainty (stability chips, directional warnings).

**Don't**

- Fill a button with red, teal, gradient, or any color other than dark ink. Primary is always a dark pill on light paper.
- Introduce a new hue outside the existing palette.
- Use hash-based colored avatars. Letter tile stays monochrome.
- Use shimmer skeletons. Pulse only.
- Mix icon libraries. Lucide only.
- Use text shadows on body text.
- Write sentence-case uppercase labels (`Share Link` vs `SHARE LINK` — use `SHARE LINK`).
- Hide keyboard shortcuts. Show them with `KeyHint`.
- Ship a destructive action without the typed-name confirm guard.
- Leave a list without an empty state.
- Make a page without a breadcrumb.

---

## 16. Example compositions

### 16.1 An operator list page (minimal)

```tsx
<AppShell breadcrumb={[{ label: 'Campaigns' }]}>
  <PageHeader
    title="Campaigns"
    description="Run blind pairwise evaluations across models."
    action={<Button><Plus className="size-4" />New campaign</Button>}
  />

  {empty ? (
    <EmptyState
      icon={Boxes}
      title="No campaigns yet"
      description="Create a campaign to start evaluating models pairwise."
      action={<Button><Plus className="size-4" />Create campaign</Button>}
    />
  ) : (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <ul className="divide-y divide-border">
        {items.map(item => (
          <li key={item.id}><Row item={item} /></li>
        ))}
      </ul>
    </div>
  )}
</AppShell>
```

### 16.2 A KPI strip

```tsx
<div className="grid gap-3 sm:grid-cols-3">
  <StatTile label="Total votes" value={stats.totalVotes} />
  <StatTile label="Unique participants" value={stats.uniqueParticipants} />
  <StatTile label="Elapsed" value="3 days ago" mono={false} />
</div>
```

### 16.3 A form card

```tsx
<div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
  <form className="flex flex-col gap-4 p-6">
    <div className="flex flex-col gap-2">
      <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Password
      </Label>
      <Input type="password" autoFocus />
    </div>
    <Button type="submit" className="w-full">Sign in</Button>
  </form>
</div>
```

### 16.4 A destructive action

```tsx
<ActionRow
  icon={<StopCircle className="size-4" />}
  title="Close campaign"
  description="Stop accepting new participants."
  actionLabel="Close campaign"
  onClick={() => setIsCloseOpen(true)}
/>

<ConfirmDestructive
  open={isCloseOpen}
  onOpenChange={setIsCloseOpen}
  title="Close campaign"
  description={<>New participants will no longer vote on <b>{name}</b>.</>}
  confirmWord={name}
  confirmLabel="Close campaign"
  isPending={closing}
  onConfirm={runClose}
/>
```

---

## 17. Version

This document reflects the system as implemented in the `idea-bench` codebase as of **2026-04-19**. When tokens, primitives, or conventions change, update both the code and this document in the same PR.

If you're introducing something this document doesn't cover, the test is: **does it feel like it could sit beside every other surface in the product without explanation?** If not, push back on the scope or extend the system here first.
