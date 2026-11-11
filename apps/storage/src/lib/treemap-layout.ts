/**
 * Where every block of the disk map goes, and what it says. Pure geometry: the canvas
 * component draws the result, and tests check it without a browser.
 *
 * The map shows three levels below the current folder. The top two levels are drawn as
 * containers with a header strip, so the hierarchy reads; the third level is drawn as
 * blocks, and a double-click opens any of them. Siblings too small for a legible block are
 * merged into one "N smaller items" group, so the map never dissolves into confetti. A
 * package, such as an app, is one block at any level, as Finder shows it as one item. A
 * host that knows how much of a whole volume's used space the scan couldn't measure, as
 * Pith's page does, has it drawn as one "Not measured" block at the root.
 */

import { type HierarchyRectangularNode, treemapSquarify } from "d3-hierarchy";
import {
  CATEGORY_VAR,
  type Category,
  categoryForName,
  isPackageName,
} from "./format.ts";
import { keepPlaces } from "./treemap-compare.ts";
import {
  glyphMark,
  headerMark,
  headerPadlock,
  iconMark,
  type LabelMarks,
  type LabelMetrics,
} from "./treemap-marks.ts";
import {
  type Box,
  type FileTile,
  type FolderTile,
  GAP,
  isFolderLike,
  nodeOf,
  type Tile,
  tileSize,
} from "./treemap-tiles.ts";
import type {
  AggregateNode,
  DirNode,
  TreeNode,
  UnreadableNode,
} from "./types.ts";

// The tiles, their labels and marks, and the comparison of a newer layout with the one shown have modules of their
// own beside this one. The storage app and Pith's page import them from here, as before.
export { drawsTheSame } from "./treemap-compare.ts";
export {
  headerLabel,
  type LabelMarks,
  type LabelMetrics,
  labelMetricsOf,
  labelMiddle,
  markPlace,
  markRoom,
  PADLOCK,
  padlockRoom,
  type TileLabel,
  tileLabel,
} from "./treemap-marks.ts";
export {
  type CollapsedTile,
  type FileTile,
  type FolderTile,
  GAP,
  type GroupTile,
  groupName,
  type ItemTile,
  isFolderLike,
  isItemTile,
  NOT_MEASURED,
  nodeOf,
  type PackageTile,
  type Tile,
  tileName,
  tileSize,
  type UnmeasuredTile,
  unreadableCount,
  type VolumeTile,
} from "./treemap-tiles.ts";

/**
 * A file kind, "grouped" (small items the scanner folded together without listing them) or
 * "volume" (another volume on the same disk, which the scan measured but didn't enter).
 */
export type Kind = Category | "grouped" | "volume";
export type KindBytes = Readonly<Record<Kind, number>>;

/** Every file kind, in CATEGORY_VAR's order, which names a colour for each. */
export const CATEGORIES = Object.keys(CATEGORY_VAR) as readonly Category[];
export const KINDS: readonly Kind[] = [...CATEGORIES, "grouped", "volume"];

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

/**
 * A whole volume's used space as a host accounts for it, as "Where the space is" does in Pith: `unmeasured`, what the
 * scan couldn't measure, and `used`, all the volume's used space, its "Used on this disk".
 */
export interface UsedSpace {
  readonly unmeasured: number;
  readonly used: number;
}

