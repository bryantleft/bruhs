/**
 * The marks at the start of the disk map's labels: macOS's icons on header strips and on package, volume and folder
 * blocks, which a host such as Pith's page loads as the map shows them, and each kind's glyph on file blocks, which
 * the map draws itself while Differentiate Without Color is on. The layout keeps their room (`Tile.slot`), so a mark
 * that comes late, or never, never moves a label. Nothing here needs React.
 */

import type { Category } from "../lib/format.ts";
import { GLYPH_BOX, KIND_GLYPHS } from "../lib/kind-glyphs.ts";
import {
  type LabelMetrics,
  markPlace,
  type Tile,
} from "../lib/treemap-layout.ts";

/** macOS's icons for the map, for a host that has them: Pith's page loads them from its own scheme into its cache. */
export interface MapIcons {
  /** Where `tile`'s icon is, `points` CSS pixels across for a canvas at `ratio` pixels each, or null for none. */
  url(tile: Tile, points: number, ratio: number): string | null;
  /** The icon at `url` once it has loaded, which counts as showing it. */
  image(url: string): CanvasImageSource | null;
  /** Whether loading `url`'s icon failed, as when the route refused it: its room stays empty, and nothing waits for it. */
  failed(url: string): boolean;
  /** Loads `url`'s icon, unless it's loading, loaded or failed already. */
  request(url: string): void;
  /** Calls `listener` whenever an icon loads or fails; what it returns stops that. */
  subscribe(listener: () => void): () => void;
}

/** An icon a paint kept room for before it had loaded: where it goes, and the alpha its block was drawn at. */
export interface WaitingIcon {
  readonly url: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly alpha: number;
}

/** What drawing an icon needs of a canvas. */
type IconContext = Pick<CanvasRenderingContext2D, "drawImage" | "globalAlpha">;

/**
 * The icons of one paint of the map, for a canvas at `ratio` pixels per CSS pixel. `draw` paints an icon that has
 * loaded at once, from the cache, and keeps one that hasn't for later, unless it failed; `done` then asks once for
 * each icon the paint found missing, however many blocks share it, and says which wait.
 */
export function iconPaint(icons: MapIcons, ratio: number) {
  const waiting: WaitingIcon[] = [];
  const missing = new Set<string>();
  return {
    draw(context: IconContext, tile: Tile, x: number, y: number, size: number) {
      const url = icons.url(tile, size, ratio);
      if (url === null) return;
      const image = icons.image(url);
      if (image !== null) {
        context.drawImage(image, x, y, size, size);
        return;
      }
      // A refused icon stays refused until Pith's rule changes, which paints the map again.
      if (icons.failed(url)) return;
      waiting.push({ url, x, y, size, alpha: context.globalAlpha });
      missing.add(url);
    },
    done(): readonly WaitingIcon[] {
      for (const url of missing) icons.request(url);
      return waiting;
    },
  };
}

/** Animation frames: the browser's, or a test's. */
export interface Frames {
  request(run: () => void): number;
  cancel(id: number): void;
}

export const browserFrames: Frames = {
  request: (run) => requestAnimationFrame(run),
  cancel: (id) => cancelAnimationFrame(id),
};

/**
 * Paints the icons in `waiting` with `paint` as they arrive: once on the next frame for every icon that arrived
 * before it, so many icons coming at once cost one paint. An icon that fails keeps its room empty and is waited for no
 * more. It stops once every icon has come or failed, or when what it returns is called, as the map paints again.
 */
export function iconArrivals(
  waiting: readonly WaitingIcon[],
  icons: MapIcons,
  frames: Frames,
  paint: (icon: WaitingIcon, image: CanvasImageSource) => void,
): () => void {
  let left = waiting;
  let frame: number | null = null;
  let unsubscribe: (() => void) | null = null;
  const stop = () => {
    unsubscribe?.();
    unsubscribe = null;
    if (frame !== null) frames.cancel(frame);
    frame = null;
  };
  const paintArrived = () => {
    frame = null;
    const still: WaitingIcon[] = [];
    for (const icon of left) {
      const image = icons.image(icon.url);
      if (image !== null) paint(icon, image);
      else if (!icons.failed(icon.url)) still.push(icon);
    }
    left = still;
    if (left.length === 0) stop();
  };
  if (left.length > 0) {
    unsubscribe = icons.subscribe(() => {
      if (frame === null) frame = frames.request(paintArrived);
    });
  }
  return stop;
}

/**
 * Paints an icon that came after the map was drawn into the room the map kept for it, at its block's alpha, on a
 * canvas at `ratio` pixels per CSS pixel: nothing else is drawn there, so it looks as a paint with the icon would.
 */
export function paintArrived(
  canvas: HTMLCanvasElement,
  ratio: number,
  icon: WaitingIcon,
  image: CanvasImageSource,
): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.save();
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.globalAlpha = icon.alpha;
  context.drawImage(image, icon.x, icon.y, icon.size, icon.size);
  context.restore();
}

/**
 * Draws `tile`'s mark, if its layout kept room for one, at the start of its first label line (`markPlace`): a file's
 * kind glyph in its label's `ink`, or any other tile's icon, which `icons` draws from the page's cache or keeps
 * waiting for. A host without icons draws only glyphs.
 */
export function drawMark(
  context: CanvasRenderingContext2D,
  tile: Tile,
  metrics: LabelMetrics,
  icons: ReturnType<typeof iconPaint> | null,
  ink: string,
): void {
  const place = markPlace(tile, metrics);
  if (place === null) return;
  if (tile.kind === "file") {
    drawGlyph(context, tile.category, place.x, place.y, place.size, ink);
  } else {
    icons?.draw(context, tile, place.x, place.y, place.size);
  }
}

/** Each kind's glyph as canvas paths, made once each, when first drawn. */
const glyphPaths = new Map<Category, readonly [Path2D, CanvasFillRule][]>();

/** Draws `category`'s glyph, `size` CSS pixels across at `x`, `y`, in `color`. */
export function drawGlyph(
  context: CanvasRenderingContext2D,
  category: Category,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  let paths = glyphPaths.get(category);
  if (paths === undefined) {
    paths = KIND_GLYPHS[category].map(({ d, evenOdd }) => [
      new Path2D(d),
      evenOdd ? "evenodd" : "nonzero",
    ]);
    glyphPaths.set(category, paths);
  }
  context.save();
  context.translate(x, y);
  context.scale(size / GLYPH_BOX, size / GLYPH_BOX);
  context.fillStyle = color;
  for (const [path, rule] of paths) context.fill(path, rule);
  context.restore();
}
