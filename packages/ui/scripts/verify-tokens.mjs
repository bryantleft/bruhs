#!/usr/bin/env node
/**
 * Fails when a colour token can't be shown faithfully or a semantic role stops being readable:
 * every token must fit Display P3, every role must name real tokens, and roles with a
 * `minContrast` must keep it against the surface they're designed for.
 */
import { readFileSync } from "node:fs";
import { contrast, inGamut, parseColorTokens } from "../src/lib/oklch.ts";
import { contrastBackground, semanticColors } from "../src/lib/semantic.ts";

const tokens = parseColorTokens(readFileSync(new URL("../src/styles/index.css", import.meta.url), "utf8"));
const problems = [];

for (const [name, color] of tokens) {
  if (!inGamut(color, "p3")) problems.push(`--color-${name} is outside Display P3; lower its chroma (packages/ui/src/lib/oklch.ts fitChroma finds the limit).`);
}

const tokenName = (ref) => (typeof ref === "string" ? ref : ref.token);
for (const [role, spec] of Object.entries(semanticColors)) {
  for (const appearance of ["dark", "light", "darkHighContrast", "lightHighContrast"]) {
    const ref = spec[appearance];
    if (ref === undefined) continue;
    const token = tokens.get(tokenName(ref));
    if (!token) { problems.push(`semantic role "${role}" (${appearance}) names --color-${tokenName(ref)}, which doesn't exist.`); continue; }
    const base = appearance.startsWith("dark") ? "dark" : "light";
    if (spec.minContrast && typeof ref === "string") {
      const ratio = contrast(token, tokens.get(contrastBackground[base]));
      if (ratio < spec.minContrast) problems.push(`semantic role "${role}" (${appearance}) is ${ratio.toFixed(2)}:1 on --color-${contrastBackground[base]}; it needs ${spec.minContrast}:1.`);
    }
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`verify-tokens: ${tokens.size} colours fit Display P3; ${Object.keys(semanticColors).length} semantic roles resolve and meet their contrast`);
