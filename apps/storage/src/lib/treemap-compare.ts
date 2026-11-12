/**
 * A newer layout of the folder shown, set against the one on screen: its items kept in the places they had while the
 * map can't show that their sizes changed order, and whether it draws just what the shown one does, so the page can
 * keep that one and draw nothing.
 */

import { formatBytes } from "./format.ts";
// Type-only: treemap-layout.ts imports this module's values, so a value import back would be a cycle at run time.
import type { Laid, TreemapLayout } from "./treemap-layout.ts";
import { type LabelMetrics, padlockRoom } from "./treemap-marks.ts";
import {
  isFolderLike,
  nodeOf,
  type Tile,
  tileSize,
  unreadableCount,
} from "./treemap-tiles.ts";

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
export function keepPlaces(
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
 * block, with the used space the root's shares are of printing another size. So does a layout laid out with other
 * labels' metrics, as once the labels' font has loaded, whose labels are cut with them.
 */
export function drawsTheSame(
  shown: TreemapLayout,
  next: TreemapLayout,
): boolean {
  return (
    shown.root.path === next.root.path &&
    shown.width === next.width &&
    shown.height === next.height &&
    sameMetrics(shown.metrics, next.metrics) &&
    printSame(
      shown.usedSpace?.unmeasured ?? 0,
      next.usedSpace?.unmeasured ?? 0,
    ) &&
    printSame(shown.usedSpace?.used ?? 0, next.usedSpace?.used ?? 0) &&
    sameTiles(shown.tiles, next.tiles)
  );
}

/** Labels' metrics that cut every label alike: the same, or measured again to the same figures. */
const sameMetrics = (a?: LabelMetrics, b?: LabelMetrics) =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.charWidth === b.charWidth &&
    a.lineHeight === b.lineHeight &&
    a.padX === b.padX &&
    a.padY === b.padY);

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
