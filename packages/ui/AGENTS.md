# Bruhs Design System — Agent Guide

A framework-agnostic design system. OKLCH fruit-named colors, Monaspace all-mono typography, warm-dark neutrals, elevation by tone and ring (no drop shadows). Works anywhere Tailwind CSS v4 runs (React, Vue, Svelte, Astro, Solid, Leptos, Go templates, Rails, raw HTML), and also works zero-build via a precompiled CSS bundle.

This document is self-contained. Read it once and implement. Do not invent tokens, scale values, or class names — use exactly what's listed here.

---

## 1. Adoption

### Option A — Tailwind v4 project (preferred)

```css
/* your-app.css */
@import "tailwindcss";
@import "@bruhs/theme/styles/index.css";
```

Ensure fonts are served at `/fonts/*` (the CSS references them via relative paths). Copy `@bruhs/theme/fonts/*` into your `public/fonts/` at build time, or link them in via your bundler.

The import also sets document defaults (canvas colour, text colour, Monaspace Neon as the default and `font-mono` family, and the persimmon focus ring), so an unstyled page is already Bruhs. See §12.

### Option B — Zero-build / cross-language (Leptos, Go, Rails, plain HTML)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@bruhs/theme/dist/bruhs.css">
```

All utilities are pre-compiled. Fonts load from the CDN too. Drop into any HTML document.

### Option C — Copy-paste

Download `dist/bruhs.css` + the `fonts/` directory from the package. Serve them from your own host.

---

## 2. Core philosophy

Four non-negotiable rules that define Bruhs:

1. **All-mono typography.** Every pixel of text is a Monaspace variant. No sans-serif, no system fonts.
2. **Warm-dark neutrals.** The canvas is `longan` (warm brown-black), not gray or pure black.
3. **No drop shadows.** Elevation is expressed by tone step + `inset-ring`. `shadow-xs` through `shadow-2xl` do not exist in Bruhs.
4. **Persimmon is the brand.** Reserved for primary actions, focus, and "pay attention" moments. Never use it as ambient chrome.

---

## 3. Color vocabulary

Ten named scales. Every scale has 11 steps (`50`, `100`, `200`, …, `900`, `950`) in OKLCH. Use the semantic name, not a hex.

| Token | Role | Tint |
|-------|------|------|
| `lychee` | Errors, destructive actions, critical alerts | Red |
| `persimmon` | Primary actions, brand, focus, bloom | Orange |
| `durian` | Warnings, attention highlights | Yellow |
| `pandan` | Success, live indicators, positive states | Green |
| `blueberry` | Informational, links, selection | Blue |
| `mangosteen` | Decorative, secondary accents | Purple |
| `dragonfruit` | Decorative, tertiary accents | Pink |
| `rambutan` | Foreground text, UI surfaces | Warm gray |
| `longan` | Background canvas, panels, cards | Warm brown-black |
| `bruh-{base,eye,mouth}` | Mascot branding only | Custom |

### Utilities

Any Tailwind color utility works with these names:

- `bg-persimmon-500`, `text-rambutan-100`, `border-pandan-400`
- `ring-persimmon-500`, `inset-ring-white/10`, `outline-persimmon-400`
- `fill-lychee-400`, `stroke-durian-300`, `decoration-blueberry-500`
- `divide-rambutan-100/10`, `accent-persimmon-500`

Opacity modifiers on a color scale (`bg-persimmon-500/15`) are the primary way to produce soft/muted tints. **Do not** introduce new shades; use opacity.

### Canvas / panel / card tones

| Surface | Class | Background | Ring |
|---------|-------|------------|------|
| Page canvas | (theme default on `<body>`) | `bg-longan-950` | — |
| Panel / sidebar / nav | `surface-panel` | `bg-longan-900` | `inset-ring inset-ring-white/5` |
| Card | `surface-card` | `bg-longan-800` | `inset-ring inset-ring-white/10` |
| Floating (popover, menu) | `surface-floating` | `bg-longan-700` | `inset-ring inset-ring-white/15` |
| Modal | `surface-modal` | `bg-longan-800` on `bg-longan-950/70` scrim | `inset-ring inset-ring-white/20` |
| Well (recessed) | `surface-well` | `bg-longan-900/60` | `inset-ring inset-ring-white/5` |

---

## 4. Radius vocabulary

Fruit-named scale. **Never** use `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, or `rounded-full` — those are not Bruhs vocabulary.

