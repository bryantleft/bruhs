// The world map as plain shapes: one source for the app's WorldMap component and the landing
// page, so both always draw the same fruitlands. No React Native imports.
import { getLocation, ROADS } from '../game/content.ts';
import { palette } from '../theme/palette.ts';

export const MAP_COLUMNS = 24;
export const MAP_ROWS = 32;
export const MAP_TILE = 4;
export const MAP_WIDTH = MAP_COLUMNS * MAP_TILE;
export const MAP_HEIGHT = MAP_ROWS * MAP_TILE;

// ~ sea · - lake · . grass · T forest · : sand · ^ mountain · , marsh · M moonlit grove · X crater
export const MAP_TILES: readonly string[] = [
  '~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~...........,,,,~~~~~',
  '~~...TT.......,,,,,,~~~~',
  '~..TTTT......,,,-,,,,~~~',
  '~.TTT----....,,---,,,~~~',
  '~.TT------...,,,,,,,..~~',
  '~.T--------.....,,....~~',
  '~.T--------...........~~',
  '~..-------.......TT...~~',
  '~...-----.......TTT..~~~',
  '~.TT.............T...:~~',
  '~TTTT...............:~~~',
  '~TTTTT..............:~~~',
  '~TTTTT..............::~~',
  '~TTTT................:~~',
  '~.TT..................~~',
  '~.....................~~',
  '~.....................~~',
  '~...............^.....~~',
  '~^^............^^^....~~',
  '~^^^...........^^.....~~',
  '~^^^^.....MMMM........~~',
  '~^^^^^...MMMMMM..:....~~',
  '~^^^^^^..MMMMMMM::::..~~',
  '~^^^^^^^.MMMMM::::::::~~',
  '~^^^^^^......:::::::::~~',
  '~^^^^^^.....::::::::::~~',
  '~^^^^^.....:::::::::::~~',
  '~~^^^.....::::::::::::~~',
  '~~XXXXX..:::::::::::~~~~',
  '~~XXXXXX~~~~~~~~~~~~~~~~',
  '~~~XXX~~~~~~~~~~~~~~~~~~',
];

type Terrain = Readonly<{ base: string; detail: string; pattern: readonly string[] }>;
const TERRAIN: Readonly<Record<string, Terrain>> = {
  '~': {
    base: palette['blueberry-800'],
    detail: palette['blueberry-600'],
    pattern: ['....', '.##.', '....', '#..#'],
  },
  '-': {
    base: palette['blueberry-600'],
    detail: palette['blueberry-400'],
    pattern: ['....', '..##', '....', '##..'],
  },
  '.': {
    base: palette['pandan-500'],
    detail: palette['pandan-400'],
    pattern: ['....', '.#..', '....', '...#'],
  },
  T: {
    base: palette['pandan-700'],
    detail: palette['pandan-400'],
    pattern: ['.##.', '####', '.##.', '....'],
  },
  ':': {
    base: palette['durian-500'],
    detail: palette['durian-600'],
    pattern: ['....', '..#.', '....', '#...'],
  },
  '^': {
    base: palette['rambutan-700'],
    detail: palette['rambutan-300'],
    pattern: ['.#..', '###.', '####', '....'],
  },
  ',': {
    base: palette['pandan-800'],
    detail: palette['mangosteen-500'],
    pattern: ['....', '.#..', '...#', '....'],
  },
  M: {
    base: palette['mangosteen-800'],
    detail: palette['rambutan-100'],
    pattern: ['....', '.#..', '...#', '#...'],
  },
  X: {
    base: palette['longan-800'],
    detail: palette['persimmon-400'],
    pattern: ['.#..', '....', '...#', '#...'],
  },
};

// A place's centre in map units.
export function tileCenter(id: string): Readonly<{ x: number; y: number }> {
  const place = getLocation(id);
  return { x: (place?.x ?? 0) * MAP_TILE + MAP_TILE / 2, y: (place?.y ?? 0) * MAP_TILE + MAP_TILE / 2 };
}

// A road between two places as one-unit dots, every `gap` units.
export function dottedLine(from: string, to: string, gap = 2): string {
  const a = tileCenter(from);
  const b = tileCenter(to);
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  let d = '';
  for (let index = 0; index <= steps; index += gap) {
    const x = Math.round(a.x + ((b.x - a.x) * index) / steps);
    const y = Math.round(a.y + ((b.y - a.y) * index) / steps);
    d += `M${x} ${y}h1v1h-1z`;
  }
  return d;
}

let cachedTerrain: readonly (readonly [string, string])[] | null = null;

// The terrain as one path per colour.
export function terrainPaths(): readonly (readonly [string, string])[] {
  if (cachedTerrain) return cachedTerrain;
  const paths = new Map<string, string>();
  const add = (fill: string, d: string): void => {
    paths.set(fill, (paths.get(fill) ?? '') + d);
  };
  MAP_TILES.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx += 1) {
      const terrain = TERRAIN[row[tx] ?? '~'] ?? TERRAIN['~'];
      if (!terrain) continue;
      add(terrain.base, `M${tx * MAP_TILE} ${ty * MAP_TILE}h${MAP_TILE}v${MAP_TILE}h${-MAP_TILE}z`);
      terrain.pattern.forEach((line, py) => {
        for (let px = 0; px < line.length; px += 1)
          if (line[px] === '#') add(terrain.detail, `M${tx * MAP_TILE + px} ${ty * MAP_TILE + py}h1v1h-1z`);
      });
    }
  });
  cachedTerrain = [...paths];
  return cachedTerrain;
}

let cachedRoads: string | null = null;

// Every road on the map, dotted.
export function roadPath(): string {
  cachedRoads ??= ROADS.map(([a, b]) => dottedLine(a, b)).join('');
  return cachedRoads;
}
