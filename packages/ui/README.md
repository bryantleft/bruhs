# @bruhs/theme

A framework-agnostic design system. OKLCH fruit-named colors, Monaspace all-mono typography, warm-dark neutrals, elevation by tone and ring (no drop shadows).

Works anywhere Tailwind CSS v4 runs (React, Vue, Svelte, Astro, Solid, Leptos, Go templates, Rails, raw HTML), and zero-build via a precompiled CSS bundle.

## Install

### Tailwind v4 project

```bash
pnpm add @bruhs/theme
```

```css
/* your-app.css */
@import "tailwindcss";
@import "@bruhs/theme/styles/index.css";
```

Copy `node_modules/@bruhs/theme/fonts/*` into your `public/fonts/` so the `@font-face` URLs resolve. The package ships a helper for this: run `bruhs-theme-fonts` (optionally with a target directory) before your dev server and build.

### Zero-build (any language, any framework)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@bruhs/theme/dist/bruhs.css">
```

Drop into any HTML document. All utilities are pre-compiled; fonts load from the same CDN path.

### What you get

- **Tokens:** fruit-named OKLCH colours, the fruit radius scale, motion durations and easings, stacking layers.
- **Type roles:** `text-h1`, `text-body`, `text-label` and the rest, each bound to one Monaspace variant.
- **Document defaults:** canvas and text colours, Monaspace as the default family, and the focus ring, set in the base layer.
- **Component classes:** `btn`, `input`, `surface-*`, `dialog`, `popover`, `menu-item`, `tooltip`, `segmented`, `kbd`, `code-block`, `spinner`, `empty-state`.

### Lint

`bruhs-theme-lint [paths]` fails on values outside the vocabulary: default Tailwind palettes, radii and type sizes, drop shadows, raw durations and z-indexes, and colour literals. Put it in your `check` script. `--skip <rule,…>` turns rules off; a `bruhs-theme-ignore` comment exempts one line.

### Mascot geometry

`@bruhs/theme/logo` exports `bruhGeometry`: the viewBox, base circle, eye and mouth sizes, and the face position for each variant (`left`, `original`, `right`). It's plain TypeScript data, so draw the mascot with whatever renders SVG.

```ts
import { bruhGeometry } from "@bruhs/theme/logo";
```

## Documentation

The full adoption guide lives in [`AGENTS.md`](./AGENTS.md) — vocabulary, every component pattern, accessibility checklist, and the hard bans. It's the canonical reference; agents should read it once and implement.

The live docs site is at [bruhs.dev](https://bruhs.dev). Raw markdown is served at [bruhs.dev/llms.txt](https://bruhs.dev/llms.txt).

## License

MIT © Bryant Le
