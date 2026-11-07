# Bruhs design system guide

Use Bruhs to build interfaces with warm dark surfaces and Monaspace type. Colors use OKLCH and names drawn from fruit. Background tones and inset rings show depth.

Bruhs works anywhere Tailwind CSS v4 runs. A compiled CSS bundle also works in plain HTML.

Use the tokens and classes in this guide. Keep custom values within the documented scales.

---

## 1. Adoption

### Option A: Tailwind v4 (preferred)

```css
/* your-app.css */
@import "tailwindcss";
@import "@bruhs/theme/styles/index.css";
```

Serve fonts at `/fonts/*`. Copy `@bruhs/theme/fonts/*` into `public/fonts/` at build time, or link them through your bundler. The CSS uses relative font paths.

The import sets the page colors and Monaspace Neon as the default font. It also sets the `font-mono` family and persimmon focus ring. See section 12 for document defaults.

### Keep it in the vocabulary

Add `bruhs-theme-lint` to your `check` script. It checks the rules in section 14 and rejects raw values that bypass the tokens.

```json
"check": "tsc && bruhs-theme-lint src"
```

Use `--skip type,weight` when a project deliberately uses different type rules. Mark a local exception with a `bruhs-theme-ignore` comment on that line or the line above. Explain why it is needed.

### Option B: Compiled CSS

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@bruhs/theme/dist/bruhs.css">
```

Add this stylesheet to any HTML document. The CDN serves the compiled utilities and fonts.

### Option C: Host the files

Download `dist/bruhs.css` and the `fonts/` directory from the package. Serve both from your own host.

---

## 2. Core philosophy

Set all text in Monaspace. Each text role uses a specific family.

Use `longan` for the warm dark canvas. Keep gray and pure black out of the neutral palette.

Show depth with background tones and `inset-ring`. Bruhs omits `shadow-xs` through `shadow-2xl`.

Reserve persimmon for primary actions and focus. Use it sparingly to draw attention.

---

## 3. Color vocabulary

The palette has seven accent scales and two neutral scales, plus mascot colors. Each scale has 11 OKLCH shades from `50` to `950`. Use token names for colors.

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
| `longan` | Background canvas, panels, cards | Warm dark brown |
| `bruh-{base,eye,mouth}` | Mascot branding only | Custom |

### Utilities

Use these names with any Tailwind color utility.

| Purpose | Examples |
|---------|----------|
| Background and text | `bg-persimmon-500`, `text-rambutan-100` |
| Borders and focus | `border-pandan-400`, `ring-persimmon-500`, `outline-persimmon-400` |
| Inset rings | `inset-ring-white/10` |
| Icons | `fill-lychee-400`, `stroke-durian-300` |
| Decoration and accents | `decoration-blueberry-500`, `divide-rambutan-100/10`, `accent-persimmon-500` |

Use opacity for softer tints, as in `bg-persimmon-500/15`. Keep the existing shades.

### Canvas / panel / card tones

| Surface | Class | Background | Ring |
|---------|-------|------------|------|
| Page canvas | Theme default on `<body>` | `bg-longan-950` | None |
| Panel / sidebar / nav | `surface-panel` | `bg-longan-900` | `inset-ring inset-ring-white/5` |
| Card | `surface-card` | `bg-longan-800` | `inset-ring inset-ring-white/10` |
| Floating (popover, menu) | `surface-floating` | `bg-longan-700` | `inset-ring inset-ring-white/15` |
| Modal | `surface-modal` | `bg-longan-800` on `bg-longan-950/70` scrim | `inset-ring inset-ring-white/20` |
| Well (recessed) | `surface-well` | `bg-longan-900/60` | `inset-ring inset-ring-white/5` |

---

## 4. Radius vocabulary

Use the fruit radius classes below. Tailwind's default radius classes, from `rounded-sm` through `rounded-full`, aren't part of Bruhs.

| Class | Value | Use for |
|-------|-------|---------|
| `rounded-seed` | 4px | Tags and compact controls |
| `rounded-grape` | 8px | Buttons, inputs, badges |
| `rounded-lychee` | 14px | Cards, panels, sidebar items |
| `rounded-mango` | 22px | Hero tiles, media containers |
| `rounded-pomelo` | 36px | Marketing blocks and pull quotes |
| `rounded-orb` | full | Avatars, pills, toggles, dots |

Use directional variants for individual corners or edges, such as `rounded-l-grape`.

### Concentric nesting

Subtract the padding from the outer radius to get the inner radius. Use CSS variables to keep nested curves parallel.

```html
<div class="rounded-mango p-4 [--radius:var(--radius-mango)] [--padding:--spacing(4)]">
  <div class="rounded-[calc(var(--radius)-var(--padding))] p-4">inner</div>
