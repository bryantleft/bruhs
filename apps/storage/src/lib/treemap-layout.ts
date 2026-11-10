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
  endTruncate,
  graphemeLength,
  middleTruncate,
} from "./display-names.ts";
import {
  CATEGORY_VAR,
  type Category,
  categoryForName,
  formatBytes,
  isPackageName,
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

/**
 * The icon at the start of a header strip, by depth: 14 px on a depth-1 folder's 18 px strip and 12 px on a depth-2
 * folder's 16 px one, the largest that fit inside the folder's 1 px outline with a pixel and a half above and below.
 */
const HEADER_ICON_BY_DEPTH: readonly number[] = [0, 14, 12];

/** A block's mark, an icon or a file's glyph, at the start of its first label line. */
const BLOCK_MARK = 14;

/** The room between a mark and the label after it. */
const MARK_GAP = 4;

/**
 * The padlock after a header's name, for a folder that holds folders the scan couldn't read, which have no size to
 * draw: the hover card's padlock, 10 px high and 8⅓ wide, `gap` px after the name (`drawPadlock` in map-marks.ts).
 */
export const PADLOCK = { height: 10, width: 25 / 3, gap: 3 } as const;

/** The room a padlock takes in a header strip: its gap and its width, to the next whole pixel. */
const PADLOCK_ROOM = Math.ceil(PADLOCK.gap + PADLOCK.width);

/**
 * What a host draws at the start of labels, which the layout keeps room for, and the labels' `metrics`, which say
 * where there's room: a mark goes only where the label still fits after it. `icons`: macOS's own, on depth-1 and
 * depth-2 header strips and on package, volume and folder blocks, as Pith's page draws them. `glyphs`: each file
 * block's kind as a glyph, the cue that doesn't need colour, which Pith's page draws while Differentiate Without Color
 * is on. `padlocks`: a padlock after the name of each header strip whose folder holds folders the scan couldn't read,
 * which Pith's page draws. The browser app draws none of them.
 */
export interface LabelMarks {
  readonly icons: boolean;
  readonly glyphs: boolean;
  readonly padlocks?: boolean;
  readonly metrics: LabelMetrics;
}

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
  /**
   * The side, in CSS pixels, of the square kept at the start of its label line for its mark: its icon, or a file's
   * glyph. Its label starts after it, whether or not the mark has come. None when it has no mark.
   */
  readonly slot?: number;
}

/** A folder drawn as a container: a header strip with its name, then its contents. */
export interface FolderTile extends TileBase {
  readonly kind: "folder";
  readonly node: DirNode;
  readonly header: number;
  readonly children: readonly Tile[];
  /**
   * A padlock after its name: it holds folders the scan couldn't read, which have no blocks. Only where the host draws
   * padlocks, and its name still fits beside one.
   */
  readonly padlock?: true;
}

/** A folder drawn as one block, coloured by the kind it holds most of. */
export interface CollapsedTile extends TileBase {
  readonly kind: "collapsed";
  readonly node: DirNode;
  readonly category: Category;
}

/**
 * A package, such as an app or a Photos library: a folder Finder shows as one item, drawn as one block at any level
 * and opened with a double-click like a folder. It's drawn as a folder block is, in the kind its name has in the kind
 * table, as an app's is Apps & binaries, or else the kind it holds most of.
 */
export interface PackageTile extends TileBase {
  readonly kind: "package";
  readonly node: DirNode;
  readonly category: Category;
  /** Where its kind came from: its name, as an app's does, or what it holds most of. */
  readonly kindFrom: "name" | "contents";
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

/**
 * Used space on the map's volumes that the scan couldn't measure, as the host's accounting has it: one hatched block
 * at the map's root, labelled "Not measured". It isn't an item, so nothing selects, opens or moves it to the Trash.
 */
export interface UnmeasuredTile extends TileBase {
  readonly kind: "unmeasured";
  readonly size: number;
}

export type Tile =
  | FolderTile
  | CollapsedTile
  | PackageTile
  | FileTile
  | VolumeTile
  | GroupTile
  | UnmeasuredTile;

/** A tile that shows an item of the map: anything but the group of smaller items and the Not measured block. */
export type ItemTile = Exclude<Tile, GroupTile | UnmeasuredTile>;

/** Whether `tile` shows an item of the map, as `nodeOf` finds it. */
export const isItemTile = (tile: Tile): tile is ItemTile =>
  tile.kind !== "group" && tile.kind !== "unmeasured";

/** The item `tile` shows, or null for the group of smaller items and the Not measured block, which show none. */
export const nodeOf = (tile: Tile): TreeNode | null =>
  isItemTile(tile) ? tile.node : null;

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
  /** The current folder's own items; folders hold theirs in `children`. */
  readonly tiles: readonly Tile[];
}

