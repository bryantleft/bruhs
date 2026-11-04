import themeCss from "@bruhs/theme/styles/index.css?raw";

/**
 * Literal values of the theme's colour tokens, read from @bruhs/theme's stylesheet at
 * build time. Used where a CSS variable can't be: copy-paste code samples that must
 * work without the theme. Import only from `.astro` frontmatter (server side).
 */
const TOKENS: ReadonlyMap<string, string> = new Map(
  [...themeCss.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)].map(
    ([, name, value]) => [name, value.trim()],
  ),
);

/** The literal value of a colour token such as `"lychee-500"` or `"bruh-base"`. */
export function colorToken(name: string): string {
  const value = TOKENS.get(name);
  if (!value || value.startsWith("var(")) {
    throw new Error(`@bruhs/theme has no literal colour token --color-${name}`);
  }
  return value;
}