export interface TreemapLayout {
  readonly root: DirNode;
  readonly width: number;
  readonly height: number;
  /**
   * The volume's used space, when the host gave it with some not measured: the root's Not measured block stands for
   * `unmeasured`, and the root's shares are shares of `used`.
   */
  readonly usedSpace?: UsedSpace;
  /**
   * The labels' metrics it was laid out with, its marks' (`LabelMarks`), by which it kept their room: its labels are
   * cut with them too, whatever the host's are by the time it's drawn (`labelMetricsOf`). None when it keeps no room
   * for marks.
   */
  readonly metrics?: LabelMetrics;
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

/** The Not measured block among the root's items while they're laid out: its bytes, and where its place is kept. */
interface UnmeasuredItem {
  readonly kind: "unmeasured";
  readonly path: typeof UNMEASURED_PLACE;
  readonly size: number;
}

/** What the Not measured block's place among the root's items is kept by (`SiblingOrder`): no item's path is empty. */
const UNMEASURED_PLACE = "";

/** What a folder's layout gives a block of its own: its items, and at the root the Not measured block. */
export type Laid = Item | UnmeasuredItem;

/**
 * Lay out `folder`'s items in `box`, merging the ones too small to draw on their own. At the map's root, `unmeasured`
 * bytes the scan couldn't measure take a block among them, too small to draw unless they'd have one on their own.
 */
function layoutItems(
  folder: DirNode,
  box: Box,
  depth: number,
  kinds: ReadonlyMap<DirNode, KindBytes>,
  order: SiblingOrder | undefined,
  marks: LabelMarks | undefined,
  unmeasured = 0,
): Tile[] {
  const items = folder.children
    .filter((child) => child.size > 0)
    .sort((a, b) => b.size - a.size);
  const listed = items.reduce((sum, item) => sum + item.size, 0);
  const total = listed + unmeasured;
  const area = (box.x1 - box.x0) * (box.y1 - box.y0);
  if (total === 0 || isEmpty(box)) return [];

  // An item needs the area of a minimum block (with its gap) to be drawn on its own.
  const minBytes = ((MIN_TILE + GAP) ** 2 / area) * total;
  let shown: Laid[] = items
    .filter(isItem)
    .filter((item) => item.size >= minBytes);
  if (unmeasured > 0 && unmeasured >= minBytes) {
    const block: UnmeasuredItem = {
      kind: "unmeasured",
      path: UNMEASURED_PLACE,
      size: unmeasured,
    };
    // Array.prototype.sort is stable, so an item as big keeps its place ahead of the block.
    shown = [...shown, block].sort((a, b) => b.size - a.size);
  }
  const places = order?.get(folder.path);
  if (places) shown = keepPlaces(shown, places, area / total);
  let boxes: Box[];
  // Squarify can still squeeze an item into a sliver; merge those too and lay out again.
  // Each pass shows fewer items, so this ends. A block too thin for Not measured is left out, not merged: the group
  // holds items.
  for (;;) {
    const hidden =
      listed -
      shown.reduce(
        (sum, item) => sum + (item.kind === "unmeasured" ? 0 : item.size),
        0,
      );
    const values = shown.map((item) => item.size);
    boxes = squarify(hidden > 0 ? [...values, hidden] : values, box);
    const kept = shown.filter((_, i) => !isThin(boxes[i]));
    if (kept.length === shown.length) break;
    shown = kept;
  }

  const tiles: Tile[] = shown.map((item, i) =>
    tileFor(item, boxes[i], depth, kinds, order, marks),
  );
  const drawn = new Set<TreeNode | UnmeasuredItem>(shown);
  const rest = items.filter((item) => !drawn.has(item));
  const restBox = boxes[shown.length];
  if (rest.length > 0 && restBox && !isEmpty(restBox)) {
    const real = rest.filter(isItem);
    tiles.push(
      rest.length === 1 && real.length === 1
        ? tileFor(real[0], restBox, depth, kinds, order, marks)
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

/** What `folder` holds, by kind. */
function kindsOf(
  folder: DirNode,
  kinds: ReadonlyMap<DirNode, KindBytes>,
): KindBytes {
  const bytes = kinds.get(folder);
  if (!bytes) {
    throw new Error(
      `The kind totals don't cover ${folder.path}; build them with kindBytesByFolder from the map's own folder.`,
    );
  }
  return bytes;
}

function tileFor(
  item: Laid,
  box: Box,
  depth: number,
  kinds: ReadonlyMap<DirNode, KindBytes>,
  order: SiblingOrder | undefined,
  marks: LabelMarks | undefined,
): Tile {
  // No icon and no glyph: it's no item on the disk.
  if (item.kind === "unmeasured") {
    return { kind: "unmeasured", size: item.size, depth, ...box };
  }
  if (item.kind === "file") {
    const tile: FileTile = {
      kind: "file",
      node: item,
      category: categoryForName(item.name),
      depth,
      ...box,
    };
    return { ...tile, ...glyphMark(tile, marks) };
  }
  if (item.kind === "volume")
    return {
      kind: "volume",
      node: item,
      depth,
      ...box,
      ...iconMark(box, false, marks),
    };
  if (isPackageName(item.name)) {
    // One thing, as Finder shows it, so its contents wait until it's opened.
    const named = categoryForName(item.name);
    return {
      kind: "package",
      node: item,
      category:
        named === "other" ? dominantCategory(kindsOf(item, kinds)) : named,
      kindFrom: named === "other" ? "contents" : "name",
      depth,
      ...box,
      ...iconMark(box, false, marks),
    };
  }
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
    const children = layoutItems(item, content, depth + 1, kinds, order, marks);
    if (children.length > 0) {
      const icon = headerMark(box, depth, marks);
      return {
        kind: "folder",
        node: item,
        header,
        children,
        depth,
        ...box,
        ...icon,
        ...headerPadlock(item, box, icon.slot, marks),
      };
    }
  }
  return {
    kind: "collapsed",
    node: item,
    category: dominantCategory(kindsOf(item, kinds)),
    depth,
    ...box,
    ...iconMark(box, true, marks),
  };
}

/**
 * Lay out `root`'s contents to fill `width` × `height` CSS pixels. Given `order`, the places the shown layout of the
 * same folder gave its items, a newer map keeps them there unless the change in size is visible (`keepPlaces`), so
 * squarify's rows don't flip over a few bytes. Without it, items go largest first. Tiles keep room at the start of
 * their labels for the `marks` the host draws. `usedSpace`, from a host that accounts for a whole volume's used space,
 * says what the scan couldn't measure, which takes a Not measured block of its share among the root's items, and the
 * volume's used space, which the root's shares become shares of. Without it, or with nothing not measured, the map is
 * the scan's alone.
 */
export function layoutTreemap(
  root: DirNode,
  width: number,
  height: number,
  kinds: ReadonlyMap<DirNode, KindBytes>,
  order?: SiblingOrder,
  marks?: LabelMarks,
  usedSpace?: UsedSpace,
): TreemapLayout {
  const box = { x0: 0, y0: 0, x1: Math.floor(width), y1: Math.floor(height) };
  const accounted =
    usedSpace !== undefined && usedSpace.unmeasured > 0 ? usedSpace : undefined;
  return {
    root,
    width,
    height,
    ...(accounted ? { usedSpace: accounted } : {}),
    ...(marks ? { metrics: marks.metrics } : {}),
    tiles: layoutItems(
      root,
      box,
      1,
      kinds,
      order,
      marks,
      accounted?.unmeasured,
    ),
  };
}

/** Where a layout placed each folder's items, by the folder's path, then each item's: 0 for the first. */
export type SiblingOrder = ReadonlyMap<string, ReadonlyMap<string, number>>;

/**
 * The places `layout` gave the items of each folder it shows, and the root's Not measured block, the group of smaller
 * items aside.
 */
export function siblingOrder(layout: TreemapLayout): SiblingOrder {
  const order = new Map<string, ReadonlyMap<string, number>>();
  const visit = (folder: string, tiles: readonly Tile[]) => {
    const places = new Map<string, number>();
    for (const tile of tiles) {
      if (tile.kind === "group") continue;
      places.set(nodeOf(tile)?.path ?? UNMEASURED_PLACE, places.size);
      if (tile.kind === "folder") visit(tile.node.path, tile.children);
    }
    order.set(folder, places);
  };
  visit(layout.root.path, layout.tiles);
  return order;
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
 * The folder a double-click at a point opens: the folder block, package or header under it, or the
 * folder holding the block under it. Null for the map's own items, whose folder is open.
 */
export function folderToOpenAt(
  layout: TreemapLayout,
  x: number,
  y: number,
): DirNode | null {
  return tilesAt(layout, x, y).filter(isFolderLike).at(-1)?.node ?? null;
}

/**
 * The tile that shows `path`: its own, or the one that holds it (a folder drawn as one
 * block, or the group of small items). Null outside the map or for the map's own folder.
 * No path leads to the Not measured block, which shows no item.
 */
export function tileForPath(layout: TreemapLayout, path: string): Tile | null {
  const root = layout.root.path;
  const inside = root === "/" ? path.length > 1 : path.startsWith(`${root}/`);
  if (!path.startsWith("/") || !inside) return null;
  let tiles = layout.tiles;
  let container: FolderTile | null = null;
  for (;;) {
    const match = tiles.find((tile) => {
      const node = nodeOf(tile);
      return (
        node !== null &&
        (node.path === path || path.startsWith(`${node.path}/`))
      );
    });
    if (!match) {
      // Not drawn on its own here, so it's one of the small items merged at this level.
      return tiles.find((tile) => tile.kind === "group") ?? container;
    }
    if (match.kind !== "folder" || match.node.path === path) return match;
    container = match;
    tiles = match.children;
  }
}

/** A share as the hover card gives it: "12%", or "<1%" for one under a percent. */
const percentOf = (part: number, whole: number) => {
  const share = whole > 0 ? (part / whole) * 100 : 0;
  return share > 0 && share < 1 ? "<1%" : `${Math.round(share)}%`;
};

/**
 * `tile`'s share of what `layout`'s root stands for, as the hover card gives it: of the root folder, "12% of Users", or,
 * where the host accounted for the whole volume's used space, of that used space, "12% of used space", the figure
 * "Where the space is" gives as Used on this disk.
 */
export function shareOf(tile: Tile, layout: TreemapLayout): string {
  const { root, usedSpace } = layout;
  return usedSpace === undefined
    ? `${percentOf(tileSize(tile), root.size)} of ${root.name || "/"}`
    : `${percentOf(tileSize(tile), usedSpace.used)} of used space`;
}
