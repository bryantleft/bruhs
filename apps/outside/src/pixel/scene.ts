// The adventure scene as plain shapes: one source for the app's Scene component and the
// landing page, so both always draw the same fruitlands. No React Native imports.
import type { Biome, SkinId } from '../game/content.ts';
import { palette } from '../theme/palette.ts';
import { type Art, BOAT, BUSH, bruhArt, CACTUS, itemArt, PINE, REEDS, ROCK, TREE, tint } from './art.ts';
import { artPaths } from './paths.ts';
import { COTTAGE, SCENE_ANVIL } from './sprites/scenery.ts';

export const SCENE_WIDTH = 96;
export const SCENE_HEIGHT = 48;
// The row the ground starts on; props and the bruh stand on it.
export const SCENE_GROUND = 36;
const H = SCENE_HEIGHT;
const GROUND = SCENE_GROUND;
// The longest side of the tool a working bruh holds, in scene pixels (the bruh is 16).
const TOOL_SIZE = 10;

type Prop = Readonly<{ art: Art; x: number; flip?: boolean; y?: number }>;
// Ground specks: a tuft of grass, a flower on a stem, a pebble, a ripple line or a flat patch.
type Detail = Readonly<{
  kind: 'tuft' | 'flower' | 'pebble' | 'ripple' | 'patch';
  color: string;
  light?: string;
}>;
type Hill = Readonly<{
  color: string;
  height: number;
  edge?: string;
  snow?: boolean;
  crown?: 'round' | 'pointed';
  // The far range fades into the sky by day; at night it turns to this (dusk purple if unset).
  night?: string;
}>;
type Look = Readonly<{
  // Ground base, a lit lip along its top edge, and its darker specks.
  ground: readonly [string, string];
  lip: string;
  // Two hill layers: a pale far range and the biome's near hills, each with a lighter top edge.
  far: Hill;
  near: Hill;
  details: readonly Detail[];
  water?: Readonly<{ top: number; color: string; foam: string; from?: number }>;
  night?: boolean;
  props: readonly Prop[];
}>;

// Leaves, stone or roof in four steps (c light, a base, b shadow, e deep).
type Ramp = Readonly<{ c: string; a: string; b: string; e: string }>;
type Tone = keyof typeof palette;
const ramp = (c: Tone, a: Tone, b: Tone, e: Tone): Ramp => ({
  c: palette[c],
  a: palette[a],
  b: palette[b],
  e: palette[e],
});
type Bark = Readonly<{ i: string; h: string; d: string; j: string }>;
const BARK: Bark = {
  i: palette['persimmon-700'],
  h: palette['persimmon-800'],
  d: palette['persimmon-900'],
  j: palette['persimmon-950'],
};
const PALE_BARK: Bark = {
  i: palette['rambutan-200'],
  h: palette['rambutan-400'],
  d: palette['rambutan-600'],
  j: palette['rambutan-800'],
};

// Every tint defines every key its template uses, so no tier keeps the template's colour.
// Trees: `f` is fruit, drawn in the leaf colour when the tree bears none.
const tree = (leaves: Ramp, fruit: string = leaves.a, bark = BARK): Art =>
  tint(TREE, { ...leaves, f: fruit, ...bark });
const pine = (leaves: Ramp, bark = BARK): Art => tint(PINE, { ...leaves, ...bark });
// Rocks: `o` is the ore, `p` its glint.
const rock = (
  ore: Tone,
  glint: Tone,
  stone = ramp('rambutan-400', 'rambutan-600', 'rambutan-800', 'rambutan-950'),
): Art =>
  tint(ROCK, {
    ...stone,
    o: palette[ore],
    p: palette[glint],
  });
const bush = (leaves: Ramp, berry: string): Art => tint(BUSH, { ...leaves, f: berry });