| Class | Value | Use for |
|-------|-------|---------|
| `rounded-seed` | 4px | Tags, micro-chips, dense controls |
| `rounded-grape` | 8px | Buttons, inputs, badges |
| `rounded-lychee` | 14px | Cards, panels, sidebar items |
| `rounded-mango` | 22px | Hero tiles, media containers |
| `rounded-pomelo` | 36px | Marketing blocks, pull-quotes |
| `rounded-orb` | full | Avatars, pills, toggles, dots |

Directional variants work: `rounded-l-grape`, `rounded-tr-lychee`, `rounded-b-mango`, etc.

### Concentric nesting

For nested rounded elements, enforce `inner = outer − padding`:

```html
<div class="rounded-mango p-4 [--radius:var(--radius-mango)] [--padding:--spacing(4)]">
  <div class="rounded-[calc(var(--radius)-var(--padding))] p-4">inner</div>
</div>
```

---

## 5. Typography

Every `.text-*` utility self-sets its Monaspace variant. **Do not** apply `font-*` utilities on top of `.text-*` — the role system is the source of truth.

| Class | Font | Size | Weight | Use for |
|-------|------|------|--------|---------|
| `text-display-lg` | Krypton | clamp(40…72px) | 300 | Hero headlines |
| `text-display-md` | Krypton | clamp(32…56px) | 400 | Section heroes |
| `text-display-sm` | Krypton | clamp(28…44px) | 400 | Page headers |
| `text-h1` | Xenon | clamp(24…32px) | 500 | Primary headings |
| `text-h2` | Xenon | 24px | 500 | Section headings |
| `text-h3` | Xenon | 20px | 500 | Sub-sections |
| `text-h4` | Xenon | 18px | 500 | Component headings |
| `text-body-lg` | Neon | 18px | 400 | Lead paragraphs |
| `text-body` | Neon | 16px | 400 | Default prose |
| `text-body-sm` | Neon | 14px | 400 | Dense / secondary prose |
| `text-label-lg` | Argon | 16px | 500 | Form labels |
| `text-label` | Argon | 14px | 500 | UI labels, metadata |
| `text-label-sm` | Argon | 12px | 500 | Captions, annotations |
| `text-eyebrow` | Argon | 11px, uppercase | 500 | Label above a heading or group |
| `text-code-lg` | Neon | 16px | 400 | Code blocks |
| `text-code` | Neon | 14px | 400 | Inline code |
| `text-code-sm` | Neon | 12px | 400 | Small code annotations |
| `text-button-lg` | Argon | 16px | 500 | Primary action buttons |
| `text-button` | Argon | 14px | 500 | Standard buttons |
| `text-button-sm` | Argon | 12px | 500 | Compact buttons, chips |
| `text-callout` | Radon | 18px | 400 | Pull quotes, asides |

### Rules

- **Never use `font-bold`** — use `font-semibold` (600) or `font-medium` (500).
- **Never add `leading-*` to headings** — the role utility already sets line-height.
- **Add `text-balance` to headings, `text-pretty` to body paragraphs.**
- **Constrain prose width** with `max-w-[65ch]` or `max-w-[72ch]` on the block.
- **Add `tabular-nums`** to any element displaying numbers that change (counters, prices, stats).
- **Never apply `text-*` utilities to inline elements** (`<span>`, `<a>`, `<strong>`, `<em>`, `<code>`). They inherit from their block-level parent. For inline `<code>`, apply only color (`text-rambutan-200`) — the parent's `text-body`/`text-body-sm` already sets the Neon mono font.
- **`text-code-*` utilities are for block code** (`<pre>`, `<div>` wrappers). For inline code, omit them.

