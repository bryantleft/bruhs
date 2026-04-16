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

| Surface | Background | Ring |
|---------|------------|------|
| Page canvas | `bg-longan-950` | — |
| Panel / sidebar / nav | `bg-longan-900` | `inset-ring inset-ring-white/5` |
| Card | `bg-longan-800` | `inset-ring inset-ring-white/10` |
| Floating (popover, menu) | `bg-longan-700` | `inset-ring inset-ring-white/15` |
| Modal | `bg-longan-800` on `bg-longan-950/70` scrim | `inset-ring inset-ring-white/20` |

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
| `text-label-sm` | Argon | 12px | 500 | Captions, eyebrows |
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

---

## 6. Elevation

No `shadow-*` utilities. Elevation is a two-lever system:

| Step | Background | Ring |
|------|------------|------|
| Canvas | `bg-longan-950` | — |
| Panel | `bg-longan-900` | `inset-ring-white/5` |
| Card | `bg-longan-800` | `inset-ring-white/10` |
| Floating | `bg-longan-700` | `inset-ring-white/15` |
| Modal | `bg-longan-800` | `inset-ring-white/20` |

### Bloom

One exception: `--shadow-bloom` is a persimmon glow reserved for focus states, active triggers, and deliberate attention accents.

```html
<button class="[box-shadow:var(--shadow-bloom)]">Focused</button>
```

Do not introduce your own glows in other colors.

---

## 7. Component patterns

All patterns below are copy-paste ready. Adapt to your framework's template syntax — the classes do not change.

### 7.1 Button — primary

```html
<button type="button" class="inline-flex items-center gap-1.5 rounded-grape bg-persimmon-500 px-3 py-2 text-button text-longan-950 ring-1 ring-persimmon-500 hover:bg-persimmon-400 hover:ring-persimmon-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-persimmon-400 active:bg-persimmon-600 transition">
  Save
</button>
```

**Rules:** only one primary per page/dialog. Ring matches fill color exactly — never use reduced-opacity rings on a solid button.

### 7.2 Button — soft (secondary default)

```html
<button type="button" class="inline-flex items-center gap-1.5 rounded-grape bg-persimmon-500/15 px-3 py-2 text-button text-persimmon-200 inset-ring inset-ring-persimmon-400/20 hover:bg-persimmon-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-persimmon-400 transition">
  Cancel
</button>
```

### 7.3 Button — outline

```html
<button type="button" class="inline-flex items-center gap-1.5 rounded-grape bg-transparent px-3 py-2 text-button text-rambutan-100 inset-ring inset-ring-rambutan-100/15 hover:bg-longan-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-persimmon-400 transition">
  Details
</button>
```

### 7.4 Button — ghost

```html
<button type="button" class="inline-flex items-center gap-1.5 rounded-grape px-3 py-2 text-button text-rambutan-200 hover:bg-longan-800 hover:text-rambutan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-persimmon-400 transition">
  Skip
</button>
```

### 7.5 Button — destructive

```html
<button type="button" class="inline-flex items-center gap-1.5 rounded-grape bg-lychee-600 px-3 py-2 text-button text-lychee-50 ring-1 ring-lychee-600 hover:bg-lychee-500 hover:ring-lychee-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lychee-400 transition">
  Delete
</button>
```

Use the soft style for destructive actions unless the action is the primary purpose of the page/dialog.

### 7.6 Button sizes

Default (~36px): `px-3 py-2 text-button`.
Small (~28px): `px-2.5 py-1.5 text-button-sm`.

Use at most two sizes per surface.

### 7.7 Button with icon

Asymmetric padding — icon side padding equals vertical padding.

```html
<!-- leading icon -->
<button type="button" class="inline-flex items-center gap-1.5 rounded-grape bg-persimmon-500 py-2 pr-3 pl-2 text-button text-longan-950 ring-1 ring-persimmon-500 hover:bg-persimmon-400 transition">
  <svg viewBox="0 0 16 16" fill="currentColor" class="size-4 shrink-0"><!-- icon --></svg>
  New item
</button>

<!-- trailing icon -->
<button type="button" class="inline-flex items-center gap-1.5 rounded-grape py-2 pr-2 pl-3 text-button text-rambutan-100 inset-ring inset-ring-rambutan-100/15 hover:bg-longan-800 transition">
  Continue
  <svg viewBox="0 0 16 16" fill="currentColor" class="size-4 shrink-0"><!-- icon --></svg>
</button>
```