const GREEN = ramp('pandan-300', 'pandan-500', 'pandan-700', 'pandan-900');
const OAK = tree(GREEN);
const MAHOGANY = tree(ramp('pandan-500', 'pandan-700', 'pandan-800', 'pandan-950'), undefined, {
  ...BARK,
  i: palette['lychee-700'],
  h: palette['lychee-800'],
});
const LONGAN = tree(ramp('pandan-200', 'pandan-400', 'pandan-600', 'pandan-800'), palette['durian-600']);
const MOONWOOD = tree(
  ramp('rambutan-50', 'mangosteen-300', 'mangosteen-500', 'mangosteen-700'),
  palette['persimmon-400'],
  PALE_BARK,
);
const FIR = pine(ramp('pandan-400', 'pandan-600', 'pandan-800', 'pandan-950'));
const DRAGONWOOD = pine(ramp('pandan-300', 'pandan-500', 'mangosteen-700', 'mangosteen-900'));
const STARWOOD = pine(ramp('durian-300', 'durian-500', 'persimmon-700', 'persimmon-900'), PALE_BARK);
const COPPER = rock('persimmon-500', 'persimmon-300');
const TIN = rock('rambutan-200', 'rambutan-50');
const IRON = rock('lychee-700', 'lychee-400');
const GOLD = rock('durian-500', 'durian-200');
const COAL = rock('rambutan-950', 'longan-600', ramp('longan-500', 'longan-700', 'longan-800', 'longan-950'));
const MITHRIL = rock('blueberry-500', 'blueberry-200');
const MOONSTONE = rock(
  'blueberry-100',
  'rambutan-50',
  ramp('mangosteen-400', 'mangosteen-600', 'mangosteen-800', 'mangosteen-950'),
);
const SUNSTONE = rock(
  'persimmon-400',
  'durian-200',
  ramp('longan-500', 'longan-700', 'longan-800', 'longan-950'),
);
const BERRY_BUSH = bush(GREEN, palette['lychee-500']);
const SILKWEED = bush(
  ramp('mangosteen-200', 'mangosteen-400', 'mangosteen-600', 'mangosteen-800'),
  palette['rambutan-50'],
);
const MANGO_BUSH = bush(
  ramp('pandan-400', 'pandan-600', 'pandan-800', 'pandan-950'),
  palette['mangosteen-700'],
);
const DRAGONFRUIT = tint(CACTUS, { ...GREEN, f: palette['dragonfruit-400'] });
const DESERT = tint(CACTUS, {
  ...ramp('pandan-300', 'pandan-500', 'pandan-700', 'pandan-900'),
  f: palette['durian-300'],
});
const MARSH_REEDS = tint(REEDS, { ...ramp('pandan-400', 'pandan-600', 'pandan-800', 'pandan-950'), ...BARK });
// Same walls, door and windows; only the roof changes.
const BLUE_COTTAGE = tint(COTTAGE, ramp('blueberry-300', 'blueberry-500', 'blueberry-700', 'blueberry-900'));

const tuft = (color: string): Detail => ({ kind: 'tuft', color });
const flower = (color: string, stem: string): Detail => ({ kind: 'flower', color, light: stem });
const pebble = (color: string, light: string): Detail => ({ kind: 'pebble', color, light });