</div>
```

---

## 5. Typography

Each text role class sets its Monaspace family. Keep that family by omitting `font-*` overrides on `.text-*` roles.

| Class | Font | Size | Weight | Use for |
|-------|------|------|--------|---------|
| `text-display-lg` | Krypton | clamp(40…72px) | 300 | Hero headlines |
| `text-display-md` | Krypton | clamp(32…56px) | 400 | Section heroes |
| `text-display-sm` | Krypton | clamp(28…44px) | 400 | Page headers |
| `text-h1` | Xenon | clamp(24…32px) | 500 | Primary headings |
| `text-h2` | Xenon | 24px | 500 | Section headings |
| `text-h3` | Xenon | 20px | 500 | Subsections |
| `text-h4` | Xenon | 18px | 500 | Component headings |
| `text-body-lg` | Neon | 18px | 400 | Lead paragraphs |
| `text-body` | Neon | 16px | 400 | Default prose |
| `text-body-sm` | Neon | 14px | 400 | Dense / secondary prose |
| `text-label-lg` | Argon | 16px | 500 | Form labels |
| `text-label` | Argon | 14px | 500 | UI labels, metadata |
| `text-label-sm` | Argon | 12px | 500 | Captions, annotations |
| `text-eyebrow` | Argon | 11px, uppercase | 500 | Label above a heading or group |
| `text-code-lg` | Neon | 16px | 400 | Code blocks |
| `text-code` | Neon | 14px | 400 | Code snippets |
| `text-code-sm` | Neon | 12px | 400 | Small code annotations |
| `text-button-lg` | Argon | 16px | 500 | Primary action buttons |
| `text-button` | Argon | 14px | 500 | Standard buttons |
| `text-button-sm` | Argon | 12px | 500 | Compact buttons, chips |
| `text-callout` | Radon | 18px | 400 | Pull quotes, asides |

### Rules

Use `font-semibold` or `font-medium` for emphasis. Bruhs omits `font-bold`.

Keep the heading role's line height. Add `text-balance` to headings and `text-pretty` to body paragraphs.

Limit prose width with `max-w-[65ch]` or `max-w-[72ch]`. Use `tabular-nums` for changing numbers.

Let inline elements inherit their parent's text role. A color class such as `text-rambutan-200` is fine on inline code. Reserve `text-code-*` roles for block code.

---

## 6. Elevation

Use background tones and inset rings to show depth.

| Step | Class | Background | Ring |
|------|-------|------------|------|
| Canvas | Theme default | `bg-longan-950` | None |
| Panel | `surface-panel` | `bg-longan-900` | `inset-ring-white/5` |
| Card | `surface-card` | `bg-longan-800` | `inset-ring-white/10` |
| Floating | `surface-floating` | `bg-longan-700` | `inset-ring-white/15` |
| Modal | `surface-modal` | `bg-longan-800` | `inset-ring-white/20` |

Each `surface-*` class sets the tone and ring with `rounded-lychee` corners. Override the radius with a fruit radius class. Add `surface-interactive` to strengthen a clickable surface's ring on hover.

### Stacking layers

Prefer native `<dialog>` and `[popover]` elements. They use the browser's top layer. For other overlays, use a named stacking layer.

| Class | Value | Use for |
|-------|-------|---------|
| `z-raised` | 10 | Lifted above siblings |
| `z-sticky` | 20 | Sticky headers and toolbars |
| `z-overlay` | 40 | Backdrops behind overlays |
| `z-modal` | 50 | Custom drawers and modals |
| `z-popover` | 60 | Menus and command palettes (above a modal) |
| `z-toast` | 70 | Toasts |
| `z-tooltip` | 80 | Tooltips |

The values set the stacking order. Variables from `--z-raised` through `--z-tooltip` are available on `:root` for plain CSS.

### Bloom

Use `--shadow-bloom` for a persimmon glow on focus or active controls. Reserve it for deliberate attention.

```html
<button class="[box-shadow:var(--shadow-bloom)]">Focused</button>
```

Keep glows in persimmon.

---

## 7. Motion

Use the motion tokens to keep transitions consistent. Five durations and four easing curves are available as CSS variables and Tailwind utilities.

### Durations

| Token | Value | Use for |
|-------|-------|---------|
| `duration-blink` | 80ms | Brief selection feedback |
| `duration-fast` | 150ms | Hover, button press, small state changes (default) |
| `duration-standard` | 250ms | Expand, fade, slide |
| `duration-slow` | 400ms | Page transitions and large panels |
| `duration-bloom` | 600ms | Deliberate attention moments, bloom accents |

The default `transition` uses `duration-fast` at 150ms.

### Easings

| Token | Curve | Use for |
|-------|-------|---------|
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default for most UI transitions |
| `ease-entrance` | `cubic-bezier(0, 0, 0, 1)` | Content entering view |
| `ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Content leaving view |
| `ease-bloom` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful overshoot for brand accents |