---

## 6. Elevation

No `shadow-*` utilities. Elevation is a two-lever system:

| Step | Class | Background | Ring |
|------|-------|------------|------|
| Canvas | — | `bg-longan-950` | — |
| Panel | `surface-panel` | `bg-longan-900` | `inset-ring-white/5` |
| Card | `surface-card` | `bg-longan-800` | `inset-ring-white/10` |
| Floating | `surface-floating` | `bg-longan-700` | `inset-ring-white/15` |
| Modal | `surface-modal` | `bg-longan-800` | `inset-ring-white/20` |

Each `surface-*` class sets the tone, the ring and `rounded-lychee`; override the radius with any `rounded-*`. Add `surface-interactive` to a clickable surface to lift its ring one step on hover.

### Stacking layers

Prefer the top layer: a native `<dialog>` or a `[popover]` element never needs a z-index. Otherwise use a named layer, never a number:

| Class | Value | Use for |
|-------|-------|---------|
| `z-raised` | 10 | Lifted above siblings |
| `z-sticky` | 20 | Sticky headers and toolbars |
| `z-overlay` | 40 | Scrims, off-canvas backdrops |
| `z-modal` | 50 | Drawers and non-native modals |
| `z-popover` | 60 | Menus and command palettes (above a modal) |
| `z-toast` | 70 | Toasts |
| `z-tooltip` | 80 | Tooltips |

The values are an order, not a scale. `--z-raised` … `--z-tooltip` are on `:root` for plain CSS.

### Bloom

One exception: `--shadow-bloom` is a persimmon glow reserved for focus states, active triggers, and deliberate attention accents.

```html
<button class="[box-shadow:var(--shadow-bloom)]">Focused</button>
```

Do not introduce your own glows in other colors.

---

## 7. Motion

Animation timing is tokenized so transitions feel coordinated across the system. Five durations, four easings — all exposed as CSS custom properties and as `duration-*` / `ease-*` Tailwind utilities.

### Durations

| Token | Value | Use for |
|-------|-------|---------|
| `duration-blink` | 80ms | Instant feedback — radio select, keyboard nav, typeahead |
| `duration-fast` | 150ms | Hover, button press, small state changes (default) |
| `duration-standard` | 250ms | Expand, fade, slide |
| `duration-slow` | 400ms | Page-level transitions, big panel moves |
| `duration-bloom` | 600ms | Deliberate attention moments, bloom accents |

`--default-transition-duration` is set to `var(--duration-fast)`, so a bare `class="transition"` uses 150ms automatically.

### Easings