const LOOKS: Readonly<Record<Biome, Look>> = {
  town: {
    ground: [palette['pandan-500'], palette['pandan-600']],
    lip: palette['pandan-400'],
    far: { color: palette['blueberry-300'], height: 12 },
    near: { color: palette['pandan-600'], edge: palette['pandan-500'], height: 6 },
    details: [
      tuft(palette['pandan-700']),
      flower(palette['lychee-400'], palette['pandan-700']),
      flower(palette['durian-300'], palette['pandan-700']),
      pebble(palette['pandan-700'], palette['pandan-400']),
    ],
    props: [
      { art: COTTAGE, x: 1 },
      { art: SCENE_ANVIL, x: 26, y: GROUND + 2 },
      { art: BLUE_COTTAGE, x: 69, flip: true },
      { art: OAK, x: 58, y: GROUND + 2 },
    ],
  },
  forest: {
    ground: [palette['pandan-600'], palette['pandan-700']],
    lip: palette['pandan-500'],
    far: { color: palette['pandan-700'], height: 14, crown: 'round', night: palette['pandan-700'] },
    near: { color: palette['pandan-800'], edge: palette['pandan-700'], height: 9, crown: 'pointed' },
    details: [
      tuft(palette['pandan-800']),
      tuft(palette['pandan-500']),
      flower(palette['lychee-500'], palette['rambutan-50']),
      pebble(palette['persimmon-700'], palette['persimmon-500']),
    ],
    props: [
      { art: FIR, x: 0 },
      { art: OAK, x: 9, y: GROUND + 2 },
      { art: BERRY_BUSH, x: 25, y: GROUND + 3 },
      { art: FIR, x: 60 },
      { art: OAK, x: 68, y: GROUND + 2, flip: true },
      { art: BERRY_BUSH, x: 84, y: GROUND + 3, flip: true },
    ],
  },
  hills: {
    ground: [palette['pandan-400'], palette['pandan-500']],
    lip: palette['pandan-300'],
    far: { color: palette['blueberry-300'], height: 20 },
    near: { color: palette['pandan-600'], edge: palette['pandan-500'], height: 13 },
    details: [
      tuft(palette['pandan-600']),
      pebble(palette['rambutan-600'], palette['rambutan-300']),
      flower(palette['durian-300'], palette['pandan-600']),
    ],
    props: [
      { art: COPPER, x: 4 },
      { art: TIN, x: 20, y: GROUND + 3 },
      { art: BERRY_BUSH, x: 62, flip: true },
      { art: COPPER, x: 66, y: GROUND + 3 },
      { art: TIN, x: 80 },
    ],
  },
  lake: {
    ground: [palette['pandan-500'], palette['pandan-600']],
    lip: palette['pandan-400'],
    far: { color: palette['blueberry-300'], height: 11 },
    near: { color: palette['pandan-700'], edge: palette['pandan-600'], height: 7, crown: 'round' },
    water: { top: 40, color: palette['blueberry-600'], foam: palette['blueberry-300'] },
    details: [tuft(palette['pandan-700']), flower(palette['rambutan-50'], palette['pandan-700'])],
    props: [
      { art: LONGAN, x: 2 },
      { art: REEDS, x: 22, y: GROUND + 6 },
      { art: REEDS, x: 62, y: GROUND + 5, flip: true },
      { art: LONGAN, x: 76, flip: true },
    ],
  },
  dunes: {
    ground: [palette['durian-500'], palette['durian-600']],
    lip: palette['durian-400'],
    far: { color: palette['durian-300'], height: 15 },
    near: { color: palette['durian-600'], edge: palette['durian-500'], height: 9 },
    details: [
      { kind: 'ripple', color: palette['durian-600'] },
      pebble(palette['durian-700'], palette['durian-400']),
      { kind: 'ripple', color: palette['durian-400'] },
    ],
    props: [
      { art: IRON, x: 3 },
      { art: DESERT, x: 21 },
      { art: COAL, x: 60, y: GROUND + 3 },
      { art: GOLD, x: 77, y: GROUND + 1 },
    ],
  },
  marsh: {
    ground: [palette['pandan-700'], palette['pandan-800']],
    lip: palette['pandan-600'],
    far: { color: palette['mangosteen-700'], height: 11, crown: 'round', night: palette['mangosteen-700'] },
    near: { color: palette['mangosteen-900'], edge: palette['mangosteen-800'], height: 7 },
    water: { top: 42, color: palette['pandan-900'], foam: palette['pandan-600'] },
    details: [tuft(palette['pandan-900']), flower(palette['mangosteen-400'], palette['pandan-900'])],
    props: [
      { art: MAHOGANY, x: 0 },
      { art: MARSH_REEDS, x: 20, y: GROUND + 7 },
      { art: MANGO_BUSH, x: 60, y: GROUND + 2 },
      { art: MARSH_REEDS, x: 72, y: GROUND + 7, flip: true },
      { art: MAHOGANY, x: 78, y: GROUND + 1, flip: true },
    ],
  },
  peak: {
    ground: [palette['rambutan-400'], palette['rambutan-500']],
    lip: palette['rambutan-200'],
    far: { color: palette['mangosteen-400'], height: 25, snow: true, night: palette['mangosteen-600'] },
    near: { color: palette['mangosteen-700'], edge: palette['mangosteen-600'], height: 16, snow: true },
    details: [
      { kind: 'patch', color: palette['rambutan-100'] },
      pebble(palette['rambutan-700'], palette['rambutan-300']),
    ],
    props: [
      { art: DRAGONWOOD, x: 2 },
      { art: MITHRIL, x: 16, y: GROUND + 3 },
      { art: DRAGONFRUIT, x: 62 },
      { art: DRAGONWOOD, x: 76 },
      { art: DRAGONWOOD, x: 85, y: GROUND + 2 },
    ],
  },
  bay: {
    ground: [palette['durian-400'], palette['durian-500']],
    lip: palette['durian-300'],
    far: { color: palette['blueberry-500'], height: 5, night: palette['blueberry-800'] },
    near: { color: palette['blueberry-800'], edge: palette['blueberry-700'], height: 3 },
    water: { top: 37, color: palette['blueberry-700'], foam: palette['blueberry-300'], from: 60 },
    details: [
      pebble(palette['durian-600'], palette['durian-200']),
      flower(palette['dragonfruit-200'], palette['durian-600']),
      { kind: 'ripple', color: palette['durian-500'] },
    ],
    props: [
      { art: COTTAGE, x: 2 },
      { art: BOAT, x: 70, y: 41 },
    ],
  },
  // Always night in the grove: the sky is drawn dark whatever the hour.
  grove: {
    ground: [palette['mangosteen-800'], palette['mangosteen-900']],
    lip: palette['mangosteen-700'],
    far: { color: palette['mangosteen-900'], height: 13, crown: 'pointed', night: palette['mangosteen-900'] },
    near: { color: palette['mangosteen-950'], edge: palette['mangosteen-900'], height: 8, crown: 'round' },
    night: true,
    water: { top: 42, color: palette['blueberry-800'], foam: palette['blueberry-200'] },
    details: [
      flower(palette['blueberry-200'], palette['mangosteen-900']),
      flower(palette['mangosteen-300'], palette['mangosteen-900']),
      tuft(palette['mangosteen-700']),
    ],
    props: [
      { art: MOONWOOD, x: 1 },
      { art: MOONSTONE, x: 20, y: GROUND + 3 },
      { art: SILKWEED, x: 60, y: GROUND + 2 },
      { art: MOONWOOD, x: 76, flip: true },
    ],
  },
  crater: {
    ground: [palette['longan-700'], palette['longan-800']],
    lip: palette['longan-600'],
    far: { color: palette['rambutan-700'], height: 22, night: palette['rambutan-700'] },
    near: { color: palette['rambutan-800'], edge: palette['rambutan-700'], height: 15 },
    water: { top: 42, color: palette['persimmon-700'], foam: palette['durian-300'] },
    details: [
      pebble(palette['longan-900'], palette['longan-500']),
      { kind: 'pebble', color: palette['persimmon-600'], light: palette['persimmon-400'] },
    ],
    props: [
      { art: STARWOOD, x: 3 },
      { art: SUNSTONE, x: 17, y: GROUND + 3 },
      { art: SCENE_ANVIL, x: 62, y: GROUND + 2 },
      { art: STARWOOD, x: 80, flip: true },
    ],
  },
};

