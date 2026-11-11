/**
 * The blocks a disk map layout gives, by kind, and what each stands for: its item, its bytes and its name. The layout
 * (treemap-layout.ts), the labels and marks it keeps room for (treemap-marks.ts) and the comparison of a newer layout
 * with the one shown (treemap-compare.ts) all go by them.
 */

import type { Category } from "./format.ts";
import type { DirNode, FileNode, TreeNode, VolumeNode } from "./types.ts";

/** Tiles leave this gap on their right and bottom edges, so neighbours stay apart. */
export const GAP = 1;

export interface Box {
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

/** The Not measured block's name. */
export const NOT_MEASURED = "Not measured";

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

/** Bytes a tile stands for. */
export function tileSize(tile: Tile): number {
  return isItemTile(tile) ? tile.node.size : tile.size;
}

/** "253", or "253+" when the group also holds the scanner's uncounted items. */
export const groupCount = (tile: GroupTile) =>
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