### 7.8 Badge — soft

```html
<span class="inline-flex items-center rounded-grape bg-pandan-500/15 text-pandan-200 px-2 py-1 text-label-sm inset-ring inset-ring-pandan-400/20">
  Live
</span>
```

Pattern: any accent tone with `-500/15` bg, `-200` text, `-400/20` ring. Works for `lychee`, `persimmon`, `durian`, `pandan`, `blueberry`, `mangosteen`, `dragonfruit`, `rambutan`.

### 7.9 Badge — outline

```html
<span class="inline-flex items-center rounded-grape px-2 py-1 text-label-sm text-persimmon-300 inset-ring inset-ring-persimmon-400/30">
  Draft
</span>
```

### 7.10 Badge with icon

```html
<span class="inline-flex items-center gap-1 rounded-grape bg-pandan-500/15 text-pandan-200 inset-ring inset-ring-pandan-400/20 py-1 pr-2 pl-1 text-label-sm">
  <svg viewBox="0 0 16 16" fill="currentColor" class="size-3.5 shrink-0"><!-- icon --></svg>
  Live
</span>
```

### 7.11 Text input

```html
<div class="flex flex-col gap-2">
  <label for="email" class="text-label text-rambutan-200">Email</label>
  <input
    id="email"
    name="email"
    type="email"
    placeholder="you@bruhs.dev"
    class="block w-full rounded-grape bg-white/5 px-3 py-2 text-body text-rambutan-100 placeholder:text-rambutan-500 inset-ring inset-ring-white/10 focus-visible:outline-2 -outline-offset-1 focus-visible:outline-persimmon-400 max-sm:text-base/6"
  />
</div>
```

### 7.12 Textarea

Same classes as text input, on `<textarea rows="3">`.

### 7.13 Select

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

### 7.14 Checkbox

```html
<div class="flex items-center gap-2 text-body text-rambutan-200">
  <span class="h-lh items-center inline-flex">
    <span class="group inline-grid size-5 sm:size-4 grid-cols-1">
      <input
        id="agree"
        name="agree"
        type="checkbox"
        class="col-start-1 row-start-1 appearance-none rounded-seed border border-white/10 bg-white/5 checked:border-persimmon-500 checked:bg-persimmon-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-persimmon-400 disabled:border-white/5 disabled:bg-white/10 disabled:checked:bg-white/10 forced-colors:appearance-auto"
      />
      <svg viewBox="0 0 14 14" fill="none" class="pointer-events-none col-start-1 row-start-1 size-7/8 self-center justify-self-center stroke-longan-950 group-has-disabled:stroke-white/25">
        <path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-not-has-checked:opacity-0" />
      </svg>
    </span>
  </span>
  <label for="agree">I agree</label>
</div>
```

### 7.15 Radio

Identical structure to checkbox but with:
- `type="radio"` on the input
- `rounded-orb` (not `rounded-seed`)
- A filled dot indicator: `<span class="pointer-events-none col-start-1 row-start-1 size-[round(down,40%,1px)] self-center justify-self-center rounded-orb bg-longan-950 group-not-has-checked:opacity-0"></span>`

### 7.16 Toggle

```html
<div class="group relative inline-flex w-11 sm:w-9 shrink-0 rounded-orb bg-white/5 p-0.5 inset-ring inset-ring-white/10 outline-persimmon-500 outline-offset-2 has-checked:bg-persimmon-500 has-focus-visible:outline-2 transition-colors duration-200 ease-in-out">
  <span class="aspect-square w-1/2 rounded-orb bg-white ring-1 ring-white/10 transition-transform duration-200 ease-in-out group-has-checked:translate-x-full"></span>
  <input id="enabled" name="enabled" type="checkbox" aria-label="Enable" class="absolute inset-0 size-full appearance-none focus:outline-hidden" />
</div>
```

### 7.17 Card

```html
<div class="rounded-lychee bg-longan-800 p-6 inset-ring inset-ring-white/10">
  <h3 class="text-h3 text-rambutan-100 mb-2">Card title</h3>
  <p class="text-body text-rambutan-300">Card body.</p>
</div>
```

### 7.18 Well (recessed panel)

```html
<div class="rounded-lychee bg-longan-900/60 p-6 inset-ring inset-ring-white/5">
  <p class="text-body text-rambutan-200">Nested or secondary content.</p>
</div>
```

