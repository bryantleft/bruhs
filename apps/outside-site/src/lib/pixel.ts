// Server-side SVG for the game's own pixel art. Rendered at build time, so the page ships no
// sprite JavaScript and always matches the app.
import { LOCATIONS } from '@outside/src/game/content.ts';
import { type Art, BUSH, bruhArt, INK, PINE, TREE } from '@outside/src/pixel/art.ts';
import { artPaths } from '@outside/src/pixel/paths.ts';
import {
  SCENE_GROUND,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type SceneInput,
  type SceneShape,
  sceneShapes,
  spriteAt,
} from '@outside/src/pixel/scene.ts';
import { MAP_HEIGHT, MAP_WIDTH, roadPath, terrainPaths, tileCenter } from '@outside/src/pixel/world.ts';
import { palette } from '@outside/src/theme/palette.ts';

// Always declared, so the same markup works inline and as a standalone .svg file or resvg input.
const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';

function escape(value: string): string {
  return value.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function spriteSvg(art: Art, size: number, label?: string): string {
  const role = label ? `role="img" aria-label="${escape(label)}"` : 'aria-hidden="true"';
  const paths = artPaths(art)
    .map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`)
    .join('');
  return `<svg ${XMLNS} ${role} width="${size}" height="${size}" viewBox="0 0 ${art.w} ${art.h}" shape-rendering="crispEdges">${paths}</svg>`;
}

const STILL = { skin: 'original', night: false, frame: 0, working: false, walking: false } as const;

// A scene at any width; the height follows the game's 2:1 frame. `crop` trims sky from the top.
export function sceneSvg(
  input: Partial<SceneInput> & Pick<SceneInput, 'biome'>,
  options: Readonly<{ label?: string; width?: number; crop?: number }> = {},
): string {
  const crop = options.crop ?? 0;
  const viewHeight = SCENE_HEIGHT - crop;
  const size = options.width
    ? `width="${options.width}" height="${Math.round((options.width * viewHeight) / SCENE_WIDTH)}"`
    : 'width="100%"';
  const role = options.label ? `role="img" aria-label="${escape(options.label)}"` : 'aria-hidden="true"';
  const body = shapePaths(sceneShapes({ ...STILL, ...input }));
  return `<svg ${XMLNS} ${role} ${size} viewBox="0 ${crop} ${SCENE_WIDTH} ${viewHeight}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges">${body}</svg>`;
}

const shapePaths = (shapes: readonly SceneShape[]): string =>
  shapes
    .map(
      (shape) =>
        `<path fill="${shape.fill}" d="${shape.d}"${shape.transform ? ` transform="${shape.transform}"` : ''}/>`,
    )
    .join('');

export const HERO_WIDTH = SCENE_WIDTH * 2;
// Sky above this row is drawn by the page, so the hero can grow to fit its copy.
export const HERO_TOP = 16;

type HeroParts = Readonly<{ still: string; hop: readonly [string, string] }>;

// Town on a double-width canvas, edged with trees, as path markup: `still` never changes and
// `hop` holds the bruh's two frames. Shared by the page hero and the link preview image.
export function heroParts(): HeroParts {
  const frame = (index: number) =>
    sceneShapes({ ...STILL, biome: 'town', width: HERO_WIDTH, working: true, frame: index });
  const [first, second] = [frame(0), frame(1)];
  const split = first.findIndex((shape, index) => shape.transform !== second[index]?.transform);
  if (split < 0) throw new Error('heroParts: the two hop frames are identical, so the bruh would not move.');
  const ground = (art: Art, x: number, y = 0, flip = false) =>
    spriteAt(art, x, SCENE_GROUND + 1 + y - art.h, flip);
  const edges = [
    ...ground(PINE, 2, 1),
    ...ground(TREE, 14),
    ...ground(BUSH, 30, 2),
    ...ground(BUSH, 150, 1, true),
    ...ground(TREE, 164, 2, true),
    ...ground(PINE, 180),
  ];
  return {
    still: shapePaths(first.slice(0, split)) + shapePaths(edges),
    hop: [shapePaths(first.slice(split)), shapePaths(second.slice(split))],
  };
}

// The page hero: the bruh hops between its two frames with CSS, and shows frame 0 alone when
// motion is reduced.
export function heroSvg(label: string): string {
  const { still, hop } = heroParts();
  const viewHeight = SCENE_HEIGHT - HERO_TOP;
  return `<svg ${XMLNS} role="img" aria-label="${escape(label)}" class="hero-scene" viewBox="0 ${HERO_TOP} ${HERO_WIDTH} ${viewHeight}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges">${still}<g class="hop hop-0">${hop[0]}</g><g class="hop hop-1">${hop[1]}</g></svg>`;
}

// A pixel cloud, three tones, drawn on a 1-unit grid.
const CLOUD = ['....###.....', '..#######...', '.##########.', '############', '.%%%%%%%%%%.'];
export function cloudSvg(scale: number): string {
  let light = '';
  let shade = '';
  CLOUD.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === '#') light += `M${x} ${y}h1v1h-1z`;
      if (cell === '%') shade += `M${x} ${y}h1v1h-1z`;
    });
  });
  const w = CLOUD[0]?.length ?? 0;
  return `<svg aria-hidden="true" width="${w * scale}" height="${CLOUD.length * scale}" viewBox="0 0 ${w} ${CLOUD.length}" shape-rendering="crispEdges"><path fill="${palette['rambutan-50']}" d="${light}"/><path fill="${palette['blueberry-100']}" d="${shade}"/></svg>`;
}

// A seamless 96-unit stepped skyline, used as a CSS background between page sections. `from`
// fills the top, `to` rises from the bottom; `phase` varies the shape between dividers.
export function ridgeTile(from: string, to: string, phase = 0, height = 6): string {
  let rise = '';
  for (let x = 0; x < SCENE_WIDTH; x += 1) {
    const t = (x / SCENE_WIDTH) * Math.PI * 2;
    const wave = Math.sin(t * 2 + phase) * 0.5 + Math.sin(t * 5 + phase * 2) * 0.3 + Math.sin(t * 9) * 0.2;
    const top = Math.max(0, Math.min(height - 1, Math.round(((wave + 1) / 2) * (height - 1))));
    rise += `M${x} ${top}h1v${height - top}h-1z`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCENE_WIDTH}" height="${height}" viewBox="0 0 ${SCENE_WIDTH} ${height}" shape-rendering="crispEdges"><rect width="${SCENE_WIDTH}" height="${height}" fill="${from}"/><path fill="${to}" d="${rise}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// The app's world map, pinned as the app’s map view draws a new save: the bruh stands in `home`,
// shops are gold, places a new bruh can't reach yet are grey. Each pin carries `pin-<id>` so
// the page can light it up from the place list.
export function worldMapSvg(
  options: Readonly<{ label: string; home: string; locked: ReadonlySet<string> }>,
): string {
  const terrain = terrainPaths()
    .map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`)
    .join('');
  const pins = LOCATIONS.map((place) => {
    const { x, y } = tileCenter(place.id);
    const fill =
      place.id === options.home
        ? palette['pandan-300']
        : options.locked.has(place.id)
          ? palette['rambutan-600']
          : place.store
            ? palette['durian-400']
            : palette['lychee-400'];
    return `<g class="pin pin-${place.id}"><path class="pin-ring" fill="${INK}" d="M${x - 3} ${y - 3}h6v6h-6z"/><path fill="${fill}" d="M${x - 2} ${y - 2}h4v4h-4z"/></g>`;
  }).join('');
  const home = tileCenter(options.home);
  const bruh = artPaths(bruhArt('original'))
    .map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`)
    .join('');
  return `<svg ${XMLNS} role="img" aria-label="${escape(options.label)}" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" shape-rendering="crispEdges">${terrain}<path fill="${palette['durian-200']}" d="${roadPath()}"/>${pins}<g transform="translate(${home.x - 5} ${home.y - 13}) scale(0.625)">${bruh}</g></svg>`;
}