### Rules

Use `transition` for the default duration. Name the changing property when possible, as in `transition-colors`.

Pair each duration with a suitable easing. Use `duration-standard ease-standard` for expanding content. Reserve `duration-bloom ease-bloom` for brand accents.

Respect `prefers-reduced-motion`. Wrap decorative motion in `motion-safe:` variants.

Keep routine transitions at 400ms or less. Durations over 1000ms are reserved for splash screens or onboarding.

---

## 8. Spacing

Use Tailwind's spacing scale, based on `--spacing: 0.25rem`. Choose the common values below for a consistent rhythm.

### Common patterns

| Context | Value | Why |
|---------|-------|-----|
| Icon to text | `gap-1.5` (6px) | Tight without touching |
| Form label to field | `gap-2` (8px) | Closely related content |
| Form field to field | `gap-6` (24px) | Clear separation |
| Card padding (compact) | `p-4` (16px) | Dense apps |
| Card padding (default) | `p-6` (24px) | Standard |
| Section to section | `gap-12 md:gap-16` (48/64px) | Room between sections |
| Page padding | `p-6 md:p-8` (24/32px) | More space on larger screens |

### Rules

Use `gap-*` on the parent to space flex or grid children. Keep margin utilities out of that spacing.

Use shorthand such as `p-4`. Split axes when a variant overrides one, as in `p-6 md:px-8`.

Use `--spacing(…)` for custom spacing values. It replaces raw pixels, `calc(var(--spacing)*…)` and `theme(spacing.…)`.

---

## 9. Responsive breakpoints

Start with the mobile layout. Use Tailwind's default breakpoints to adapt it for larger screens.

| Breakpoint | Minimum width |
|------------|---------------|
| `sm:` | 640px |
| `md:` | 768px |
| `lg:` | 1024px |
| `xl:` | 1280px |
| `2xl:` | 1536px |

### Layout shifts

| Shift | At breakpoint |
|-------|---------------|
| One to two columns | `md:` (768px) |
| Two to three columns | `lg:` (1024px) |
| Three to four columns | `xl:` (1280px) |
| Hidden navigation to visible sidebar | `lg:` (1024px) |
| Page padding from 24px to 32px | `md:` (768px) |
| Section gap from 48px to 64px | `md:` (768px) |

### Typography

Display roles and `text-h1` use `clamp()` to scale with the viewport. Other heading roles use fixed sizes. Keep the size set by each role instead of adding `md:text-*` overrides.

Body text uses a fixed size. If a dense layout uses `text-body-sm`, enlarge it on mobile with `max-sm:text-base/6`.

### Rules

