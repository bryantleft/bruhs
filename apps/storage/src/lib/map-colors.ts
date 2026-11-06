/**
 * Which theme tokens the disk map draws with. The canvas can't use CSS classes, so it
 * resolves bruhs's semantic roles itself, for the appearance its host follows.
 */

import { contrast, type Oklch } from "@bruhs/theme/oklch";
import { semanticColors, type TokenRef } from "@bruhs/theme/semantic";

export type Appearance = "dark" | "light";

/** The semantic roles the map draws with. */
export const MAP_ROLES = [
  "text",
  "textSecondary",
  "textTertiary",
  "hairline",
  "well",
  "accent",
  "selection",
] as const;
export type MapRole = (typeof MAP_ROLES)[number];

/**
 * Inks for labels on coloured blocks: the theme's darkest and lightest warm neutrals.
 * Each block takes whichever contrasts more with its fill.
 */
export const LABEL_INKS = { dark: "longan-950", light: "rambutan-50" } as const;

/** The token behind each role, using the increased-contrast variant where one exists. */
export function roleTokens(
  appearance: Appearance,
  increasedContrast: boolean,
): Record<MapRole, TokenRef> {
  const tokens = {} as Record<MapRole, TokenRef>;
  for (const role of MAP_ROLES) {
    const spec: {
      dark: TokenRef;
      light: TokenRef;
      darkHighContrast?: TokenRef;
      lightHighContrast?: TokenRef;
    } = semanticColors[role];
    const more =
      appearance === "dark" ? spec.darkHighContrast : spec.lightHighContrast;
    tokens[role] = (increasedContrast && more) || spec[appearance];
  }
  return tokens;
}

/**
 * A theme colour as the page's CSS states it: the source form (lightness 0.686) or the
 * minified one production builds ship (lightness 68.6%, ".152", an optional "deg").
 */
export function parseOklch(value: string): Oklch {
  const number = String.raw`(\d*\.?\d+)`;
  const match = value
    .trim()
    .match(
      new RegExp(
        `^oklch\\(\\s*${number}(%?)\\s+${number}\\s+${number}(?:deg)?\\s*\\)$`,
      ),
    );
  if (!match) {
    throw new Error(
      `Expected a theme colour in OKLCH, got "${value}". The map's colours come from the bruhs tokens.`,
    );
  }
  const lightness = Number(match[1]);
  return {
    l: match[2] === "%" ? lightness / 100 : lightness,
    c: Number(match[3]),
    h: Number(match[4]),
  };
}

/** The label ink that contrasts more with `fill`. */
export function inkFor(
  fill: Oklch,
  inks: { readonly dark: Oklch; readonly light: Oklch },
): "dark" | "light" {
  return contrast(fill, inks.dark) >= contrast(fill, inks.light)
    ? "dark"
    : "light";
}
