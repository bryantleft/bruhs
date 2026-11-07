#!/usr/bin/env node
/**
 * Fails when a colour token can't be shown faithfully or a semantic role stops being readable:
 * every token must fit Display P3, every role must name real tokens, and roles with a
 * `minContrast` must keep it on every background role (`canvas`, `surface`).
 */
import { readFileSync } from "node:fs";
import { contrast, inGamut, parseColorTokens } from "../src/lib/oklch.ts";
import { backgroundRoles, semanticColors } from "../src/lib/semantic.ts";

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
    if (!spec.minContrast || typeof ref !== "string") continue;
    for (const background of backgroundRoles) {
      const surface = semanticColors[background][appearance] ?? semanticColors[background][appearance.startsWith("dark") ? "dark" : "light"];
      const ratio = contrast(token, tokens.get(surface));
      if (ratio < spec.minContrast) problems.push(`semantic role "${role}" (${appearance}) is ${ratio.toFixed(2)}:1 on ${background} (--color-${surface}); it needs ${spec.minContrast}:1.`);
    }
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`verify-tokens: ${tokens.size} colours fit Display P3; ${Object.keys(semanticColors).length} semantic roles resolve and meet their contrast`);
