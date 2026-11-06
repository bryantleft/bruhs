import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { contrast, parseColorTokens } from "@bruhs/theme/oklch";
import { semanticColors, type TokenRef } from "@bruhs/theme/semantic";
import { CATEGORY_VAR } from "../src/lib/format.ts";
import {
  inkFor,
  LABEL_INKS,
  MAP_ROLES,
  parseOklch,
  roleTokens,
} from "../src/lib/map-colors.ts";

const tokens = parseColorTokens(
  readFileSync(
    new URL(import.meta.resolve("@bruhs/theme/styles/index.css")),
    "utf8",
  ),
);

function token(name: string) {
  const color = tokens.get(name);
  assert.ok(color, `--color-${name} exists`);
  return color;
}

describe("roleTokens", () => {
  test("follows the semantic roles for each appearance", () => {
    assert.deepEqual(roleTokens("dark", false).text, "rambutan-100");
    assert.deepEqual(roleTokens("light", false).text, "longan-950");
    assert.deepEqual(roleTokens("light", false).hairline, {
      token: "longan-950",
      alpha: 0.1,
    });
  });

  test("uses the increased-contrast variant where a role has one", () => {
    assert.equal(roleTokens("dark", true).textSecondary, "rambutan-300");
    assert.equal(roleTokens("light", true).textTertiary, "longan-700");
    // Roles without one keep their usual token.
    assert.equal(roleTokens("light", true).accent, "persimmon-700");
  });
});

describe("parseOklch", () => {
  test("reads the theme's oklch() values", () => {
    assert.deepEqual(parseOklch("oklch(0.686 0.152 257.12)"), {
      l: 0.686,
      c: 0.152,
      h: 257.12,
    });
  });

  test("reads the minified form production CSS ships", () => {
    assert.deepEqual(parseOklch("oklch(95.1% .012 65.23)"), {
      l: 0.951,
      c: 0.012,
      h: 65.23,
    });
    assert.deepEqual(parseOklch("oklch(18% .01 65deg)"), {
      l: 0.18,
      c: 0.01,
      h: 65,
    });
  });

  test("refuses anything else rather than guessing", () => {
    assert.throws(() => parseOklch(""), /OKLCH/);
    assert.throws(() => parseOklch("var(--color-blueberry-500)"), /OKLCH/);
  });
});

describe("label inks", () => {
  test("every kind's colour gets an ink that reads at 11 px (4.5:1)", () => {
    const inks = {
      dark: token(LABEL_INKS.dark),
      light: token(LABEL_INKS.light),
    };
    for (const [kind, variable] of Object.entries(CATEGORY_VAR)) {
      const fill = token(variable.replace("--color-", ""));
      const ink = inkFor(fill, inks);
      const ratio = contrast(fill, inks[ink]);
      assert.ok(ratio >= 4.5, `${kind} labels are ${ratio.toFixed(2)}:1`);
    }
  });

  test("picks the lighter ink on dark fills and the darker on light ones", () => {
    const inks = {
      dark: token(LABEL_INKS.dark),
      light: token(LABEL_INKS.light),
    };
    assert.equal(inkFor(token("lychee-600"), inks), "light");
    assert.equal(inkFor(token("durian-500"), inks), "dark");
  });
});

/**
 * Pith's web view follows the system appearance with CSS variables named after the
 * semantic roles. They must stay the same tokens as semantic.ts, which the native views
 * and the map canvas use.
 */
describe("native-web role variables", () => {
  const css = readFileSync(
    new URL("../native-web/styles.css", import.meta.url),
    "utf8",
  );

  /** `--role-*` declarations keyed by their enclosing blocks, e.g. "@media (…) > :root". */
  function declarations(): Map<string, Map<string, string>> {
    const found = new Map<string, Map<string, string>>();
    const stack: string[] = [];
    let header = "";
    for (const char of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
      if (char === "{") {
        stack.push(header.trim());
        header = "";
      } else if (char === "}") {
        stack.pop();
        header = "";
      } else if (char === ";") {
        const match = header.trim().match(/^--role-([\w-]+):\s*(.+)$/);
        if (match) {
          const context = stack.join(" > ");
          const roles = found.get(context) ?? new Map<string, string>();
          roles.set(match[1], match[2].trim());
          found.set(context, roles);
        }
        header = "";
      } else header += char;
    }
    return found;
  }

  function tokenRef(value: string): TokenRef {
    const plain = value.match(/^var\(--color-([\w-]+)\)$/);
    if (plain) return plain[1];
    const mixed = value.match(
      /^color-mix\(in oklab, var\(--color-([\w-]+)\) ([\d.]+)%, transparent\)$/,
    );
    assert.ok(mixed, `role value "${value}" is a token or a token with alpha`);
    return { token: mixed[1], alpha: Number(mixed[2]) / 100 };
  }

  const kebab = (role: string) =>
    role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

  test("declares every role the map draws with", () => {
    const base = declarations().get(":root");
    assert.ok(base, "a :root block declares the dark roles");
    for (const role of MAP_ROLES) assert.ok(base.has(kebab(role)), role);
  });

  test("match semantic.ts in light, dark and increased contrast", () => {
    const blocks = declarations();
    const block = (context: string) => blocks.get(context) ?? new Map();
    const dark = block(":root");
    const light = block("@media (prefers-color-scheme: light) > :root");
    const darkMore = block(
      "@media (prefers-color-scheme: dark) and (prefers-contrast: more) > :root",
    );
    const lightMore = block(
      "@media (prefers-color-scheme: light) and (prefers-contrast: more) > :root",
    );
    for (const name of dark.keys()) {
      const role = Object.keys(semanticColors).find((r) => kebab(r) === name);
      assert.ok(role, `--role-${name} names a semantic role`);
      const spec = semanticColors[role as keyof typeof semanticColors];
      const lightValue = light.get(name) ?? dark.get(name);
      assert.deepEqual(tokenRef(dark.get(name)), spec.dark, `${role} dark`);
      assert.deepEqual(tokenRef(lightValue), spec.light, `${role} light`);
      assert.deepEqual(
        tokenRef(darkMore.get(name) ?? dark.get(name)),
        "darkHighContrast" in spec ? spec.darkHighContrast : spec.dark,
        `${role} dark, increased contrast`,
      );
      assert.deepEqual(
        tokenRef(lightMore.get(name) ?? lightValue),
        "lightHighContrast" in spec ? spec.lightHighContrast : spec.light,
        `${role} light, increased contrast`,
      );
    }
  });
});