Use `min-h-dvh` for full viewport height.

Keep touch targets at least 44px square at every breakpoint. Add an invisible target around small icon buttons.

Adjust dividers when the column count changes. See section 10.18.

Make choice controls larger on mobile with `size-5 sm:size-4` or `w-11 sm:w-9`.

---

## 10. Component patterns

Use the component classes in `@bruhs/theme`. They live in `src/styles/components.css` and share the design rules across apps.

Utilities on the same element override component defaults. Use `btn btn-primary w-full` for a full width button or `surface-card rounded-mango` for a different radius.

### 10.1 Buttons

Use `btn` with a tone class. Add `btn-sm` for a smaller button. Use `btn-icon` for a square button that shows only an icon.

```html
<button type="button" class="btn btn-primary">Save</button>
<button type="button" class="btn btn-soft">Cancel</button>
<button type="button" class="btn btn-outline">Details</button>
<button type="button" class="btn btn-ghost">Skip</button>
<button type="button" class="btn btn-soft-danger">Remove</button>
<button type="button" class="btn btn-danger">Delete account</button>
<button type="button" class="btn btn-soft btn-sm">Resend code</button>
```

Use one `btn-primary` per page or dialog. Match its ring to its fill.

Use `btn-soft-danger` for destructive actions. Choose `btn-danger` when deletion is the main action.

The default button is about 36px tall. `btn-sm` is about 28px. Use at most two sizes per surface.

Set `disabled` on a button to prevent activation and show disabled styles. With `aria-disabled="true"`, the styles apply but your code must prevent activation. This also applies to links with `class="btn"`.

Match the padding beside an icon to the vertical padding. Use `pl-2` for a leading icon or `pr-2` for a trailing icon.

Give icon buttons an `aria-label`. On touch screens, `btn-icon` adds an invisible 48px touch target.

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

Set `aria-invalid="true"` for the lychee error state. Point `aria-describedby` to the error message. The focus ring stays inside the field.

### 10.3 Surfaces

Choose a surface class from section 6 to set its background and ring.

```html
<div class="surface-card p-6">
  <h3 class="text-h3 text-rambutan-100 mb-2">Card title</h3>
  <p class="text-body text-rambutan-300">Card body.</p>
</div>
<a href="/settings" class="surface-panel surface-interactive block p-5">Settings</a>
```

### 10.4 Dialog

Add `dialog` to a native `<dialog>` and open it with `showModal()`. The class sets the modal surface and `rounded-mango` corners. It adds a longan backdrop and a 250ms entrance animation. Reduced motion skips the animation.

```html
<dialog id="trash" class="dialog" aria-labelledby="trash-title">
  <form method="dialog" class="flex flex-col gap-4">
    <h2 id="trash-title" class="text-h3">Move to Trash?</h2>
    <p class="text-body-sm text-rambutan-400">You can restore the file until you empty the Trash.</p>
    <div class="flex justify-end gap-3">
      <button type="submit" value="cancel" class="btn btn-ghost">Cancel</button>
      <button type="submit" value="confirm" class="btn btn-danger">Move to Trash</button>
    </div>
  </form>
</dialog>
```

If clicking the backdrop should close the dialog, put padding on an inner wrapper and use `dialog p-0`. A click on the dialog's own padding counts as an inside click.

### 10.5 Menu, listbox and command palette

Use `popover` for a floating menu surface and `menu-item` for each row. The surface works on a `[popover]` element or a positioned div. A positioned div uses `z-popover`.

Rows highlight on hover or when marked with an active state. The class reads `aria-selected`, `aria-pressed`, `aria-current` and `data-highlighted`.

```html
<div class="popover w-64" role="menu" aria-label="File">
  <button type="button" class="menu-item" role="menuitem">Rename</button>
  <button type="button" class="menu-item" role="menuitem" data-highlighted>Duplicate</button>
  <button type="button" class="menu-item" role="menuitem" aria-disabled="true">Share</button>
</div>
```

### 10.6 Tooltip

Use `tooltip` for the bubble. Show it on hover and keyboard focus. Give the trigger an `aria-label` or connect it to the tooltip with `aria-describedby`.

