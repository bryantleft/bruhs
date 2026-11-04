// The adventure scene as plain shapes: one source for the app's Scene component and the
// landing page, so both always draw the same fruitlands. No React Native imports.
import type { Biome, SkinId } from '../game/content.ts';
import { palette } from '../theme/palette.ts';
import {
  ANVIL,
  type Art,
  BOAT,
  BUSH,
  bruhArt,
  CACTUS,
  HOUSE,
  itemArt,
  PINE,
  REEDS,
  ROCK,
  TREE,
  tint,
} from './art.ts';
import { artPaths } from './paths.ts';

export const SCENE_WIDTH = 96;
export const SCENE_HEIGHT = 48;
// The row the ground starts on; props and the bruh stand on it.
export const SCENE_GROUND = 36;
const H = SCENE_HEIGHT;
const GROUND = SCENE_GROUND;

type Prop = Readonly<{ art: Art; x: number; flip?: boolean; y?: number }>;
type Look = Readonly<{
  ground: readonly [string, string];
  hills: string;
  hillHeight: number;
  water?: Readonly<{ top: number; color: string; foam: string }>;
  snow?: boolean;
  night?: boolean;
  props: readonly Prop[];
}>;

const MAHOGANY = tint(TREE, { a: palette['pandan-700'], b: palette['pandan-900'], c: palette['pandan-500'] });
const LONGAN = tint(TREE, {
  a: palette['pandan-400'],
  b: palette['pandan-600'],
  c: palette['pandan-200'],
  f: palette['persimmon-400'],
});
const COPPER = tint(ROCK, { o: palette['persimmon-500'], p: palette['persimmon-300'] });
const TIN = tint(ROCK, { o: palette['rambutan-200'], p: palette['rambutan-50'] });
const IRON = tint(ROCK, { o: palette['lychee-700'], p: palette['lychee-400'] });
const COAL = tint(ROCK, {
  a: palette['longan-700'],
  b: palette['longan-900'],
  c: palette['longan-500'],
  o: '#0a0a0a',
  p: palette['longan-950'],
});
const MITHRIL = tint(ROCK, { o: palette['blueberry-500'], p: palette['blueberry-200'] });
const DESERT = tint(CACTUS, { f: palette['pandan-300'] });
const MOONWOOD = tint(TREE, {
  a: palette['mangosteen-300'],
  b: palette['mangosteen-600'],
  c: palette['rambutan-100'],
  f: palette['persimmon-400'],
});
const MOONSTONE = tint(ROCK, { o: palette['blueberry-100'], p: palette['rambutan-50'] });
const SILKWEED = tint(BUSH, { f: palette['rambutan-50'] });
const STARWOOD = tint(PINE, {
  a: palette['durian-500'],
  b: palette['persimmon-700'],
  c: palette['durian-300'],
});
const SUNSTONE = tint(ROCK, {
  a: palette['longan-700'],
  b: palette['longan-900'],
  c: palette['longan-500'],
  o: palette['persimmon-400'],
  p: palette['durian-200'],
});
const MANGO_BUSH = tint(BUSH, { f: palette['mangosteen-700'] });

