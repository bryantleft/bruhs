#!/usr/bin/env node
/**
 * Fails when a class the docs promise compiles to nothing. Tailwind drops unknown
 * utilities silently, which is how `duration-fast` shipped without any CSS behind it.
 * Run after `pnpm build`, against the precompiled bundle.
 */
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../dist/bruhs.css", import.meta.url), "utf8");

const expected = [
  ...["blink", "fast", "standard", "slow", "bloom"].map((d) => `duration-${d}`),
  ...["standard", "entrance", "exit", "bloom"].map((e) => `ease-${e}`),
  ...["raised", "sticky", "overlay", "modal", "popover", "toast", "tooltip"].map((z) => `z-${z}`),
  ...["seed", "grape", "lychee", "mango", "pomelo", "orb"].map((r) => `rounded-${r}`),
  ...["display-lg", "h1", "body", "body-sm", "label", "label-sm", "code", "button", "callout", "eyebrow"].map(
    (t) => `text-${t}`,
  ),
  "bg-persimmon-500",
  "inset-ring-persimmon-400",
  ...["btn", "btn-primary", "btn-soft", "btn-outline", "btn-ghost", "btn-danger", "btn-soft-danger", "btn-sm", "btn-icon"],
  ...["input", "surface-panel", "surface-card", "surface-floating", "surface-modal", "surface-well", "surface-interactive"],
  ...["dialog", "popover", "menu-item", "tooltip", "kbd", "code-block", "code-inline", "spinner"],
  ...["segmented", "segmented-item", "empty-state"],
  ...["dither-rule", "braille-meter"],
];

const missing = expected.filter((name) => !new RegExp(`\\.${name}(?![\\w-])`).test(css));
if (missing.length) {
  console.error(`dist/bruhs.css is missing ${missing.length} documented class(es): ${missing.join(", ")}`);
  console.error("Check the token namespace Tailwind reads for that utility, or the bundle.css safelist.");
  process.exit(1);
}
console.log(`verify-bundle: all ${expected.length} documented classes compile`);
