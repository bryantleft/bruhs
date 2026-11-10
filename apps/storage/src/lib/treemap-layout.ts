/**
 * Where every block of the disk map goes, and what it says. Pure geometry: the canvas
 * component draws the result, and tests check it without a browser.
 *
 * The map shows three levels below the current folder. The top two levels are drawn as
 * containers with a header strip, so the hierarchy reads; the third level is drawn as
 * blocks, and a double-click opens any of them. Siblings too small for a legible block are
 * merged into one "N smaller items" group, so the map never dissolves into confetti.
 */

import { type HierarchyRectangularNode, treemapSquarify } from "d3-hierarchy";
import {
  endTruncate,
  graphemeLength,
  middleTruncate,
} from "./display-names.ts";
import {
  CATEGORY_VAR,
  type Category,
  categoryForName,
  formatBytes,
} from "./format.ts";
import type {
  AggregateNode,
  DirNode,
  FileNode,
  TreeNode,
  UnreadableNode,
  VolumeNode,
} from "./types.ts";

/**
 * A file kind, "grouped" (small items the scanner folded together without listing them) or
 * "volume" (another volume on the same disk, which the scan measured but didn't enter).
 */
export type Kind = Category | "grouped" | "volume";
export type KindBytes = Readonly<Record<Kind, number>>;

/** Every file kind, in CATEGORY_VAR's order, which names a colour for each. */
export const CATEGORIES = Object.keys(CATEGORY_VAR) as readonly Category[];
export const KINDS: readonly Kind[] = [...CATEGORIES, "grouped", "volume"];

/** Tiles leave this gap on their right and bottom edges, so neighbours stay apart. */
export const GAP = 1;

/**
 * The smallest block the map draws on its own, in CSS pixels, gap excluded; smaller
 * siblings merge into the group. At 8 px a block keeps 6 px of fill inside a folder's 1 px
 * outline, enough for a stroke of the group hatching. Measured on a 776×560 map (Disk in
 * a 1100×760 window), blocks drawn and those under 6 px, which show neither fill nor
 * outline: the bruhs repository (8,703 scanned nodes) gives 415/199 at 2 px, 300/83 at
 * 4 px and 159/4 at 8 px; a 664 GB home folder gives 346/161, 258/62 and 164/14. What
 * stays under 6 px is groups and lone small items, which can't merge any further.
 */
export const MIN_TILE = 8;

/**
 * Header strip height by depth: folders one and two levels down are containers with an
 * 11 px label and some air; anything deeper is drawn as a block.
 */
const HEADER_BY_DEPTH: readonly number[] = [0, 18, 16];

/** A container's 1 px outline, inside which its contents keep their own gap. */
const OUTLINE = 1;

interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

interface TileBase extends Box {
  /** 1 for the current folder's own items. */
  readonly depth: number;
}

/** A folder drawn as a container: a header strip with its name, then its contents. */
export interface FolderTile extends TileBase {
  readonly kind: "folder";
  readonly node: DirNode;
  readonly header: number;
  readonly children: readonly Tile[];
}

/** A folder drawn as one block, coloured by the kind it holds most of. */
export interface CollapsedTile extends TileBase {
  readonly kind: "collapsed";
  readonly node: DirNode;
  readonly category: Category;
}

export interface FileTile extends TileBase {
  readonly kind: "file";
  readonly node: FileNode;
  readonly category: Category;
}

/** Another volume on the scanned disk, such as the startup disk's Preboot: one block, never opened. */
export interface VolumeTile extends TileBase {
  readonly kind: "volume";
  readonly node: VolumeNode;
}

/**
 * Siblings too small to draw, merged into one block. `partial` means it includes the
 * scanner's own grouped items, whose count the scan doesn't report.
 */
export interface GroupTile extends TileBase {
  readonly kind: "group";
  readonly parent: DirNode;
  readonly size: number;
  readonly count: number;
  readonly partial: boolean;
}

export type Tile =
  | FolderTile
  | CollapsedTile
  | FileTile
  | VolumeTile
  | GroupTile;

export interface TreemapLayout {
  readonly root: DirNode;
  readonly width: number;
  readonly height: number;
  /** The current folder's own items; folders hold theirs in `children`. */
  readonly tiles: readonly Tile[];
}

function emptyKindBytes(): Record<Kind, number> {
  const bytes = {} as Record<Kind, number>;
  for (const kind of KINDS) bytes[kind] = 0;
  return bytes;
}