| Token | Curve | Use for |
|-------|-------|---------|
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default for most UI transitions |
| `ease-entrance` | `cubic-bezier(0, 0, 0, 1)` | Content entering view (slide-in, fade-in) |
| `ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Content leaving view (slide-out, fade-out) |
| `ease-bloom` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful overshoot — reserved for bloom/attention accents |

### Rules

- **Bare `transition` gets the right default.** Don't reach for `duration-150` manually.
- **Pair durations with their intended easings.** `duration-standard ease-standard` for expand/fade; `duration-bloom ease-bloom` only for brand moments.
- **Respect `prefers-reduced-motion`.** Wrap non-essential motion in `motion-safe:` variants.
- **Never use durations > 1000ms** except for splash/onboarding moments.

---

## 8. Spacing

Tailwind's default 4px grid (`--spacing: 0.25rem`) is the only spacing rhythm. Every gap, padding, and margin should be a multiple of 4px.

### Common patterns

| Context | Value | Why |
|---------|-------|-----|
| Inline gap (button → icon, badge → text) | `gap-1.5` (6px) | Tight without touching |
| Form label → field | `gap-2` (8px) | Tightly bound |
| Form field → field | `gap-6` (24px) | Clear separation without feeling loose |
| Card padding (compact) | `p-4` (16px) | Dense apps |
| Card padding (default) | `p-6` (24px) | Standard |
| Section → section | `gap-12 md:gap-16` (48/64px) | Breathing room on long pages |
| Page padding | `p-6 md:p-8` (24/32px) | Mobile-first |

### Rules

- **Never use `mt-*`/`mb-*`/`ml-*`/`mr-*`/`mx-*`/`my-*` between flex or grid children** — use `gap-*` on the parent.
- **Prefer shorthand over split axes.** `p-4` not `px-4 py-4`; keep them split only when a variant overrides one axis (e.g. `p-6 md:px-8`).
- **Use `--spacing(…)` for arbitrary spacing values** — `--padding: --spacing(3)` not `12px` or `0.75rem`.
- **Never use `calc(var(--spacing)*…)`** — use `--spacing(…)`.
- **Never use `theme(spacing.…)`** — use `--spacing(…)`.

---

## 9. Responsive breakpoints

Mobile-first. Tailwind's default breakpoints apply: `sm:` 640px, `md:` 768px, `lg:` 1024px, `xl:` 1280px, `2xl:` 1536px.

### Layout shifts

| Shift | At breakpoint |
|-------|---------------|
| 1 → 2 column | `md:` (768px) |
| 2 → 3 column | `lg:` (1024px) |
| 3 → 4 column | `xl:` (1280px) |
| Off-canvas nav → in-flow sidebar | `lg:` (1024px) |
| Page padding 24px → 32px | `md:` (768px) |
| Section gap 48px → 64px | `md:` (768px) |

### Typography

- **Display and headings use `clamp()` internally** — don't add `md:text-*` overrides to them. The role utilities handle fluid scaling.
- **Body text is fixed** at its declared size. If a context needs `text-body-sm` at desktop density, bump it to mobile-base via `max-sm:text-base/6`.

### Rules

- **Always `min-h-dvh`**, never `min-h-screen` (deprecated).
- **Touch targets stay ≥44×44px** regardless of breakpoint. Use the absolute overlay pattern for small icon buttons.
- **Reconfigure dividers per breakpoint** when column count changes — see §10.19.
- **Checkboxes, radios, toggles are bigger on mobile** (`size-5 sm:size-4`, `w-11 sm:w-9`) for finger-friendliness.

---

## 10. Component patterns

The common pieces ship as classes in `@bruhs/theme` (`src/styles/components.css`), so apps don't rebuild them from utility strings. They sit in the `components` layer: any utility on the same element wins, so `btn btn-primary w-full` and `surface-card rounded-mango` behave as you'd expect. Patterns that are still utility strings follow after them.

### 10.1 Buttons

`btn` plus one tone: `btn-primary`, `btn-soft`, `btn-outline`, `btn-ghost`, `btn-soft-danger`, `btn-danger`. Add `btn-sm` for the small size and `btn-icon` for a square icon-only button.

```html
<button type="button" class="btn btn-primary">Save</button>
<button type="button" class="btn btn-soft">Cancel</button>
<button type="button" class="btn btn-outline">Details</button>
<button type="button" class="btn btn-ghost">Skip</button>
<button type="button" class="btn btn-soft-danger">Remove</button>
<button type="button" class="btn btn-danger">Delete account</button>
<button type="button" class="btn btn-soft btn-sm">Resend code</button>
```

- **One `btn-primary` per page or dialog.** Its ring matches the fill exactly.
- **Destructive actions use `btn-soft-danger`** unless deleting is the purpose of the page or dialog; then `btn-danger`.
- **Sizes:** default is about 36px, `btn-sm` about 28px. At most two sizes per surface.
- **Disabled** (`disabled` or `aria-disabled="true"`) fades to 60% and ignores hover. Works on `<a class="btn">` too.
- **Icons:** asymmetric padding, the icon side matching the vertical padding: `btn btn-primary pl-2` for a leading icon, `pr-2` for a trailing one.
- **Icon-only:** `btn btn-ghost btn-icon` with an `aria-label`. On touch screens it gets an invisible 48px hit area.

```html
<button type="button" class="btn btn-primary pl-2">
  <svg viewBox="0 0 16 16" fill="currentColor" class="size-4 shrink-0"><!-- icon --></svg>
  New item