```html
<button type="button" class="group relative btn btn-ghost btn-icon" aria-describedby="tip">
  <svg viewBox="0 0 16 16" fill="currentColor" class="size-4" aria-hidden="true"><!-- icon --></svg>
  <span id="tip" role="tooltip" class="tooltip absolute bottom-full left-1/2 mb-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Copy link</span>
</button>
```

### 10.7 Segmented control

Use a segmented control to choose one of two to four views. Mark the active item with the ARIA state that matches its role. The class reads `aria-pressed`, `aria-selected` and `aria-checked`.

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

Use `code-block` for horizontal scrolling instead of wrapping. Remove the syntax highlighter's background so the block's background shows.

### 10.9 Spinner

```html
<span class="spinner size-4 text-rambutan-400" aria-hidden="true"></span>
```

Set the spinner's size with `size-*` or the font size. Set its color with a text color class. Use `--spinner-width` to change the default 2px stroke.

Pair it with visible text or label its button. The spinner slows down for reduced motion.

### 10.10 Empty, error and 404 states

```html
<main class="empty-state min-h-dvh">
  <p class="text-eyebrow text-rambutan-500">404</p>
  <h1 class="text-h1">This page doesn't exist</h1>
  <p class="text-body-sm">Go to the home page to find what you need.</p>
  <a href="/" class="btn btn-primary mt-4">Go home</a>
</main>
```

Give each empty state one action. Say what's missing and what to do next.

### 10.11 Soft badge

```html
<span class="inline-flex items-center rounded-grape bg-pandan-500/15 text-pandan-200 px-2 py-1 text-label-sm inset-ring inset-ring-pandan-400/20">
  Live
</span>
```

Use the chosen tone's `500` shade at 15% opacity for the background. Pair it with `200` text and a `400` ring at 20% opacity. This pattern works with any accent or rambutan.

### 10.12 Outline badge

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

For an error, use `bg-lychee-500/5 inset-ring-lychee-400/40 focus-within:outline-lychee-400` on the wrapper.

For a disabled control, add `disabled` to `<select>`. Use `opacity-60 bg-white/[0.02] inset-ring-white/5` on the wrapper.

For a leading icon, use `grid-cols-[--spacing(9)_1fr_--spacing(8)]`. Place the icon at `col-start-1 row-start-1`.

### 10.15 Checkbox

A checkbox supports checked, unchecked and partial selection states. Set `input.indeterminate = true` in JavaScript for a partial selection. This is a DOM property rather than an HTML attribute.

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

Use the checkbox structure with `type="radio"` and `rounded-orb` on the input. Replace the checkmark with this filled dot.

```html
<span class="pointer-events-none col-start-1 row-start-1 size-[round(down,40%,1px)] self-center justify-self-center rounded-orb bg-longan-950 group-not-has-checked:opacity-0"></span>
```

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

Adjust dividers when the column count changes at a breakpoint.

---

## 11. Icons