const LOOKS: Readonly<Record<Biome, Look>> = {
  town: {
    ground: [palette['pandan-500'], palette['pandan-600']],
    hills: palette['pandan-700'],
    hillHeight: 6,
    props: [
      { art: HOUSE, x: 4 },
      { art: HOUSE, x: 18 },
      { art: ANVIL, x: 64 },
      { art: TREE, x: 78 },
    ],
  },
  forest: {
    ground: [palette['pandan-600'], palette['pandan-700']],
    hills: palette['pandan-800'],
    hillHeight: 10,
    props: [
      { art: TREE, x: 2 },
      { art: TREE, x: 14, y: GROUND + 2 },
      { art: BUSH, x: 60 },
      { art: TREE, x: 72 },
      { art: TREE, x: 84, y: GROUND + 1 },
    ],
  },
  hills: {
    ground: [palette['pandan-400'], palette['pandan-500']],
    hills: palette['pandan-600'],
    hillHeight: 14,
    props: [
      { art: COPPER, x: 6 },
      { art: TIN, x: 18, y: GROUND + 3 },
      { art: COPPER, x: 62, y: GROUND + 2 },
      { art: TIN, x: 78 },
    ],
  },
  lake: {
    ground: [palette['pandan-500'], palette['pandan-600']],
    hills: palette['pandan-700'],
    hillHeight: 8,
    water: { top: 38, color: palette['blueberry-600'], foam: palette['blueberry-300'] },
    props: [
      { art: LONGAN, x: 4 },
      { art: REEDS, x: 20 },
      { art: REEDS, x: 62 },
      { art: LONGAN, x: 80 },
    ],
  },
  dunes: {
    ground: [palette['durian-500'], palette['durian-600']],
    hills: palette['durian-600'],
    hillHeight: 9,
    props: [
      { art: IRON, x: 6 },
      { art: DESERT, x: 22 },
      { art: COAL, x: 62, y: GROUND + 2 },
      { art: IRON, x: 80 },
    ],
  },
  marsh: {
    ground: [palette['pandan-700'], palette['pandan-800']],
    hills: palette['mangosteen-900'],
    hillHeight: 7,
    water: { top: 41, color: palette['pandan-900'], foam: palette['pandan-600'] },
    props: [
      { art: MAHOGANY, x: 2 },
      { art: REEDS, x: 18 },
      { art: MANGO_BUSH, x: 60 },
      { art: MAHOGANY, x: 80 },
    ],
  },
  peak: {
    ground: [palette['rambutan-500'], palette['rambutan-600']],
    hills: palette['mangosteen-700'],
    hillHeight: 24,
    snow: true,
    props: [
      { art: PINE, x: 4 },
      { art: MITHRIL, x: 16, y: GROUND + 3 },
      { art: CACTUS, x: 64 },
      { art: PINE, x: 80 },
    ],
  },
  bay: {
    ground: [palette['durian-400'], palette['durian-500']],
    hills: palette['blueberry-800'],
    hillHeight: 4,
    water: { top: 34, color: palette['blueberry-700'], foam: palette['blueberry-300'] },
    props: [
      { art: HOUSE, x: 4 },
      { art: BOAT, x: 66, y: 38 },
    ],
  },
  // Always night in the grove: the sky is drawn dark whatever the hour.
  grove: {
    ground: [palette['mangosteen-800'], palette['mangosteen-700']],
    hills: palette['mangosteen-900'],
    hillHeight: 9,
    night: true,
    water: { top: 42, color: palette['blueberry-800'], foam: palette['blueberry-200'] },
    props: [
      { art: MOONWOOD, x: 3 },
      { art: MOONSTONE, x: 18, y: GROUND + 3 },
      { art: SILKWEED, x: 62 },
      { art: MOONWOOD, x: 78 },
    ],
  },
  crater: {
    ground: [palette['longan-700'], palette['longan-800']],
    hills: palette['rambutan-800'],
    hillHeight: 16,
    water: { top: 42, color: palette['persimmon-700'], foam: palette['durian-300'] },
    props: [
      { art: STARWOOD, x: 4 },
      { art: SUNSTONE, x: 18, y: GROUND + 3 },
      { art: ANVIL, x: 62 },
      { art: STARWOOD, x: 80 },
    ],
  },
};

function sky(night: boolean): readonly string[] {
  return night
    ? [
        palette['mangosteen-950'],
        palette['blueberry-950'],
        palette['mangosteen-900'],
        palette['mangosteen-800'],
      ]
    : [
        palette['blueberry-400'],
        palette['blueberry-300'],
        palette['blueberry-200'],
        palette['blueberry-100'],
      ];
}

function rect(x: number, y: number, w: number, h: number): string {
  return `M${x} ${y}h${w}v${h}h${-w}z`;
}

export type SceneShape = Readonly<{ fill: string; d: string; transform?: string }>;