</button>
<button type="button" class="btn btn-ghost btn-icon" aria-label="Close">
  <svg viewBox="0 0 16 16" fill="currentColor" class="size-4"><!-- icon --></svg>
</button>
```

### 10.2 Text input and textarea

```html
<div class="flex flex-col gap-2">
  <label for="email" class="text-label text-rambutan-200">Email</label>
  <input id="email" name="email" type="email" placeholder="you@bruhs.dev" class="input" />
</div>
<textarea id="bio" name="bio" rows="3" class="input"></textarea>
```

`aria-invalid="true"` switches to the lychee error state; point `aria-describedby` at the message. The focus ring insets (`-1px`) so it never spills outside the field.

### 10.3 Surfaces

`surface-panel`, `surface-card`, `surface-floating`, `surface-modal`, `surface-well`; see §6 for when each applies.

```html
<div class="surface-card p-6">
  <h3 class="text-h3 text-rambutan-100 mb-2">Card title</h3>
  <p class="text-body text-rambutan-300">Card body.</p>
</div>
<a href="/settings" class="surface-panel surface-interactive block p-5">Settings</a>
```

### 10.4 Dialog

`dialog` styles a native `<dialog>` opened with `showModal()`: modal surface, `rounded-mango`, the longan scrim on `::backdrop`, and a 250ms fade and scale that's skipped under reduced motion.

```html
<dialog id="trash" class="dialog" aria-labelledby="trash-title">
  <form method="dialog" class="flex flex-col gap-4">
    <h2 id="trash-title" class="text-h3">Move to Trash?</h2>
    <p class="text-body-sm text-rambutan-400">You can restore it for 30 days.</p>
    <div class="flex justify-end gap-3">
      <button value="cancel" class="btn btn-ghost">Cancel</button>
      <button value="confirm" class="btn btn-danger">Move to Trash</button>
    </div>
  </form>
</dialog>
```

If clicking the backdrop should close it, put the padding on an inner wrapper (`dialog p-0`), since a click on the padding counts as a click on the dialog itself.

### 10.5 Menu, listbox and command palette

`popover` is the floating surface (works on a `[popover]` element or a positioned div, where it takes `z-popover`). `menu-item` is each row; it highlights on hover and when marked `aria-selected`, `aria-pressed`, `aria-current` or `data-highlighted`, which covers cmdk and most listbox libraries.

```html
<div class="popover w-64" role="menu" aria-label="File">
  <button type="button" class="menu-item" role="menuitem">Rename</button>
  <button type="button" class="menu-item" role="menuitem" data-highlighted>Duplicate</button>
  <button type="button" class="menu-item" role="menuitem" aria-disabled="true">Share</button>
</div>
```

### 10.6 Tooltip

`tooltip` is the bubble only. Show it from the trigger, and keep `aria-label` or `aria-describedby` on the trigger: screen readers don't see hover.

```html
<button type="button" class="group relative btn btn-ghost btn-icon" aria-describedby="tip">
  <svg viewBox="0 0 16 16" fill="currentColor" class="size-4" aria-hidden="true"><!-- icon --></svg>
  <span id="tip" role="tooltip" class="tooltip absolute bottom-full left-1/2 mb-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Copy link</span>
</button>
```

### 10.7 Segmented control

For two to four mutually exclusive views. The active item carries `aria-pressed`, `aria-selected` or `aria-checked`.

```html
<div class="segmented" role="group" aria-label="View">
  <button type="button" class="segmented-item" aria-pressed="true">Preview</button>
  <button type="button" class="segmented-item" aria-pressed="false">Code</button>
