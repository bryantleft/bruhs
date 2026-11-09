import { palette } from '../../theme/palette.ts';
import { type Art, art } from './core.ts';

// The bruh mascot in each skin, awake or asleep.

// Face ramp: c light, a base, b shadow, e deep (a thin rim at the bottom right).
type SkinColors = Readonly<{ a: string; b: string; c: string; e: string }>;

const SKIN_COLORS: Readonly<Record<string, SkinColors>> = {
  original: {
    a: palette['bruh-base'],
    b: palette['durian-600'],
    c: palette['durian-200'],
    e: palette['durian-700'],
  },
  pandan: {
    a: palette['pandan-300'],
    b: palette['pandan-500'],
    c: palette['pandan-100'],
    e: palette['pandan-600'],
  },
  durian: {
    a: palette['durian-400'],
    b: palette['durian-600'],
    c: palette['durian-200'],
    e: palette['durian-700'],
  },
  mangosteen: {
    a: palette['mangosteen-300'],
    b: palette['mangosteen-500'],
    c: palette['mangosteen-100'],
    e: palette['mangosteen-600'],
  },
  dragonfruit: {
    a: palette['dragonfruit-200'],
    b: palette['dragonfruit-400'],
    c: palette['dragonfruit-50'],
    e: palette['dragonfruit-500'],
  },
  blueberry: {
    a: palette['blueberry-300'],
    b: palette['blueberry-500'],
    c: palette['blueberry-100'],
    e: palette['blueberry-600'],
  },
};

// Accessory overlays (16 wide, '.' leaves the face showing). Ink is added around any accessory
// pixel that sticks out past the face, so every skin keeps a closed outline.
const ACCESSORIES: Readonly<
  Record<string, Readonly<{ rows: readonly string[]; colors: Record<string, string> }>>
> = {
  // An orange headband with a pandan leaf tucked in at the side.
  pandan: {
    rows: [
      '................',
      '.............g..',
      '..........g.gG..',
      '..........GgG...',
      '..ooooooooOOoo..',
    ],
    colors: {
      g: palette['pandan-400'],
      G: palette['pandan-600'],
      o: palette['persimmon-400'],
      O: palette['persimmon-600'],
    },
  },
  // Husk spikes: two poking out at the crown's corners, three marked on the forehead.
  durian: {
    rows: ['................', '...ss..S..S..ss.', '....S.sS.sS.sS..', '.....sS..sS.....'],
    colors: { s: palette['durian-600'], S: palette['durian-800'] },
  },
  // A deep purple cap with the mangosteen's green calyx on top and a short brim.
  mangosteen: {
    rows: ['................', '.....ppgGpqq....', '....ppgGGgpqq...', '..PPPPPPPPPPQQ..'],
    colors: {
      p: palette['mangosteen-700'],
      q: palette['mangosteen-900'],
      P: palette['mangosteen-500'],
      Q: palette['mangosteen-700'],
      g: palette['pandan-400'],
      G: palette['pandan-600'],
    },
  },
  dragonfruit: {
    rows: [
      '................',
      '................',
      '....g......g....',
      '................',
      '................',
      '................',
      '................',
      '................',
      '.g............g.',
      '................',
      '................',
      '................',
      '.....g....g.....',
    ],
    colors: { g: palette['pandan-400'] },
  },
  // A round blue hat with a brim wider than the face.
  blueberry: {
    rows: [
      '................',
      '.....BBBbbb.....',
      '....BBBBBbbd....',
      '...BBBBBBbbdd...',
      '.LLLLLLLLLLLLLL.',
    ],
    colors: {
      B: palette['blueberry-500'],
      b: palette['blueberry-600'],
      d: palette['blueberry-800'],
      L: palette['blueberry-400'],
    },
  },
};

const BRUH_SIZE = 16;

const bruhCache = new Map<string, Art>();

export function bruhArt(skin: string, asleep = false): Art {
  const key = `${skin}:${asleep}`;
  const cached = bruhCache.get(key);
  if (cached) return cached;
  const colors = SKIN_COLORS[skin] ?? SKIN_COLORS.original;
  const grid: string[][] = [];
  const center = 7.5;
  for (let y = 0; y < BRUH_SIZE; y += 1) {
    const row: string[] = [];
    for (let x = 0; x < BRUH_SIZE; x += 1) {
      const distance = Math.hypot(x - center, y - center + 0.5);
      if (distance > 7.6) row.push('.');
      else if (distance > 6.6) row.push('k');
      else if (x + y >= 21 && distance > 5.6) row.push('e');
      else if (x + y >= 19 && distance > 4.8) row.push('b');
      else if (x + y <= 8 && distance > 4.2) row.push('c');
      else row.push('a');
    }
    grid.push(row);
  }
  const at = (x: number, y: number): string | undefined => grid[y]?.[x];
  const set = (x: number, y: number, value: string): void => {
    const row = grid[y];
    if (row && x >= 0 && x < BRUH_SIZE) row[x] = value;
  };
  for (const x of [4, 5, 10, 11]) set(x, asleep ? 7 : 6, 'k');
  for (let x = 5; x <= 10; x += 1) set(x, 10, 'm');
  const accessory = ACCESSORIES[skin];
  const extra: Record<string, string> = {};
  if (accessory) {
    accessory.rows.forEach((line, y) => {
      for (let x = 0; x < line.length; x += 1) {
        const value = line[x];
        if (value && value !== '.') set(x, y, value);
      }
    });
    Object.assign(extra, accessory.colors);
    // Close the outline around anything that pokes out past the face.
    const ink: [number, number][] = [];
    for (let y = 0; y < BRUH_SIZE; y += 1)
      for (let x = 0; x < BRUH_SIZE; x += 1) {
        if (at(x, y) !== '.') continue;
        const touches = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].some(
          (value) => value !== undefined && value !== '.' && value !== 'k',
        );
        if (touches) ink.push([x, y]);
      }
    for (const [x, y] of ink) set(x, y, 'k');
  }
  const result = art(
    grid.map((row) => row.join('')),
    { ...colors, ...extra, m: palette['bruh-mouth'] },
  );
  bruhCache.set(key, result);
  return result;
}
