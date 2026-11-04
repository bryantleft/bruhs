#!/usr/bin/env node
/**
 * bruhs-theme-lint — fails when app code steps outside the Bruhs vocabulary.
 *
 *   bruhs-theme-lint [paths…] [--skip rule,rule] [--ignore path-substring]…
 *
 * Paths default to `src`. Silence one line with a `bruhs-theme-ignore` comment on it or
 * on the line above, and say why next to it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const RULES = [
  {
    id: "shadow",
    pattern: /\bshadow-(?:2xs|xs|sm|md|lg|xl|2xl)\b/g,
    fix: "Bruhs has no drop shadows; use a surface-* class or a tone step plus inset-ring",
  },
  {
    id: "radius",
    pattern: /\brounded(?:-(?:t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee))?(?:-(?:xs|sm|md|lg|xl|2xl|3xl|4xl|full)\b|(?![\w-]))/g,
    fix: "use a fruit radius: rounded-seed, grape, lychee, mango, pomelo or orb",
  },
  {
    id: "palette",
    pattern:
      /\b(?:bg|text|border|ring|inset-ring|outline|fill|stroke|divide|from|via|to|placeholder|decoration|accent|caret)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|black)\b/g,
    fix: "Tailwind's default palette isn't in Bruhs; use a fruit colour (rambutan and longan for neutrals)",
  },
  {
    id: "type",
    pattern: /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b|\btext-\[\d[\d.]*(?:px|rem|em)\]/g,
    fix: "use a role utility such as text-body-sm, text-label or text-h3 instead of a raw size",
  },
  {
    id: "weight",
    pattern: /\bfont-(?:bold|extrabold|black)\b/g,
    fix: "use font-semibold or font-medium",
  },
  {
    id: "motion",
    pattern: /\bduration-\d+\b|\bease-(?:in-out|linear|in|out)(?![\w-])|\btransition-all\b/g,
    fix: "use duration-blink/fast/standard/slow/bloom, ease-standard/entrance/exit, and name the transitioned properties",
  },
  {
    id: "z-index",
    pattern: /(?<![\w-])-?z-(?:[1-9]\d*)\b/g,
    fix: "use z-raised, z-sticky, z-overlay, z-modal, z-popover, z-toast or z-tooltip",
  },
  {
    id: "color",
    // Hex only where a colour value can start, so `href="#delete"` anchors stay quiet.
    pattern: /(?:(?<=[[(,:]\s*)|(?<=["'`]))#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab)\(/g,
    // In CSS any value position counts, e.g. `border: 1px solid #0a0a0a`.
    cssPattern: /(?<=[\s[(,:])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab)\(/g,
    fix: "use a colour token: a fruit utility or var(--color-…)",
    skipLine: /\b(?:href|to|id)=["'{]/,
  },
];

const EXTENSIONS = new Set([".astro", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".css", ".html", ".svelte", ".vue", ".mdx"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".astro", ".output", ".vercel", ".turbo", ".react-router"]);
const IGNORE_MARK = "bruhs-theme-ignore";

function parseArgs(argv) {
  const paths = [];
  const skip = new Set();
  const ignore = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--skip") for (const id of (argv[++i] ?? "").split(",")) skip.add(id.trim());
    else if (arg === "--ignore") ignore.push(argv[++i] ?? "");
    else paths.push(arg);
  }
  const known = new Set(RULES.map((r) => r.id));
  for (const id of skip) {
    if (!known.has(id)) {
      console.error(`bruhs-theme-lint: unknown rule "${id}" in --skip (rules: ${[...known].join(", ")})`);
      process.exit(2);
    }
  }
  return { paths: paths.length ? paths : ["src"], skip, ignore };
}

function* walk(path) {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) {
    console.error(`bruhs-theme-lint: "${path}" does not exist`);
    process.exit(2);
  }
  if (stat.isFile()) {
    if (EXTENSIONS.has(extname(path))) yield path;
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.endsWith(".gen.ts")) continue;
    yield* walk(join(path, entry.name));
  }
}

const { paths, skip, ignore } = parseArgs(process.argv.slice(2));
const rules = RULES.filter((r) => !skip.has(r.id));
const findings = [];

for (const root of paths) {
  for (const file of walk(root)) {
    const shown = relative(process.cwd(), file);
    if (ignore.some((part) => part && shown.includes(part))) continue;
    const isCss = extname(file) === ".css";
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (line.includes(IGNORE_MARK) || lines[index - 1]?.includes(IGNORE_MARK)) return;
      for (const rule of rules) {
        if (rule.skipLine?.test(line)) continue;
        const pattern = (isCss && rule.cssPattern) || rule.pattern;
        for (const match of line.matchAll(pattern)) {
          findings.push(`${shown}:${index + 1}:${match.index + 1}  ${rule.id}  "${match[0]}": ${rule.fix}`);
        }
      }
    });
  }
}

if (findings.length) {
  console.error(findings.join("\n"));
  console.error(
    `\nbruhs-theme-lint: ${findings.length} value(s) outside the Bruhs vocabulary. ` +
      `Fix them, or mark a deliberate exception with a "${IGNORE_MARK}" comment saying why.`,
  );
  process.exit(1);
}
console.log(`bruhs-theme-lint: clean (${rules.map((r) => r.id).join(", ")})`);