</div>
```

### 10.8 Code and keys

```html
<pre class="code-block"><code>pnpm add @bruhs/theme</code></pre>
<p class="text-body">Run <code class="code-inline">pnpm check</code> first.</p>
<kbd class="kbd">⌘</kbd><kbd class="kbd">K</kbd>
```

`code-block` scrolls sideways instead of wrapping. With a syntax highlighter, drop the highlighter theme's own background so the block's shows.

### 10.9 Spinner

```html
<span class="spinner size-4 text-rambutan-400" aria-hidden="true"></span>
```

Size from `size-*` or the font size, colour from the text colour, stroke from `--spinner-width` (default 2px). It keeps turning, more slowly, under reduced motion. Pair it with visible text or a label on its button.

### 10.10 Empty, error and 404 states

```html
<main class="empty-state min-h-dvh">
  <p class="text-eyebrow text-rambutan-500">404</p>
  <h1 class="text-h1">This page doesn't exist</h1>
  <p class="text-body-sm">It may have moved. Head back and search from there.</p>
  <a href="/" class="btn btn-primary mt-4">Go home</a>
</main>
```

One action per empty state; say what's missing and what to do next.

### 10.11 Badge — soft

```html
<span class="inline-flex items-center rounded-grape bg-pandan-500/15 text-pandan-200 px-2 py-1 text-label-sm inset-ring inset-ring-pandan-400/20">
  Live
</span>
```

Pattern: any accent tone with `-500/15` bg, `-200` text, `-400/20` ring. Works for `lychee`, `persimmon`, `durian`, `pandan`, `blueberry`, `mangosteen`, `dragonfruit`, `rambutan`.

### 10.12 Badge — outline

```html
<span class="inline-flex items-center rounded-grape px-2 py-1 text-label-sm text-persimmon-300 inset-ring inset-ring-persimmon-400/30">
  Draft
</span>
```

### 10.13 Badge with icon

```html
<span class="inline-flex items-center gap-1 rounded-grape bg-pandan-500/15 text-pandan-200 inset-ring inset-ring-pandan-400/20 py-1 pr-2 pl-1 text-label-sm">
  <svg viewBox="0 0 16 16" fill="currentColor" class="size-3.5 shrink-0"><!-- icon --></svg>
  Live
</span>
```

### 10.14 Select

```html
<span class="inline-grid grid-cols-[1fr_--spacing(8)] rounded-grape bg-white/5 inset-ring inset-ring-white/10 focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-persimmon-400">
  <select
    id="fruit"
    name="fruit"
    class="col-span-full row-start-1 appearance-none bg-transparent px-3 py-2 pr-8 text-body text-rambutan-100 focus:outline-hidden"
  >
    <option>Lychee</option>
    <option>Persimmon</option>
    <option>Durian</option>
  </select>
  <svg viewBox="0 0 8 5" width="8" height="5" fill="none" class="pointer-events-none col-start-2 row-start-1 place-self-center text-rambutan-400">
    <path d="M.5.5 4 4 7.5.5" stroke="currentcolor" />
  </svg>
</span>
```

For error state: swap wrapper to `bg-lychee-500/5 inset-ring-lychee-400/40 focus-within:outline-lychee-400`.

For disabled: add `disabled` to `<select>` and `opacity-60 bg-white/[0.02] inset-ring-white/5` on the wrapper.

For a leading icon: use `grid-cols-[--spacing(9)_1fr_--spacing(8)]` and place the icon at `col-start-1 row-start-1`.

### 10.15 Checkbox

Supports three states: unchecked, checked, indeterminate. The indeterminate state is a DOM property — set `input.indeterminate = true` in JavaScript (it is not an HTML attribute).

```html
<div class="flex items-center gap-2 text-body text-rambutan-200">
  <span class="h-lh items-center inline-flex">
    <span class="group inline-grid size-5 sm:size-4 grid-cols-1">
      <input
        id="agree"
        name="agree"
        type="checkbox"
        class="col-start-1 row-start-1 appearance-none rounded-seed border border-white/10 bg-white/5 checked:border-persimmon-500 checked:bg-persimmon-500 indeterminate:border-persimmon-500 indeterminate:bg-persimmon-500 disabled:border-white/5 disabled:bg-white/10 disabled:checked:bg-white/10 forced-colors:appearance-auto"
      />
      <svg viewBox="0 0 14 14" fill="none" class="pointer-events-none col-start-1 row-start-1 size-7/8 self-center justify-self-center stroke-longan-950 group-has-disabled:stroke-white/25">
        <path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-not-has-checked:opacity-0" />
        <path d="M3 7H11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-not-has-indeterminate:opacity-0" />
      </svg>
    </span>
  </span>
  <label for="agree">I agree</label>
