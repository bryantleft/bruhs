// The sprite format and the two helpers every sprite file draws with.
import { palette } from '../../theme/palette.ts';

export type Art = Readonly<{
  w: number;
  h: number;
  rows: readonly string[];
  colors: Readonly<Record<string, string>>;
}>;

export const INK = '#0a0a0a';

export const WHITE = palette['rambutan-50'];

export function art(rows: readonly string[], colors: Readonly<Record<string, string>>): Art {
  return { w: rows[0]?.length ?? 0, h: rows.length, rows, colors: { k: INK, ...colors } };
}

// Swap a template's palette (tiers of logs, ores, metals and fish share one drawing).
export function tint(base: Art, colors: Readonly<Record<string, string>>): Art {
  return { ...base, colors: { ...base.colors, ...colors } };
}

// Handles, hafts and planks.
export const WOOD = { h: palette['persimmon-700'], d: palette['persimmon-900'] };