/** Bytes per kind for `root` and every folder inside it, in one pass. */
export function kindBytesByFolder(
  root: DirNode,
): ReadonlyMap<DirNode, KindBytes> {
  const byFolder = new Map<DirNode, KindBytes>();
  const visit = (folder: DirNode): KindBytes => {
    const bytes = emptyKindBytes();
    for (const child of folder.children) {
      if (child.kind === "file") {
        bytes[categoryForName(child.name)] += child.size;
      } else if (child.kind === "aggregate") {
        // The scanner tallies a group's bytes by kind; whatever it doesn't name stays "grouped".
        let named = 0;
        for (const category of CATEGORIES) {
          const value = child.kinds?.[category] ?? 0;
          bytes[category] += value;
          named += value;
        }
        bytes.grouped += Math.max(0, child.size - named);
      } else if (child.kind === "volume") {
        bytes.volume += child.size;
      } else if (child.kind === "dir") {
        const inner = visit(child);
        for (const kind of KINDS) bytes[kind] += inner[kind];
      }
    }
    byFolder.set(folder, bytes);
    return bytes;
  };
  visit(root);
  return byFolder;
}

/** The kind with the most bytes among listed files; unlisted groups don't count. */
export function dominantCategory(bytes: KindBytes): Category {
  let best: Category = "other";
  for (const category of CATEGORIES) {
    if (bytes[category] > bytes[best]) best = category;
  }
  return best;
}

/**
 * d3's squarify reads only `value` and `children` and writes x0…y1, so plain cells stand
 * in for hierarchy nodes. Edges then snap to whole pixels; neighbours share an edge
 * value, so they snap to the same pixel and never overlap or leave a seam.
 */
function squarify(values: readonly number[], box: Box): Box[] {
  const cells = values.map((value) => ({ value, x0: 0, y0: 0, x1: 0, y1: 0 }));
  const total = values.reduce((sum, value) => sum + value, 0);
  const parent = { value: total, children: cells };
  treemapSquarify(
    parent as unknown as HierarchyRectangularNode<unknown>,
    box.x0,
    box.y0,
    box.x1,
    box.y1,
  );
  return cells.map((cell) => ({
    x0: Math.round(cell.x0),
    y0: Math.round(cell.y0),
    x1: Math.round(cell.x1),
    y1: Math.round(cell.y1),
  }));
}

const isThin = (box: Box) =>
  box.x1 - box.x0 - GAP < MIN_TILE || box.y1 - box.y0 - GAP < MIN_TILE;
const isEmpty = (box: Box) => box.x1 <= box.x0 || box.y1 <= box.y0;

/** What the map draws as its own block: files, folders and volumes. Unreadable folders have no size to draw. */
type Item = Exclude<TreeNode, AggregateNode | UnreadableNode>;
const isItem = (node: TreeNode): node is Item =>
  node.kind !== "aggregate" && node.kind !== "unreadable";

/** Lay out `folder`'s items in `box`, merging the ones too small to draw on their own. */
function layoutItems(
  folder: DirNode,
  box: Box,
  depth: number,
  kinds: ReadonlyMap<DirNode, KindBytes>,
  order: SiblingOrder | undefined,
): Tile[] {
  const items = folder.children
    .filter((child) => child.size > 0)
    .sort((a, b) => b.size - a.size);
  const total = items.reduce((sum, item) => sum + item.size, 0);
  const area = (box.x1 - box.x0) * (box.y1 - box.y0);
  if (total === 0 || isEmpty(box)) return [];

  // An item needs the area of a minimum block (with its gap) to be drawn on its own.
  const minBytes = ((MIN_TILE + GAP) ** 2 / area) * total;
  let shown = items.filter(isItem).filter((item) => item.size >= minBytes);
  const places = order?.get(folder.path);
  if (places) shown = keepPlaces(shown, places, area / total);
  let boxes: Box[];
  // Squarify can still squeeze an item into a sliver; merge those too and lay out again.
  // Each pass shows fewer items, so this ends.
  for (;;) {
    const hidden = total - shown.reduce((sum, item) => sum + item.size, 0);
    const values = shown.map((item) => item.size);
    boxes = squarify(hidden > 0 ? [...values, hidden] : values, box);
    const kept = shown.filter((_, i) => !isThin(boxes[i]));
    if (kept.length === shown.length) break;
    shown = kept;
  }

  const tiles: Tile[] = shown.map((item, i) =>
    tileFor(item, boxes[i], depth, kinds, order),
  );
  const drawn = new Set<TreeNode>(shown);
  const rest = items.filter((item) => !drawn.has(item));
  const restBox = boxes[shown.length];
  if (rest.length > 0 && restBox && !isEmpty(restBox)) {
    const real = rest.filter(isItem);
    tiles.push(
      rest.length === 1 && real.length === 1
        ? tileFor(real[0], restBox, depth, kinds, order)
        : {
            kind: "group",
            parent: folder,
            size: rest.reduce((sum, item) => sum + item.size, 0),
            count: real.length,
            partial: real.length < rest.length,
            depth,
            ...restBox,
          },
    );
  }
  return tiles.filter((tile) => !isEmpty(tile));
}