</div>
```

### 10.16 Radio

Identical structure to checkbox but with:
- `type="radio"` on the input
- `rounded-orb` (not `rounded-seed`)
- A filled dot indicator: `<span class="pointer-events-none col-start-1 row-start-1 size-[round(down,40%,1px)] self-center justify-self-center rounded-orb bg-longan-950 group-not-has-checked:opacity-0"></span>`

### 10.17 Toggle

```html
<div class="group relative inline-flex w-11 sm:w-9 shrink-0 rounded-orb bg-white/5 p-0.5 inset-ring inset-ring-white/10 outline-persimmon-500 outline-offset-2 has-checked:bg-persimmon-500 has-focus-visible:outline-2 transition-colors">
  <span class="aspect-square w-1/2 rounded-orb bg-white ring-1 ring-white/10 transition-transform group-has-checked:translate-x-full"></span>
  <input id="enabled" name="enabled" type="checkbox" aria-label="Enable" class="absolute inset-0 size-full appearance-none focus:outline-hidden" />
</div>
```

### 10.18 Divided grid

```html
<ul role="list" class="grid grid-cols-3">
  <li class="p-6"><!-- first item: no left border --></li>
  <li class="p-6 [&:not(:nth-child(3n+1))]:border-l [&:not(:nth-child(3n+1))]:border-rambutan-100/10"></li>
  <li class="p-6 [&:not(:nth-child(3n+1))]:border-l [&:not(:nth-child(3n+1))]:border-rambutan-100/10"></li>
</ul>
```

Reconfigure divider patterns when column count changes at a breakpoint.

---

## 11. Icons

Use [Heroicons](https://heroicons.com) as the default set.

**Never scale icons.** The viewBox size determines the Tailwind size class, exactly:

| Set | viewBox | Class |
|-----|---------|-------|
| Heroicons Micro | `0 0 16 16` | `size-4` |
| Heroicons Mini | `0 0 20 20` | `size-5` |
| Heroicons Outline | `0 0 24 24` | `size-6` |

- **App UIs (dashboards, settings, forms):** Micro only.
- **Navigation lists, marketing:** Mini.
- **Hero illustrations:** Outline.

### Rules

- Always add `shrink-0` to icons inside flex/grid containers.
- Align icons with adjacent text using `h-lh`.
- Use `fill-*` for filled icons and `stroke-*` for stroked icons. Never use `text-*` with `currentColor` (legacy hack).
- Never wrap icons in decorative containers (colored squares, circle backgrounds).

### Icon-only buttons

Use `btn btn-icon` with an `aria-label`. On coarse pointers it adds an invisible 48×48 hit area, so a 32px button still meets mobile tap requirements:

```html
<button type="button" class="btn btn-ghost btn-icon" aria-label="Settings">
  <svg viewBox="0 0 16 16" fill="currentColor" class="size-4"><!-- icon --></svg>
</button>
```

---

## 12. Global document setup

Importing the theme already sets, in the base layer:

- `color-scheme: dark` and font smoothing on `<html>`
- `bg-longan-950` and `text-rambutan-100` on `<body>`
- Monaspace Neon as Tailwind's `font-sans` and `font-mono`, so unstyled text and `font-mono` stay in the system
- a `:focus-visible` outline of 2px `persimmon-400` at a 2px offset on everything

So a document only needs:

```html
<html lang="en">
  <body>
    <main class="isolate min-h-dvh">
      <!-- app -->
    </main>
  </body>