/** The Not measured block's name. */
export const NOT_MEASURED = "Not measured";

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
type Laid = Item | UnmeasuredItem;

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

/**
 * Whether a tile painted `width` px wide still has room for its name after a mark `size` px across: four of the name's
 * characters and an ellipsis, and a folder block's slash, the least a cut name keeps (`fitName`). So a mark never
 * takes the place of a label.
 */
function nameFitsAfter(
  width: number,
  size: number,
  slash: boolean,
  metrics: LabelMetrics,
): boolean {
  const characters = MIN_KEPT + 1 + (slash ? 1 : 0);
  return (
    width - 2 * metrics.padX - size - MARK_GAP >= characters * metrics.charWidth
  );
}

/** How far below a block's top its first label line is centred, its text and its mark alike. */
const firstLineMiddle = (metrics: LabelMetrics) =>
  metrics.padY + metrics.lineHeight / 2 + 0.5;

/** Whether a block painted `height` px high holds a mark centred on its first label line, with the label's padding below. */
const markFitsHigh = (height: number, metrics: LabelMetrics) =>
  Math.round(firstLineMiddle(metrics) - BLOCK_MARK / 2) +
    BLOCK_MARK +
    metrics.padY <=
  height;

/** A header strip's icon, at its depth's size, where the strip has room for it and its folder's name after it. */
function headerMark(
  box: Box,
  depth: number,
  marks: LabelMarks | undefined,
): { slot?: number } {
  const size = HEADER_ICON_BY_DEPTH[depth] ?? 0;
  return marks?.icons &&
    size > 0 &&
    nameFitsAfter(box.x1 - box.x0 - GAP, size, false, marks.metrics)
    ? { slot: size }
    : {};
}

/**
 * A header strip's padlock, for a folder that holds folders the scan couldn't read, as its card counts them: where the
 * strip still has room for the least of its name, four characters and an ellipsis, after its icon and the padlock. The
 * icon comes first, so a padlock never takes its place, and neither takes the name's.
 */
function headerPadlock(
  folder: DirNode,
  box: Box,
  slot: number | undefined,
  marks: LabelMarks | undefined,
): { padlock?: true } {
  if (!marks?.padlocks || unreadableCount(folder) === 0) return {};
  const { metrics } = marks;
  const room =
    box.x1 -
    box.x0 -
    GAP -
    2 * metrics.padX -
    (slot ? slot + MARK_GAP : 0) -
    PADLOCK_ROOM;
  return room >= (MIN_KEPT + 1) * metrics.charWidth ? { padlock: true } : {};
}

/** A package, volume or folder block's icon, where the block has room for it and its name after it. */
function iconMark(
  box: Box,
  slash: boolean,
  marks: LabelMarks | undefined,
): { slot?: number } {
  return marks?.icons &&
    markFitsHigh(box.y1 - box.y0 - GAP, marks.metrics) &&
    nameFitsAfter(box.x1 - box.x0 - GAP, BLOCK_MARK, slash, marks.metrics)
    ? { slot: BLOCK_MARK }
    : {};
}

/**
 * Whether a label that shows `shown` of a file named `name` says what kind of file it is as well as its name: it shows
 * the whole name, or a cut that keeps the extension.
 */
function namesKind(name: string, shown: string): boolean {
  const dot = name.lastIndexOf(".");
  return shown === name || (dot > 0 && shown.endsWith(name.slice(dot)));
}

/**
 * A file block's glyph while glyphs are drawn, the cue for its kind that doesn't need colour: before its label where
 * the label still fits after it. Where it doesn't, the glyph shows alone, unless the block's label already says its
 * kind, with its whole name or a cut that keeps the extension, which it keeps. A cut that loses the extension gives
 * way to the glyph: it doesn't say the kind, and the hover card and the list of items still give the whole name.
 */