function tileFor(
  item: Item,
  box: Box,
  depth: number,
  kinds: ReadonlyMap<DirNode, KindBytes>,
  order: SiblingOrder | undefined,
): Tile {
  if (item.kind === "file") {
    return {
      kind: "file",
      node: item,
      category: categoryForName(item.name),
      depth,
      ...box,
    };
  }
  if (item.kind === "volume")
    return { kind: "volume", node: item, depth, ...box };
  const header = HEADER_BY_DEPTH[depth] ?? 0;
  const content = {
    x0: box.x0 + OUTLINE + GAP,
    y0: box.y0 + header,
    x1: box.x1 - GAP - OUTLINE,
    y1: box.y1 - GAP - OUTLINE,
  };
  // A container is worth drawing when its contents can hold more than one block each way;
  // otherwise one labelled block says more.
  const roomy =
    content.x1 - content.x0 >= 2 * MIN_TILE &&
    content.y1 - content.y0 >= 2 * MIN_TILE;
  if (header > 0 && roomy) {
    const children = layoutItems(item, content, depth + 1, kinds, order);
    if (children.length > 0) {
      return { kind: "folder", node: item, header, children, depth, ...box };
    }
  }
  const bytes = kinds.get(item);
  if (!bytes) {
    throw new Error(
      `The kind totals don't cover ${item.path}; build them with kindBytesByFolder from the map's own folder.`,
    );
  }
  return {
    kind: "collapsed",
    node: item,
    category: dominantCategory(bytes),
    depth,
    ...box,
  };
}

/**
 * Lay out `root`'s contents to fill `width` × `height` CSS pixels. Given `order`, the places the shown layout of the
 * same folder gave its items, a newer map keeps them there unless the change in size is visible (`keepPlaces`), so
 * squarify's rows don't flip over a few bytes. Without it, items go largest first.
 */
export function layoutTreemap(
  root: DirNode,
  width: number,
  height: number,
  kinds: ReadonlyMap<DirNode, KindBytes>,
  order?: SiblingOrder,
): TreemapLayout {
  const box = { x0: 0, y0: 0, x1: Math.floor(width), y1: Math.floor(height) };
  return {
    root,
    width,
    height,
    tiles: layoutItems(root, box, 1, kinds, order),
  };
}

/** Where a layout placed each folder's items, by the folder's path, then each item's: 0 for the first. */
export type SiblingOrder = ReadonlyMap<string, ReadonlyMap<string, number>>;

/** The places `layout` gave the items of each folder it shows, the group of smaller items aside. */
export function siblingOrder(layout: TreemapLayout): SiblingOrder {
  const order = new Map<string, ReadonlyMap<string, number>>();
  const visit = (folder: string, tiles: readonly Tile[]) => {
    const places = new Map<string, number>();
    for (const tile of tiles) {
      if (tile.kind === "group") continue;
      places.set(tile.node.path, places.size);
      if (tile.kind === "folder") visit(tile.node.path, tile.children);
    }
    order.set(folder, places);
  };
  visit(layout.root.path, layout.tiles);
  return order;
}

/**
 * `items`, largest first, put back in the places they had, as long as the map can't show that their sizes changed
 * order. Edges snap to whole pixels, so blocks whose sides differ by less than a pixel can come out the same size,
 * and a pixel more of side is the smallest difference the map can draw. Squarify keeps blocks near square, so an item
 * gets about √(bytes × `pxPerByte`) px on a side, and it goes ahead of an item placed before it once its side is a
 * pixel longer. In a 100 × 100 px box of 10,000 bytes, 5,071 bytes overtake 4,929 (71.21 px of side against 70.21),
 * while 5,070 don't overtake 4,930 (71.20 against 70.21). Items without a place, new on the map, start after the
 * rest, largest first, and move ahead the same way. Each item goes before the first item it's visibly bigger than,
 * so none stays behind one it's visibly bigger than.
 */