</html>
```

- `isolate` on the main container: prevents z-index conflicts with portalled elements.
- `min-h-dvh`: modern viewport unit, avoids `min-h-screen`.
- Don't restate the body colours or the focus ring per element. Override the focus colour only where it means something (`btn-danger` uses `lychee-400`).

---

## 13. Accessibility checklist

- Every form control has a `name` attribute and either a `<label>` (associated via `for`/`id`) or an `aria-label`.
- Every `<button>` has an explicit `type` attribute (`"submit"` inside forms, `"button"` otherwise).
- All `<ul>` and `<ol>` in flex/grid layouts get `role="list"` (Safari strips the implicit role when `list-style: none` is applied).
- Touch targets are at least 44×44px. Small icon buttons use the absolute overlay pattern above.
- Focus rings are always visible: the theme sets one on every `:focus-visible` element. Never remove it with `outline-none` unless you draw a replacement.
- On `<input>` and `<textarea>`, use `-outline-offset-1` so the focus ring insets rather than spilling outside.
- Form controls must never conjoin an input with a button into a shared border — leave a gap or nest the button visually.

---

## 14. Hard bans (never do these)

1. **Never use `shadow-xs`, `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl`.** Bruhs has no drop-shadow system. Use tone-step + `inset-ring` instead.
2. **Never use `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-full`.** Use the fruit names.
3. **Never use pure `#000`, `bg-black`, or gray/slate/zinc/neutral scales.** Use `longan-950` or the `rambutan` neutral for foreground.
4. **Never override the typography role with `font-*` utilities.** Let `.text-*` classes declare the font.
5. **Never use `font-bold`.** Use `font-semibold` or `font-medium`.
6. **Never scale an icon.** Match viewBox size to size class.
7. **Never use `text-xs` for body copy.** Minimum body size is `text-sm` and only above `sm:` breakpoints; mobile default is `text-base`.
8. **Never wrap an icon in a colored square or circle.**
9. **Never use reduced-opacity rings on a solid primary button.** The ring must match the fill color.
10. **Never place more than one filled primary button on a single page/dialog.**

---

## 15. Opacity conventions

When you need a softer tint of a color, use opacity modifiers on the scale:

| Pattern | Use for |
|---------|---------|
| `-500/15` | Soft backgrounds (badges, tinted panels) |
| `-400/20` | Soft ring pairing for `-500/15` backgrounds |
| `-400/30` | Outline-style ring on transparent background |
| `white/5`, `white/10`, `white/15`, `white/20` | Elevation rings on dark surfaces |
| `longan-950/70` | Modal / drawer scrim |

---

## 16. Focus & state pattern reference

- **Focus (keyboard):** provided by the theme. Change only the colour or offset when needed, e.g. `focus-visible:outline-lychee-400`.
- **Focus inside input:** `input` insets it with `-outline-offset-1`; for a custom field, add `focus-visible:-outline-offset-1`.
- **Hover (elevated surfaces):** bump the `inset-ring` opacity by 5 (`white/5` → `white/10`) and optionally tone-step the background.
- **Active / pressed:** darker fill (`bg-persimmon-600` for primary) or `active:scale-[0.98]` for subtle feedback.
- **Disabled:** `opacity-60`, `cursor-not-allowed` on the element, `disabled:` variant on interactive children.

---

## 17. Writing / copy voice

Not every design system documents voice, but Bruhs is opinionated:

- Short. Complete sentences beat fragments when it matters; use fragments for UI labels.
- Lowercase button labels are allowed when the surrounding voice supports it. Don't mix cases inconsistently within one page.
- Numbers use `tabular-nums` and a thousands separator (`1,284` not `1284`).

---

## 18. When in doubt

- Prefer whitespace over borders, borders over wells, wells over cards. Escalate only when the content demands it.
- If a pattern isn't documented here, compose it from the primitives above rather than inventing new tokens.
- Bruhs is a vocabulary, not a component library. Reach for the *classes* (including the component classes in §10), not imported framework components.

---

_Bruhs is a personal design system by [bnle.me](https://bnle.me). This guide is the canonical adoption reference — if something here conflicts with older documentation, this wins._