function glyphMark(
  tile: FileTile,
  marks: LabelMarks | undefined,
): { slot?: number } {
  if (!marks?.glyphs) return {};
  const { metrics } = marks;
  const width = tile.x1 - tile.x0 - GAP;
  if (!markFitsHigh(tile.y1 - tile.y0 - GAP, metrics)) return {};
  if (nameFitsAfter(width, BLOCK_MARK, false, metrics)) {
    return { slot: BLOCK_MARK };
  }
  if (width < 2 * metrics.padX + BLOCK_MARK) return {};
  const label = tileLabel(tile, metrics);
  return label !== null && namesKind(tile.node.name, label.name)
    ? {}
    : { slot: BLOCK_MARK };
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

/**
 * `items`, largest first, put back in the places they had, as long as the map can't show that their sizes changed
 * order. Edges snap to whole pixels, so blocks whose sides differ by less than a pixel can come out the same size,
 * and a pixel more of side is the smallest difference the map can draw. Squarify keeps blocks near square, so an item
 * gets about √(bytes × `pxPerByte`) px on a side, and it goes ahead of an item placed before it once its side is a
 * pixel longer. In a 100 × 100 px box of 10,000 bytes, 5,071 bytes overtake 4,929 (71.21 px of side against 70.21),
 * while 5,070 don't overtake 4,930 (71.20 against 70.21). Items without a place, new on the map, start after the
 * rest, largest first, and move ahead the same way. Each item goes before the first item it's visibly bigger than,
 * so none stays behind one it's visibly bigger than. The root's Not measured block keeps its place as an item does.
 */
function keepPlaces(
  items: readonly Laid[],
  places: ReadonlyMap<string, number>,
  pxPerByte: number,
): Laid[] {
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
 * same size, and every tile, header strip and label in the same box, of the same kind and colour, with the same name,
 * the same size to print and the same room for a mark. Boxes are whole CSS pixels and the two draw at the same pixel
 * ratio, so the same box covers the same device pixels. Sizes count as they print whether or not a label has room for
 * one, and so does a folder's count of folders inside it that couldn't be read, so the hover card of a layout kept
 * never shows a size or a count the map has moved past. An icon arriving changes no layout: the map paints it into
 * the room its layout kept. A header's padlock coming or going draws differently, and so does the root's Not measured
 * block, with the used space the root's shares are of printing another size.
 */
export function drawsTheSame(
  shown: TreemapLayout,
  next: TreemapLayout,
): boolean {
  return (
    shown.root.path === next.root.path &&
    shown.width === next.width &&
    shown.height === next.height &&
    printSame(
      shown.usedSpace?.unmeasured ?? 0,
      next.usedSpace?.unmeasured ?? 0,
    ) &&
    printSame(shown.usedSpace?.used ?? 0, next.usedSpace?.used ?? 0) &&
    sameTiles(shown.tiles, next.tiles)
  );
}

function sameTiles(a: readonly Tile[], b: readonly Tile[]): boolean {
  return a.length === b.length && a.every((tile, i) => sameTile(tile, b[i]));
}

/** Most sizes don't change from one map to the next, so most need no printing. */
const printSame = (a: number, b: number) =>
  a === b || formatBytes(a) === formatBytes(b);

/**
 * A file's colour comes from its name, a folder block's from what it holds, and a package's from either; other kinds
 * have one colour each.
 */
const fillOf = (tile: Tile) =>
  tile.kind === "file" || tile.kind === "collapsed" || tile.kind === "package"
    ? tile.category
    : null;

/** How many folders inside `folder` the scan couldn't read, which its hover card counts. */
export const unreadableCount = (folder: DirNode) =>
  folder.children.reduce(
    (count, child) => count + (child.kind === "unreadable" ? 1 : 0),
    0,
  );

/** Folders, folder blocks and packages: what a double-click opens, and what a card counts unreadable folders inside. */
export const isFolderLike = (
  tile: Tile,
): tile is FolderTile | CollapsedTile | PackageTile =>
  tile.kind === "folder" ||
  tile.kind === "collapsed" ||
  tile.kind === "package";

/** The folders a folder's card counts as unreadable; null for other tiles, whose cards count none. */
const unreadableOf = (tile: Tile) =>
  isFolderLike(tile) ? unreadableCount(tile.node) : null;

function sameTile(a: Tile, b: Tile): boolean {
  // The group by what it counts; the Not measured block has the one name, and no item.
  const named =
    a.kind === "group"
      ? b.kind === "group" && a.count === b.count && a.partial === b.partial
      : nodeOf(a)?.name === nodeOf(b)?.name;
  return (
    a.kind === b.kind &&
    a.x0 === b.x0 &&
    a.y0 === b.y0 &&
    a.x1 === b.x1 &&
    a.y1 === b.y1 &&
    a.slot === b.slot &&
    padlockRoom(a) === padlockRoom(b) &&
    named &&
    fillOf(a) === fillOf(b) &&
    printSame(tileSize(a), tileSize(b)) &&
    unreadableOf(a) === unreadableOf(b) &&
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

/** Bytes a tile stands for. */
export function tileSize(tile: Tile): number {
  return isItemTile(tile) ? tile.node.size : tile.size;
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

/** "253", or "253+" when the group also holds the scanner's uncounted items. */
const groupCount = (tile: GroupTile) =>
  `${tile.count.toLocaleString("en-US")}${tile.partial ? "+" : ""}`;

export function groupName(tile: GroupTile): string {
  return tile.count > 0 ? `${groupCount(tile)} smaller items` : "Smaller items";
}

/**
 * The name a block stands for. Folders end in "/" so they read as folders without colour; a package is one thing, as
 * a file is, so it doesn't.
 */
export function tileName(tile: Tile): string {
  if (tile.kind === "group") return groupName(tile);
  if (tile.kind === "unmeasured") return NOT_MEASURED;
  return tile.kind === "file" ||
    tile.kind === "volume" ||
    tile.kind === "package"
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
 * Files are cut in the middle so the extension stays; folders and packages keep their start,
 * which tells them apart, as a package's icon tells its kind; groups shorten to "253+ items" instead.
 */
function fitName(tile: Tile, maxChars: number): string | null {
  if (tile.kind === "group") {
    const short = tile.count > 0 ? `${groupCount(tile)} items` : null;
    for (const name of [groupName(tile), short]) {
      if (name !== null && graphemeLength(name) <= maxChars) return name;
    }
    return null;
  }
  if (tile.kind === "unmeasured") {
    if (graphemeLength(NOT_MEASURED) <= maxChars) return NOT_MEASURED;
    return maxChars - 1 >= MIN_KEPT
      ? endTruncate(NOT_MEASURED, maxChars)
      : null;
  }
  if (tile.kind === "file" || tile.kind === "volume") {
    if (graphemeLength(tile.node.name) <= maxChars) return tile.node.name;
    return maxChars - 1 >= MIN_KEPT
      ? middleTruncate(tile.node.name, maxChars)
      : null;
  }
  // A folder header is a folder by its place; a folder block says so with "/". A package is one thing.
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

/** How far a tile's first label line starts after its padding: past its mark and the gap after it, if it has one. */
export const markRoom = (tile: Tile) => (tile.slot ? tile.slot + MARK_GAP : 0);

/** The room a header strip keeps after its name for its padlock, if it has one (`PADLOCK`). */
export const padlockRoom = (tile: Tile) =>
  tile.kind === "folder" && tile.padlock ? PADLOCK_ROOM : 0;

/** Where a tile's first label line is centred: the middle of a header strip, or of a block's first line. */
export const labelMiddle = (tile: Tile, metrics: LabelMetrics) =>
  tile.y0 +
  (tile.kind === "folder" ? tile.header / 2 + 0.5 : firstLineMiddle(metrics));

/** Where a tile's mark goes: the square its layout kept at the start of its first label line, centred on that line. */
export function markPlace(
  tile: Tile,
  metrics: LabelMetrics,
): { readonly x: number; readonly y: number; readonly size: number } | null {
  if (!tile.slot) return null;
  return {
    x: tile.x0 + metrics.padX,
    y: Math.round(labelMiddle(tile, metrics) - tile.slot / 2),
    size: tile.slot,
  };
}

/** What fits inside a block, or null when nothing legible does. */
export function tileLabel(
  tile: Exclude<Tile, FolderTile>,
  metrics: LabelMetrics,
): TileLabel | null {
  const width = innerWidth(tile, metrics);
  const maxChars = Math.floor(width / metrics.charWidth);
  // The first line starts after the block's mark; the second runs below it, across the block.
  const firstChars = Math.floor((width - markRoom(tile)) / metrics.charWidth);
  const height = tile.y1 - tile.y0 - GAP - 2 * metrics.padY;
  if (height < metrics.lineHeight) return null;
  const size = formatBytes(tileSize(tile));
  if (height >= 2 * metrics.lineHeight) {
    const name = fitName(tile, firstChars);
    if (name === null) return null;
    return { name, size: size.length <= maxChars ? size : null, lines: 2 };
  }
  const line = oneLine(tile, size, firstChars);
  return line && { ...line, lines: 1 };
}

/** What fits in a folder's header strip after its icon, with room after the name for its padlock, or null. */
export function headerLabel(
  tile: FolderTile,
  metrics: LabelMetrics,
): { name: string; size: string | null } | null {
  const maxChars = Math.floor(
    (innerWidth(tile, metrics) - markRoom(tile) - padlockRoom(tile)) /
      metrics.charWidth,
  );
  return oneLine(tile, formatBytes(tile.node.size), maxChars);
}