// Sky bands from the top down; each meets the next on a stepped edge rather than a straight line.
function sky(night: boolean): readonly (readonly [string, number])[] {
  return night
    ? [
        [palette['mangosteen-950'], 8],
        [palette['blueberry-950'], 8],
        [palette['mangosteen-900'], 8],
        [palette['mangosteen-800'], GROUND],
      ]
    : [
        [palette['blueberry-400'], 7],
        [palette['blueberry-300'], 8],
        [palette['blueberry-200'], 8],
        [palette['blueberry-100'], GROUND],
      ];
}

function rect(x: number, y: number, w: number, h: number): string {
  return `M${x} ${y}h${w}v${h}h${-w}z`;
}

// A small fixed hash, so scattered details land in the same place on every render.
function hash(n: number): number {
  let value = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

// Pixels of a disc of radius r centred on (cx, cy).
function disc(
  cx: number,
  cy: number,
  r: number,
  keep: (dx: number, dy: number) => boolean = () => true,
): string {
  let d = '';
  const span = Math.ceil(r);
  for (let dy = -span; dy < span; dy += 1)
    for (let dx = -span; dx < span; dx += 1)
      if (Math.hypot(dx + 0.5, dy + 0.5) <= r && keep(dx + 0.5, dy + 0.5)) d += rect(cx + dx, cy + dy, 1, 1);
  return d;
}

// A flat-bottomed pixel cloud: rows of [start, length] for its lit top and its shaded base.
const CLOUD_LIGHT: readonly (readonly [number, number])[] = [
  [4, 4],
  [2, 9],
  [0, 13],
];
const CLOUD_SHADE: readonly [number, number] = [1, 11];

function cloud(x: number, y: number, scale: number): [string, string] {
  let light = '';
  CLOUD_LIGHT.forEach(([start, length], row) => {
    light += rect(x + Math.round(start * scale), y + row, Math.max(2, Math.round(length * scale)), 1);
  });
  const [start, length] = CLOUD_SHADE;
  const shade = rect(x + Math.round(start * scale), y + CLOUD_LIGHT.length, Math.round(length * scale), 1);
  return [light, shade];
}

// One hill range: its top line per column, with rounded or pointed tree crowns if asked.
function hillTops(hill: Hill, W: number, phase: number): number[] {
  const tops: number[] = [];
  for (let x = 0; x < W; x += 1) {
    const wave =
      Math.sin(x / 9 + phase) * 0.6 +
      Math.sin(x / 4.3 + 1 + phase) * 0.25 +
      Math.sin(x / 17 + 2 + phase * 2) * 0.4;
    let top = GROUND - hill.height + wave * (hill.height / 2.6);
    if (hill.crown === 'round') top -= Math.abs(Math.sin((x * Math.PI) / 5)) * 2;
    if (hill.crown === 'pointed') top -= 3 - Math.abs((x % 6) - 3);
    tops.push(Math.round(top));
  }
  return tops;
}

function hillShapes(hill: Hill, W: number, phase: number): SceneShape[] {
  const tops = hillTops(hill, W, phase);
  let body = '';
  let edge = '';
  let snow = '';
  tops.forEach((top, x) => {
    body += rect(x, top, 1, GROUND - top);
    // The lit edge follows the skyline: one pixel on top, plus the rising side of each step.
    if (hill.edge) edge += rect(x, top, 1, Math.max(1, (tops[x - 1] ?? top) - top));
    if (hill.snow && top < GROUND - hill.height + 2) snow += rect(x, top, 1, 2);
  });
  const shapes: SceneShape[] = [{ fill: hill.color, d: body }];
  if (edge && hill.edge) shapes.push({ fill: hill.edge, d: edge });
  if (snow) shapes.push({ fill: palette['rambutan-50'], d: snow });
  return shapes;
}

// Scattered ground details across the whole width, kept off the row the props stand on.
function detailShapes(
  details: readonly Detail[],
  W: number,
  waterTop: number,
  waterFrom: number,
): SceneShape[] {
  const byColor = new Map<string, string>();
  const add = (fill: string, d: string) => byColor.set(fill, (byColor.get(fill) ?? '') + d);
  for (let index = 0; index * 5 < W; index += 1) {
    const h = hash(index + 1);
    const x = index * 5 + (h % 4);
    const y = GROUND + 3 + ((h >>> 3) % (H - GROUND - 4));
    if (y >= waterTop - 1 && x >= waterFrom - 2) continue;
    const detail = details[(h >>> 9) % details.length];
    if (!detail) continue;
    if (detail.kind === 'tuft')
      add(
        detail.color,
        rect(x, y, 3, 1) + rect(x, y - 1, 1, 1) + rect(x + 2, y - 1, 1, 1) + rect(x + 1, y - 2, 1, 1),
      );
    if (detail.kind === 'flower') {
      add(detail.light ?? detail.color, rect(x, y, 1, 1));
      add(detail.color, rect(x, y - 1, 1, 1));
    }
    if (detail.kind === 'pebble') {
      add(detail.color, rect(x, y, 2, 1));
      if (detail.light) add(detail.light, rect(x, y - 1, 1, 1));
    }
    if (detail.kind === 'ripple') add(detail.color, rect(x, y, 4, 1));
    if (detail.kind === 'patch') add(detail.color, rect(x, y, 4, 1) + rect(x + 1, y - 1, 2, 1));
  }
  return [...byColor].map(([fill, d]) => ({ fill, d }));
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

// One sprite as scene shapes, with its top-left corner at (x, y), optionally scaled.
export function spriteAt(art: Art, x: number, y: number, flip?: boolean, scale = 1): SceneShape[] {
  const size = scale === 1 ? '' : ` scale(${flip ? -scale : scale} ${scale})`;
  const transform = flip
    ? `translate(${x + art.w * scale} ${y})${size || ' scale(-1 1)'}`
    : `translate(${x} ${y})${size}`;
  return artPaths(art).map(([fill, d]) => ({ fill, d, transform }));
}

// The tool a working bruh holds, scaled so its longest side is TOOL_SIZE whatever its canvas.
export function toolScale(art: Art): number {
  return Math.round((TOOL_SIZE / Math.max(art.w, art.h)) * 1000) / 1000;
}

// Back to front: sky, sun or moon and stars, clouds, far and near hills, ground and its
// details, water, props, the bruh's shadow, the bruh and its tool.
export function sceneShapes(input: SceneInput): readonly SceneShape[] {
  const look = LOOKS[input.biome];
  const W = input.width ?? SCENE_WIDTH;
  const offset = Math.round((W - SCENE_WIDTH) / 2);
  const night = look.night || input.night;
  const shapes: SceneShape[] = [];
  let y = 0;
  const bands = sky(night);
  bands.forEach(([fill, height], index) => {
    let d = rect(0, y, W, GROUND - y);
    // Teeth of this band hang one row into the next.
    if (index > 0) {
      d = rect(0, y + 1, W, GROUND - y - 1);
      for (let x = 2; x < W; x += 4) d += rect(x, y, 2, 1);
    }
    shapes.push({ fill, d });
    y += height;
  });
  if (night) {
    let stars = '';
    let bright = '';
    for (let index = 0; index * 5 < W; index += 1) {
      const h = hash(index + 101);
      const x = index * 5 + (h % 5);
      const sy = 1 + ((h >>> 4) % 22);
      if (index % 5 === 2) bright += rect(x, sy - 1, 1, 3) + rect(x - 1, sy, 3, 1);
      else stars += rect(x, sy, 1, 1);
    }
    shapes.push({ fill: palette['durian-200'], d: stars });
    shapes.push({ fill: palette['rambutan-50'], d: bright });
    // A crescent moon, lit from the left.
    const mx = offset + 80;
    shapes.push({ fill: palette['mangosteen-700'], d: disc(mx, 8, 5) });
    shapes.push({
      fill: palette['durian-100'],
      d: disc(mx, 8, 4, (dx, dy) => Math.hypot(dx - 2, dy - 1) > 3.4),
    });
    shapes.push({
      fill: palette['durian-300'],
      d: disc(mx, 8, 4, (dx, dy) => Math.hypot(dx - 2, dy - 1) > 3.4 && dx + dy > 0),
    });
  } else {
    // A round sun with a soft ring, a lit core and a shaded lower right.
    const sx = offset + 80;
    shapes.push({ fill: palette['blueberry-100'], d: disc(sx, 8, 6) });
    shapes.push({ fill: palette['durian-400'], d: disc(sx, 8, 4.5) });
    shapes.push({ fill: palette['durian-300'], d: disc(sx, 8, 4.5, (dx, dy) => dx + dy < 1.5) });
    shapes.push({ fill: palette['durian-100'], d: disc(sx - 1, 7, 2, (dx, dy) => dx + dy < 0) });
    let light = '';
    let shade = '';
    for (let index = 0; index * 40 < W; index += 1) {
      const h = hash(index + 7);
      const [l, s] = cloud(index * 40 + (h % 12), 3 + ((h >>> 5) % 10), index % 2 === 0 ? 1 : 0.7);
      light += l;
      shade += s;
    }
    shapes.push({ fill: palette['rambutan-50'], d: light });
    shapes.push({ fill: palette['blueberry-200'], d: shade });
  }
  const far = night ? { ...look.far, color: look.far.night ?? palette['mangosteen-900'] } : look.far;
  shapes.push(...hillShapes(far, W, 3));
  shapes.push(...hillShapes(look.near, W, 0));
  shapes.push({ fill: look.ground[0], d: rect(0, GROUND, W, H - GROUND) });
  shapes.push({ fill: look.lip, d: rect(0, GROUND, W, 1) });
  const water = look.water;
  const waterFrom = water?.from === undefined ? 0 : offset + water.from;
  shapes.push(...detailShapes(look.details, W, water?.top ?? H, waterFrom));
  if (water) {
    // A sloping shore when the water only fills the right of the frame.
    let body = '';
    let shore = '';
    for (let row = water.top; row < H; row += 1) {
      const start = Math.max(0, waterFrom - (row - water.top) * 2);
      body += rect(start, row, W - start, 1);
      if (waterFrom > 0) shore += rect(start, row, 2, 1);
    }
    shapes.push({ fill: water.color, d: body });
    let foam = rect(waterFrom, water.top, W - waterFrom, 1) + shore;
    for (let x = 0; x < W; x += 8) {
      const fx = (x + input.frame * 2) % W;
      const fy = water.top + 2 + ((x / 8) % 3) * 3;
      if (fy < H && fx >= Math.max(0, waterFrom - (fy - water.top) * 2) + 3) foam += rect(fx, fy, 3, 1);
    }
    shapes.push({ fill: water.foam, d: foam });
  }
  for (const prop of look.props)
    shapes.push(...spriteAt(prop.art, offset + prop.x, (prop.y ?? GROUND + 1) - prop.art.h, prop.flip));
  const moving = input.working || input.walking;
  const bob = moving && input.frame % 2 === 1 ? -1 : 0;
  const bruhX = offset + (input.walking ? 26 + ((input.frame * 3) % 12) : 40);
  shapes.push({ fill: 'rgba(10,10,10,0.35)', d: rect(bruhX + 2, GROUND + 3, 12, 2) });
  shapes.push(...spriteAt(bruhArt(input.skin), bruhX, GROUND - 12 + bob));
  const toolArt = input.tool && input.working ? itemArt(input.tool) : undefined;
  if (toolArt) {
    // Held at the bruh's right side, raised and swung back on the odd frames.
    const swing = input.frame % 2 === 1;
    shapes.push(...spriteAt(toolArt, bruhX + 12, GROUND - 13 + (swing ? -2 : 0), swing, toolScale(toolArt)));
  }
  return shapes;
}