### 7.19 Divided grid

```html
<ul role="list" class="grid grid-cols-3">
  <li class="p-6"><!-- first item: no left border --></li>
  <li class="p-6 [&:not(:nth-child(3n+1))]:border-l [&:not(:nth-child(3n+1))]:border-rambutan-100/10"></li>
  <li class="p-6 [&:not(:nth-child(3n+1))]:border-l [&:not(:nth-child(3n+1))]:border-rambutan-100/10"></li>
</ul>
```

Reconfigure divider patterns when column count changes at a breakpoint.

---

## 8. Icons

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

Add a hidden 48×48 touch target to meet mobile tap requirements:

```html
<button type="button" class="relative rounded-grape p-2 text-rambutan-300 hover:text-rambutan-100 hover:bg-longan-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-persimmon-400 transition">
  <svg viewBox="0 0 16 16" fill="currentColor" class="size-4"><!-- icon --></svg>
  <span class="absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden" aria-hidden="true"></span>
</button>
```

---

## 9. Global document setup

Put these on the root elements of every Bruhs-powered document:

```html
<html lang="en" class="scheme-only-dark antialiased">
  <body class="bg-longan-950 text-rambutan-100 font-neon">
    <main class="isolate min-h-dvh">
      <!-- app -->
    </main>
  </body>
</html>
```

- `scheme-only-dark` — makes native UI (scrollbars, form controls) render dark.
- `antialiased` — required for Monaspace to render correctly.
- `isolate` on the main container — prevents z-index conflicts with portalled elements.
- `min-h-dvh` — modern viewport unit, avoids `min-h-screen` (deprecated).

---

## 10. Accessibility checklist

- Every form control has a `name` attribute and either a `<label>` (associated via `for`/`id`) or an `aria-label`.
- Every `<button>` has an explicit `type` attribute (`"submit"` inside forms, `"button"` otherwise).
- All `<ul>` and `<ol>` in flex/grid layouts get `role="list"` (Safari strips the implicit role when `list-style: none` is applied).
- Touch targets are at least 44×44px. Small icon buttons use the absolute overlay pattern above.
- Focus rings are always visible on interactive elements: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-persimmon-400`.
- On `<input>` and `<textarea>`, use `-outline-offset-1` so the focus ring insets rather than spilling outside.
- Form controls must never conjoin an input with a button into a shared border — leave a gap or nest the button visually.

---

## 11. Hard bans (never do these)

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

## 12. Opacity conventions

When you need a softer tint of a color, use opacity modifiers on the scale:

| Pattern | Use for |
|---------|---------|
| `-500/15` | Soft backgrounds (badges, tinted panels) |
| `-400/20` | Soft ring pairing for `-500/15` backgrounds |
| `-400/30` | Outline-style ring on transparent background |
| `white/5`, `white/10`, `white/15`, `white/20` | Elevation rings on dark surfaces |
| `longan-950/70` | Modal / drawer scrim |

---

## 13. Focus & state pattern reference

- **Focus (keyboard):** `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-persimmon-400`
- **Focus inside input:** `focus-visible:outline-2 -outline-offset-1 focus-visible:outline-persimmon-400`
- **Hover (elevated surfaces):** bump the `inset-ring` opacity by 5 (`white/5` → `white/10`) and optionally tone-step the background.
- **Active / pressed:** darker fill (`bg-persimmon-600` for primary) or `active:scale-[0.98]` for subtle feedback.
- **Disabled:** `opacity-60`, `cursor-not-allowed` on the element, `disabled:` variant on interactive children.

---

## 14. Writing / copy voice

Not every design system documents voice, but Bruhs is opinionated:

- Short. Complete sentences beat fragments when it matters; use fragments for UI labels.
- Lowercase button labels are allowed when the surrounding voice supports it. Don't mix cases inconsistently within one page.
- Numbers use `tabular-nums` and a thousands separator (`1,284` not `1284`).

---

## 15. When in doubt

- Prefer whitespace over borders, borders over wells, wells over cards. Escalate only when the content demands it.
- If a pattern isn't documented here, compose it from the primitives above rather than inventing new tokens.
- Bruhs is a vocabulary, not a component library. Reach for the *classes*, not imported components.

---

_Bruhs is a personal design system by [bnle.me](https://bnle.me). This guide is the canonical adoption reference — if something here conflicts with older documentation, this wins._
