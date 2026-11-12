/**
 * What a tile's label says and where it goes, and the room a layout keeps for the marks a host draws: an icon or a
 * file kind's glyph at the start of a label, and a padlock after a header's name. Pure geometry, as the layout is.
 */

import {
  endTruncate,
  graphemeLength,
  middleTruncate,
} from "./display-names.ts";
import { formatBytes } from "./format.ts";
// Type-only: treemap-layout.ts imports this module's values, so a value import back would be a cycle at run time.
import type { TreemapLayout } from "./treemap-layout.ts";
import {
  type Box,
  type FileTile,
  type FolderTile,
  GAP,
  groupCount,
  groupName,
  NOT_MEASURED,
  type Tile,
  tileSize,
  unreadableCount,
} from "./treemap-tiles.ts";
import type { DirNode } from "./types.ts";

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
export function headerMark(
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
export function headerPadlock(
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
export function iconMark(
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
export function glyphMark(
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

/** Text metrics for labels, measured from the canvas font. */
export interface LabelMetrics {
  /** Advance of one character; Monaspace is monospaced. */
  readonly charWidth: number;
  readonly lineHeight: number;
  readonly padX: number;
  readonly padY: number;
}

/**
 * The metrics `layout`'s labels are cut and its marks placed with: those it was laid out with, which kept its marks'
 * room, so a label that fit beside its mark then still shows, though the host's metrics have changed since, as when
 * the labels' font loads while the map holds still. A layout of the new metrics comes after, and shows as any newer
 * layout does (`drawsTheSame`). A layout that keeps no room for marks has its labels cut with the host's `current`.
 */
export const labelMetricsOf = (
  layout: TreemapLayout,
  current: LabelMetrics,
): LabelMetrics => layout.metrics ?? current;

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