function keepPlaces(
  items: readonly Item[],
  places: ReadonlyMap<string, number>,
  pxPerByte: number,
): Item[] {
  const placed = items
    .map((item) => ({
      item,
      side: Math.sqrt(item.size * pxPerByte),
      place: places.get(item.path) ?? places.size,
    }))
    .sort((a, b) => a.place - b.place);
  const kept: typeof placed = [];
  // The shortest side so far: an item not a pixel longer than it is visibly bigger than nothing before it.
  let shortest = Number.POSITIVE_INFINITY;
  for (const entry of placed) {
    if (entry.side < shortest + 1) {
      kept.push(entry);
      shortest = Math.min(shortest, entry.side);
    } else {
      const ahead = kept.findIndex((other) => entry.side >= other.side + 1);
      kept.splice(ahead, 0, entry);
    }
  }
  return kept.map((entry) => entry.item);
}

/**
 * Whether `next` draws just what `shown` does, so the page can keep `shown` and draw nothing: the same folder at the
 * same size, and every tile, header strip and label in the same box, of the same kind and colour, with the same name
 * and the same size to print. Boxes are whole CSS pixels and the two draw at the same pixel ratio, so the same box
 * covers the same device pixels. Sizes count as they print whether or not a label has room for one, so the hover card
 * of a layout kept never shows a size the map has moved past.
 */
export function drawsTheSame(
  shown: TreemapLayout,
  next: TreemapLayout,
): boolean {
  return (
    shown.root.path === next.root.path &&
    shown.width === next.width &&
    shown.height === next.height &&
    sameTiles(shown.tiles, next.tiles)
  );
}

function sameTiles(a: readonly Tile[], b: readonly Tile[]): boolean {
  return a.length === b.length && a.every((tile, i) => sameTile(tile, b[i]));
}

/** Most sizes don't change from one map to the next, so most need no printing. */
const printSame = (a: number, b: number) =>
  a === b || formatBytes(a) === formatBytes(b);

/** A file's colour comes from its name, a folder block's from what it holds; other kinds have one colour each. */
const fillOf = (tile: Tile) =>
  tile.kind === "file" || tile.kind === "collapsed" ? tile.category : null;

function sameTile(a: Tile, b: Tile): boolean {
  const named =
    a.kind === "group"
      ? b.kind === "group" && a.count === b.count && a.partial === b.partial
      : b.kind !== "group" && a.node.name === b.node.name;
  return (
    a.kind === b.kind &&
    a.x0 === b.x0 &&
    a.y0 === b.y0 &&
    a.x1 === b.x1 &&
    a.y1 === b.y1 &&
    named &&
    fillOf(a) === fillOf(b) &&
    printSame(tileSize(a), tileSize(b)) &&
    (a.kind !== "folder" ||
      (b.kind === "folder" && sameTiles(a.children, b.children)))
  );
}

const contains = (tile: Box, x: number, y: number) =>
  x >= tile.x0 && x < tile.x1 && y >= tile.y0 && y < tile.y1;

/** The tiles under a point, outermost first. A folder's header, or a gap in it, ends at the folder. */
function tilesAt(layout: TreemapLayout, x: number, y: number): Tile[] {
  const chain: Tile[] = [];
  let tiles = layout.tiles;
  for (;;) {
    const hit = tiles.find((tile) => contains(tile, x, y));
    if (!hit) return chain;
    chain.push(hit);
    if (hit.kind !== "folder" || y < hit.y0 + hit.header) return chain;
    tiles = hit.children;
  }
}

/** The deepest tile under a point. */
export function tileAt(
  layout: TreemapLayout,
  x: number,
  y: number,
): Tile | null {
  return tilesAt(layout, x, y).at(-1) ?? null;
}

/**
 * The folder a double-click at a point opens: the folder block or header under it, or the
 * folder holding the block under it. Null for the map's own items, whose folder is open.
 */
export function folderToOpenAt(
  layout: TreemapLayout,
  x: number,
  y: number,
): DirNode | null {
  const folders = tilesAt(layout, x, y).filter(
    (tile) => tile.kind === "folder" || tile.kind === "collapsed",
  );
  return folders.at(-1)?.node ?? null;
}

/**
 * The tile that shows `path`: its own, or the one that holds it (a folder drawn as one
 * block, or the group of small items). Null outside the map or for the map's own folder.
 */