export type SceneInput = Readonly<{
  biome: Biome;
  skin: SkinId;
  night: boolean;
  // Animation frame 0-3; a still scene uses 0.
  frame: number;
  working: boolean;
  walking: boolean;
  tool?: string;
  // A wider canvas (the landing page hero). The biome's props and the bruh stay centred.
  width?: number;
}>;

// One sprite as scene shapes, with its top-left corner at (x, y).
export function spriteAt(art: Art, x: number, y: number, flip?: boolean): SceneShape[] {
  const transform = flip ? `translate(${x + art.w} ${y}) scale(-1 1)` : `translate(${x} ${y})`;
  return artPaths(art).map(([fill, d]) => ({ fill, d, transform }));
}

// Back to front: sky, hills, ground, water, props, the bruh's shadow, the bruh and its tool.
export function sceneShapes(input: SceneInput): readonly SceneShape[] {
  const look = LOOKS[input.biome];
  const W = input.width ?? SCENE_WIDTH;
  const offset = Math.round((W - SCENE_WIDTH) / 2);
  const night = look.night || input.night;
  const shapes: SceneShape[] = [];
  const bands = sky(night);
  bands.forEach((fill, index) => {
    shapes.push({ fill, d: rect(0, index * 6, W, index === bands.length - 1 ? GROUND : 6) });
  });
  let hills = '';
  let snow = '';
  for (let x = 0; x < W; x += 1) {
    const wave = Math.sin(x / 9) * 0.6 + Math.sin(x / 4.3 + 1) * 0.25 + Math.sin(x / 17 + 2) * 0.4;
    const top = Math.round(GROUND - look.hillHeight + wave * (look.hillHeight / 2.4));
    hills += rect(x, top, 1, GROUND - top);
    if (look.snow) snow += rect(x, top, 1, 2);
  }
  shapes.push({ fill: look.hills, d: hills });
  if (snow) shapes.push({ fill: palette['rambutan-50'], d: snow });
  shapes.push({ fill: look.ground[0], d: rect(0, GROUND, W, H - GROUND) });
  let speckle = '';
  for (let x = 0; x < W; x += 1) {
    const y = GROUND + 2 + ((x * 7) % 9);
    if ((x * 13) % 5 === 0) speckle += rect(x, y, 1, 1);
  }
  shapes.push({ fill: look.ground[1], d: speckle });
  if (night) {
    let stars = '';
    for (let index = 0; index < 18; index += 1) stars += rect((index * 37) % W, (index * 11) % 20, 1, 1);
    shapes.push({ fill: palette['durian-200'], d: stars });
  } else shapes.push({ fill: palette['durian-300'], d: rect(offset + 80, 4, 6, 6) });
  const water = look.water;
  if (water) {
    shapes.push({ fill: water.color, d: rect(0, water.top, W, H - water.top) });
    let foam = '';
    for (let x = 0; x < W; x += 8)
      foam += rect((x + input.frame * 2) % W, water.top + 2 + ((x / 8) % 3) * 3, 3, 1);
    shapes.push({ fill: water.foam, d: foam });
  }
  for (const prop of look.props)
    shapes.push(...spriteAt(prop.art, offset + prop.x, (prop.y ?? GROUND + 1) - prop.art.h, prop.flip));
  const moving = input.working || input.walking;
  const bob = moving && input.frame % 2 === 1 ? -1 : 0;
  const bruhX = offset + (input.walking ? 26 + ((input.frame * 3) % 12) : 40);
  shapes.push({ fill: 'rgba(10,10,10,0.35)', d: rect(bruhX + 2, GROUND + 4, 12, 2) });
  shapes.push(...spriteAt(bruhArt(input.skin), bruhX, GROUND - 12 + bob));
  const toolArt = input.tool && input.working ? itemArt(input.tool) : undefined;
  if (toolArt)
    shapes.push(
      ...spriteAt(toolArt, bruhX + 13, GROUND - 9 + (input.frame % 2 === 0 ? 0 : -2), input.frame % 2 === 1),
    );
  return shapes;
}