Use [Heroicons](https://heroicons.com) as the default set.

Match each icon's viewBox to its Tailwind size class. Keep the native dimensions.

| Set | viewBox | Class |
|-----|---------|-------|
| Heroicons Micro | `0 0 16 16` | `size-4` |
| Heroicons Mini | `0 0 20 20` | `size-5` |
| Heroicons Outline | `0 0 24 24` | `size-6` |

Use Micro for app interfaces. Choose Mini for navigation and marketing pages. Reserve Outline for hero illustrations.

### Rules

Add `shrink-0` to icons inside flex or grid containers. Use `h-lh` to align with adjacent text.

Use `fill-*` for filled icons and `stroke-*` for outlines. Avoid text color utilities with `currentColor`.

Place icons directly in the layout. Skip decorative boxes and circles behind them.

### Buttons with only an icon

Use `btn btn-icon` with an `aria-label`. On touch screens, it adds an invisible 48px square touch target around the button.

```html
<button type="button" class="btn btn-ghost btn-icon" aria-label="Settings">
  <svg viewBox="0 0 16 16" fill="currentColor" class="size-4"><!-- icon --></svg>
</button>
```

---

## 12. Global document setup

The theme sets dark mode and font smoothing on `<html>`. It sets `bg-longan-950` and `text-rambutan-100` on `<body>`.

Monaspace Neon is the default `font-sans` and `font-mono` family. Every `:focus-visible` element gets a 2px persimmon outline at a 2px offset.

Start with this document structure.

```html
<html lang="en">
  <body>
    <main class="isolate min-h-dvh">
      <!-- app -->
    </main>
  </body>
</html>
```

Use `isolate` on the main container to keep its stacking context separate from portalled elements. Use `min-h-dvh` for full viewport height.

Keep the default body colors and focus ring. Override the focus color when it carries meaning, as `btn-danger` does with `lychee-400`.

---

## 13. Accessibility

Give every form control a `name` and an accessible label. Connect a `<label>` through `for` and `id`, or use `aria-label`.

Set an explicit `type` on every button. Use `submit` to submit a form and `button` for other actions.

Add `role="list"` to `<ul>` and `<ol>` elements styled as flex or grid layouts. Safari can remove their list role when markers are hidden.

Keep touch targets at least 44px square. Use the invisible target pattern for small icon buttons.

Keep a visible focus ring. Replace it before removing the default outline. Use `-outline-offset-1` on text fields to keep the ring inside.

Leave a gap between a field and its button, or place the button inside the field.

---

## 14. Required design rules

Use tone and `inset-ring` for depth. Bruhs omits Tailwind's drop shadows from `shadow-xs` through `shadow-2xl`.

Use fruit radius names. Default classes such as `rounded-sm` and `rounded-full` aren't part of Bruhs.

Use `longan-950` for the canvas and rambutan for foreground details. Keep pure black and the gray, slate, zinc and neutral scales out of the palette.

Let `.text-*` roles set their fonts. Use `font-semibold` or `font-medium` for emphasis instead of `font-bold`.

Keep icons at their native sizes and place them directly in the layout.

Keep body text at least `text-sm` on screens wider than `sm:`. Use `text-base` on mobile. Reserve `text-xs` for labels and annotations.

Match a solid primary button's ring to its fill. Use one filled primary button per page or dialog.

---

## 15. Opacity conventions

When you need a softer tint of a color, use opacity modifiers on the scale:

| Pattern | Use for |
|---------|---------|
| `-500/15` | Soft backgrounds (badges, tinted panels) |
| `-400/20` | Soft ring pairing for `-500/15` backgrounds |
| `-400/30` | Outline ring on a transparent background |
| `white/5`, `white/10`, `white/15`, `white/20` | Elevation rings on dark surfaces |
| `longan-950/70` | Modal / drawer scrim |

---

## 16. Focus and states

Keep the theme's keyboard focus ring. Change its color or offset when needed, as in `focus-visible:outline-lychee-400`.

The `input` class keeps focus inside the field. For a custom field, add `focus-visible:-outline-offset-1`.

On hover, increase an elevated surface's ring opacity by five percentage points. For example, change `white/5` to `white/10`. Lighten the background if needed.

For a pressed state, use a darker fill such as `bg-persimmon-600`. Use `active:scale-[0.98]` for subtle size feedback.

Use `opacity-60` and `cursor-not-allowed` for disabled styles. Apply the `disabled:` variant to interactive children.

---

## 17. Writing

Lead with the point. Use the fewest words that keep the meaning.

Write short, complete sentences. Keep one idea per paragraph. Use fragments for labels when the action or meaning is clear.

Use sentence case in the interface, including chat messages and placeholders. Use lowercase for conversational replies outside the product. Preserve the case of product names and code identifiers.

Write instructions as short paragraphs. Use a table when readers need to compare values. Keep bullet points and dash punctuation out of UI copy. Preserve dashes required by code or URLs.

Name the action on each button. Say what failed and what to do next in errors.

Cut filler and repeated claims. Split packed sentences instead of joining more clauses.

Use `tabular-nums` for numbers that change. Add thousands separators, as in `1,284`.

---

## 18. Native Mac apps

Native apps keep the system's controls and use Bruhs for their surfaces and content. Window buttons, toolbar items, search fields, menus, alerts and form controls stay standard AppKit and SwiftUI, in the system font. Bruhs sets what they sit on and what they show: the canvas and panel tones, colours, data type, radii and motion. Pith, in `apps/storage/native`, is the reference app.

### Tokens

Generate Swift tokens from the theme instead of copying values. Run the same command with `--check` in CI; it fails when the file has drifted from the CSS.

```sh
bruhs-theme-swift Sources/App/Theme/BruhsTokens.swift
bruhs-theme-swift Sources/App/Theme/BruhsTokens.swift --check
```

| Type | Holds |
|---|---|
| `BruhsColor` | The semantic roles in `src/lib/semantic.ts`, resolved for dark, light and Increase Contrast |
| `BruhsNSColor` | The same roles as `NSColor`, for window backgrounds and AppKit drawing |
| `BruhsPalette` | Every colour token as a Display P3 `NSColor` |
| `BruhsRadius` | The fruit radius scale in points |
| `BruhsMotion` | The duration scale, with standard, entrance and exit animations |

Use `BruhsColor` roles for surfaces, text, hairlines, wells, accents, selection and status. Use `BruhsPalette` only for data, such as chart series or file kinds.

Change a role in `semantic.ts`, not in Swift. `scripts/verify-tokens.mjs` checks that every token fits Display P3 and that each readable role keeps its contrast on both background roles, `canvas` and `surface`, in all four appearances.

### Rules

Follow the system appearance. The roles already resolve for light, dark and Increase Contrast, so don't force dark mode.

Paint windows and panels with `canvas`, under the toolbar too: set the window's `backgroundColor` to `BruhsNSColor.canvas`, set `titlebarAppearsTransparent` so macOS doesn't paint its grey band behind the toolbar, and keep content views transparent. Put side panels on `surface`, flush with the window's edge and divided from the content by a hairline. Avoid SwiftUI's `.inspector` for them: macOS 26 draws it as an inset glass panel whose rounded corner shows as a notch against the canvas. Pith's `BruhsSidePanel` is a resizable replacement. A menu bar popover takes the canvas edge to edge: turn on `hasFullSizeContent` so its arrow is part of the content, and size the popover to the panel plus the safe-area insets it reports.

Tint SwiftUI controls with `.tint(BruhsColor.accent)` at each window's root. The user's accent colour still marks focus and menus.

Set data in Monaspace: readouts, figures, sizes, paths and times. Keep labels, buttons and sentences in the system font. Register the bundled fonts at launch and check them in a smoke test.

Use the Bruhs accent for selection, the primary action and highlights in content, not the system accent colour. Show status with `statusNormal`, `statusWarning` and `statusCritical`, always alongside a symbol or words.

Keep shadows out of content. The system draws window and popover shadows; content uses tone and hairlines, as on the web.

Don't animate live data. Values and charts update in place. Use `BruhsMotion` for changes of state, such as entering or leaving a selected range.

Put a window's title and subtitle in its title bar or toolbar. Mac windows don't use large titles inside their content.

Set text in `BruhsType` styles rather than system text styles or fixed sizes. Add a style to the scale when a view needs one.

Keep bullets, middle dots and dashes out of UI text, both between figures and in place of a missing value. Lay the parts out as elements instead. Pith's `LabeledFigure` names a figure, as in "Peak 40%", and its `BruhsBadge` holds a process kind, version or count. Write ranges with "to". Leave a figure the app can't read empty and say why once per row; Pith puts a lock after the name of a process macOS protects.

Pith's `scripts/lint-native.mjs` fails on the system accent, system colours, large titles and text outside `BruhsType` in its views, and on bullets, middle dots and dashes in UI text there and in its disk map. Copy it into a new app with its paths changed.

---

## 19. When in doubt

Start with whitespace. Add a divider or surface only when the content needs more separation.

Build new patterns from the existing tokens. Use the classes in section 10 across frameworks.

---

Bruhs is a personal design system by [bnle.me](https://bnle.me). This guide takes precedence over older documentation.