export function tileForPath(layout: TreemapLayout, path: string): Tile | null {
  const root = layout.root.path;
  const inside = root === "/" ? path.length > 1 : path.startsWith(`${root}/`);
  if (!path.startsWith("/") || !inside) return null;
  let tiles = layout.tiles;
  let container: FolderTile | null = null;
  for (;;) {
    const match = tiles.find(
      (tile) =>
        tile.kind !== "group" &&
        (tile.node.path === path || path.startsWith(`${tile.node.path}/`)),
    );
    if (!match) {
      // Not drawn on its own here, so it's one of the small items merged at this level.
      return tiles.find((tile) => tile.kind === "group") ?? container;
    }
    if (match.kind !== "folder" || match.node.path === path) return match;
    container = match;
    tiles = match.children;
  }
}

/** Bytes a tile stands for. */
export function tileSize(tile: Tile): number {
  return tile.kind === "group" ? tile.size : tile.node.size;
}

/** "253", or "253+" when the group also holds the scanner's uncounted items. */
const groupCount = (tile: GroupTile) =>
  `${tile.count.toLocaleString("en-US")}${tile.partial ? "+" : ""}`;

export function groupName(tile: GroupTile): string {
  return tile.count > 0 ? `${groupCount(tile)} smaller items` : "Smaller items";
}

/** The name a block stands for. Folders end in "/" so they read as folders without colour. */
export function tileName(tile: Tile): string {
  if (tile.kind === "group") return groupName(tile);
  return tile.kind === "file" || tile.kind === "volume"
    ? tile.node.name
    : `${tile.node.name}/`;
}

/** Text metrics for labels, measured from the canvas font. */
export interface LabelMetrics {
  /** Advance of one character; Monaspace is monospaced. */
  readonly charWidth: number;
  readonly lineHeight: number;
  readonly padX: number;
  readonly padY: number;
}

export interface TileLabel {
  readonly name: string;
  /** Null when only the name fits. */
  readonly size: string | null;
  readonly lines: 1 | 2;
}

/** A cut name keeps at least this many of its own characters; fewer can't be recognised. */
const MIN_KEPT = 4;

/**
 * A tile's name in at most `maxChars`, or null when cutting it would leave it unrecognisable.
 * Files are cut in the middle so the extension stays; folders keep their start, which tells
 * them apart; groups shorten to "253+ items" instead.
 */
function fitName(tile: Tile, maxChars: number): string | null {
  if (tile.kind === "group") {
    const short = tile.count > 0 ? `${groupCount(tile)} items` : null;
    for (const name of [groupName(tile), short]) {
      if (name !== null && graphemeLength(name) <= maxChars) return name;
    }
    return null;
  }
  if (tile.kind === "file" || tile.kind === "volume") {
    if (graphemeLength(tile.node.name) <= maxChars) return tile.node.name;
    return maxChars - 1 >= MIN_KEPT
      ? middleTruncate(tile.node.name, maxChars)
      : null;
  }
  // A folder header is a folder by its place; a folder block says so with "/".
  const slash = tile.kind === "collapsed" ? "/" : "";
  const room = maxChars - slash.length;
  if (graphemeLength(tile.node.name) <= room) return tile.node.name + slash;
  return room - 1 >= MIN_KEPT
    ? endTruncate(tile.node.name, room) + slash
    : null;
}

/** Name and size side by side when both fit, cutting the name first; otherwise the name. */
function oneLine(tile: Tile, size: string, maxChars: number) {
  const beside = fitName(tile, maxChars - size.length - 1);
  if (beside !== null) return { name: beside, size };
  const name = fitName(tile, maxChars);
  return name === null ? null : { name, size: null };
}

const innerWidth = (tile: Tile, metrics: LabelMetrics) =>
  tile.x1 - tile.x0 - GAP - 2 * metrics.padX;

/** What fits inside a block, or null when nothing legible does. */
export function tileLabel(
  tile: Exclude<Tile, FolderTile>,
  metrics: LabelMetrics,
): TileLabel | null {
  const maxChars = Math.floor(innerWidth(tile, metrics) / metrics.charWidth);
  const height = tile.y1 - tile.y0 - GAP - 2 * metrics.padY;
  if (height < metrics.lineHeight) return null;
  const size = formatBytes(tileSize(tile));
  if (height >= 2 * metrics.lineHeight) {
    const name = fitName(tile, maxChars);
    if (name === null) return null;
    return { name, size: size.length <= maxChars ? size : null, lines: 2 };
  }
  const line = oneLine(tile, size, maxChars);
  return line && { ...line, lines: 1 };
}

/** What fits in a folder's header strip, or null. */
export function headerLabel(
  tile: FolderTile,
  metrics: LabelMetrics,
): { name: string; size: string | null } | null {
  const maxChars = Math.floor(innerWidth(tile, metrics) / metrics.charWidth);
  return oneLine(tile, formatBytes(tile.node.size), maxChars);
}
