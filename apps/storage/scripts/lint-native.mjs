#!/usr/bin/env node
/**
 * Keeps Pith's SwiftUI content on the bruhs theme. System colours change meaning with the
 * user's settings and iOS-style big titles aren't how Mac windows label themselves, so both
 * fail here with the fix. Silence one line with a `bruhs-native-ignore` comment saying why.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../native/Sources/Pith", import.meta.url));
const RULES = [
  { pattern: /\.accentColor\b|Color\.accentColor/, fix: "use BruhsColor.accent; the system accent changes with the user's setting" },
  { pattern: /\bColor\.(red|orange|yellow|green|mint|teal|cyan|blue|indigo|purple|pink|brown|gray|black|white)\b/, fix: "use a BruhsColor role, or a BruhsPalette token for data colours" },
  { pattern: /\.(foregroundStyle|foregroundColor|tint|fill|background)\(\.(red|orange|yellow|green|blue|purple|pink|gray)\)/, fix: "use a BruhsColor role, or a BruhsPalette token for data colours" },
  { pattern: /NSColor\.system(Red|Orange|Yellow|Green|Blue|Purple|Pink|Teal|Indigo|Brown|Gray|Mint|Cyan)\b/, fix: "use BruhsPalette or a BruhsColor role" },
  { pattern: /\.font\(\.largeTitle/, fix: "Mac windows show their title in the toolbar; drop the in-content large title" },
  { pattern: /\.font\(\.(system\(size|title|title2|title3|headline|subheadline|body|callout|footnote|caption|caption2)\b/, fix: "use a BruhsType style, adding one in Theme/Theme.swift if the scale lacks it", skip: "Theme.swift" },
];

function* swiftFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* swiftFiles(full);
    else if (entry.name.endsWith(".swift") && entry.name !== "BruhsTokens.swift") yield full;
  }
}

const findings = [];
for (const file of swiftFiles(root)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes("bruhs-native-ignore") || lines[i - 1]?.includes("bruhs-native-ignore")) return;
    for (const rule of RULES) {
      if (rule.skip && file.endsWith(rule.skip)) continue;
      const match = line.match(rule.pattern);
      if (match) findings.push(`${path.relative(process.cwd(), file)}:${i + 1}  "${match[0]}": ${rule.fix}`);
    }
  });
}
if (findings.length) {
  console.error(`${findings.join("\n")}\n\nlint-native: ${findings.length} place(s) bypass the bruhs theme.`);
  process.exit(1);
}
console.log("lint-native: Pith's views use the bruhs theme");
