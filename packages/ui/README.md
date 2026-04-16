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

Copy `node_modules/@bruhs/theme/fonts/*` into your `public/fonts/` so the `@font-face` URLs resolve.

### Zero-build (any language, any framework)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@bruhs/theme/dist/bruhs.css">
```

Drop into any HTML document. All utilities are pre-compiled; fonts load from the same CDN path.

## Documentation

The full adoption guide lives in [`AGENTS.md`](./AGENTS.md) — vocabulary, every component pattern, accessibility checklist, and the hard bans. It's the canonical reference; agents should read it once and implement.

The live docs site is at [bruhs.dev](https://bruhs.dev). Raw markdown is served at [bruhs.dev/llms.txt](https://bruhs.dev/llms.txt).

## License

MIT © Bryant Le
