#!/usr/bin/env node
/**
 * Keeps Pith's SwiftUI content on the bruhs theme. System colours change meaning with the
 * user's settings and iOS-style big titles aren't how Mac windows label themselves, so both
 * fail here with the fix. UI text in the views and the bundled disk map also fails on bullets,
 * middle dots and dashes, which the theme's writing rules keep out of interfaces. Silence one
 * line with a `bruhs-native-ignore` comment saying why.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const views = fileURLToPath(new URL("../native/Sources/Pith", import.meta.url));
// PithCore builds text the views show, such as the menu bar's value, so its strings follow the separator rule too.
const core = fileURLToPath(new URL("../native/Sources/PithCore", import.meta.url));
// The disk map is the web page Pith bundles: its own entry and the shared components it renders.
const diskMap = ["../native-web", "../src/components"].map((dir) => fileURLToPath(new URL(dir, import.meta.url)));

const RULES = [
  { pattern: /\.accentColor\b|Color\.accentColor/, fix: "use BruhsColor.accent; the system accent changes with the user's setting" },
  { pattern: /\bColor\.(red|orange|yellow|green|mint|teal|cyan|blue|indigo|purple|pink|brown|gray|black|white)\b/, fix: "use a BruhsColor role, or a BruhsPalette token for data colours" },
  { pattern: /\.(foregroundStyle|foregroundColor|tint|fill|background)\(\.(red|orange|yellow|green|blue|purple|pink|gray)\)/, fix: "use a BruhsColor role, or a BruhsPalette token for data colours" },
  { pattern: /NSColor\.system(Red|Orange|Yellow|Green|Blue|Purple|Pink|Teal|Indigo|Brown|Gray|Mint|Cyan)\b/, fix: "use BruhsPalette or a BruhsColor role" },
  { pattern: /\.font\(\.largeTitle/, fix: "Mac windows show their title in the toolbar; drop the in-content large title" },
  { pattern: /\.font\(\.(system\(size|title|title2|title3|headline|subheadline|body|callout|footnote|caption|caption2)\b/, fix: "use a BruhsType style, adding one in Theme/Theme.swift if the scale lacks it", skip: "Theme.swift" },
];

/**
 * Checked on code lines only: comments may use dashes. Bullets, middle dots, the en, em, figure and horizontal-bar
 * dashes, hyphenation points and bullet operators, written as characters or as escapes.
 */
const SEPARATORS = {
  pattern: /[•·—–‒―‧∙]/,
  fix: 'show the parts as elements (LabeledFigure, BruhsBadge, separate views) or as a sentence; write ranges with "to" and leave a missing value empty',
  codeOnly: true,
  decodesEscapes: true,
};

const isComment = (line) => /^\s*(\/\/|\/\*|\*|\{\/\*)/.test(line);

/** Swift's `\u{2012}` and JavaScript's `\u2012` and `\u{2012}` escapes, as the characters they stand for. */
const decodeEscapes = (line) =>
  line
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)));

function* files(dir, extension) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full, extension);
    else if (entry.name.endsWith(extension) && entry.name !== "BruhsTokens.swift") yield full;
  }
}

const findings = [];
function lint(file, rules) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes("bruhs-native-ignore") || lines[i - 1]?.includes("bruhs-native-ignore")) return;
    for (const rule of rules) {
      if (rule.skip && file.endsWith(rule.skip)) continue;
      if (rule.codeOnly && isComment(line)) continue;
      const match = (rule.decodesEscapes ? decodeEscapes(line) : line).match(rule.pattern);
      if (match) findings.push(`${path.relative(process.cwd(), file)}:${i + 1}  "${match[0]}": ${rule.fix}`);
    }
  });
}

for (const file of files(views, ".swift")) lint(file, [...RULES, SEPARATORS]);
for (const file of files(core, ".swift")) lint(file, [SEPARATORS]);
for (const dir of diskMap) for (const file of files(dir, ".tsx")) lint(file, [SEPARATORS]);

if (findings.length) {
  console.error(`${findings.join("\n")}\n\nlint-native: ${findings.length} place(s) bypass the bruhs theme.`);
  process.exit(1);
}
console.log("lint-native: Pith's views and disk map use the bruhs theme");
