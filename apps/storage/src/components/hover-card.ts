/**
 * What the disk map's hover card says about the block under the pointer: its name, its kind, its size and share, what
 * a click does there, and what inside it couldn't be read or changed since the last scan. Only words: the canvas draws
 * the card.
 */

import { middleTruncate } from "../lib/display-names.ts";
import {
  CATEGORY_LABEL,
  CATEGORY_VAR,
  type Category,
  formatBytes,
} from "../lib/format.ts";
import {
  type CollapsedTile,
  type PackageTile,
  shareOf,
  type Tile,
  type TreemapLayout,
  tileName,
  tileSize,
  unreadableCount,
} from "../lib/treemap-layout.ts";
import type { DirNode } from "../lib/types.ts";

/** What the hover card says about a block, each part shown as its own line or figure. */
export interface Card {
  readonly title: string;
  /**
   * What the block is, with the fill or outline it has on the map, as in the kind legend.
   * Null for a group of small items, which mixes kinds.
   */
  readonly kind: {
    readonly label: string;
    readonly fill: string | null;
  } | null;
  readonly size: string;
  /**
   * The block's share of the open folder, e.g. "12% of Users", or of used space, e.g. "12% of used space", at a root
   * with its Not measured block.
   */
  readonly share: string;
  /** What clicks do; null once the user has done both. */
  readonly hint: string | null;
  /** Folders inside it the scan couldn't read, e.g. "2 folders inside couldn't be read". */
  readonly unreadable: string | null;
  /** How much it changed since the last scan, e.g. "+12.3 GB since Nov 3". */
  readonly change: string | null;
}

/**
 * What a folder or package block holds, as its colour shows: "Folder, mostly images", or "Package" when nothing has
 * the most. A package whose name has a kind, as an app's does, is that kind.
 */
function blockKind(tile: CollapsedTile | PackageTile): string {
  if (tile.kind === "package" && tile.kindFrom === "name") {
    return CATEGORY_LABEL[tile.category];
  }
  const noun = tile.kind === "package" ? "Package" : "Folder";
  return tile.category === "other"
    ? noun
    : `${noun}, mostly ${CATEGORY_LABEL[tile.category].toLowerCase()}`;
}

/** "2 folders inside couldn't be read", or null when the scan read them all. */
function unreadableInside(node: DirNode): string | null {
  const count = unreadableCount(node);
  if (count === 0) return null;
  return `${count} ${count === 1 ? "folder" : "folders"} inside couldn’t be read`;
}

/**
 * What the card says of `tile`, laid out in `layout`. A share is of the layout's folder, or, where the host accounted
 * for the whole volume's used space, of that used space (`shareOf`).
 */
export function describe(
  tile: Tile,
  open: DirNode | null,
  layout: TreemapLayout,
  hints: boolean,
  change: string | null,
): Card {
  const size = formatBytes(tileSize(tile));
  const share = shareOf(tile, layout);
  const openFolder = open ? ` Double-click to open ${open.name}/.` : "";
  const title = middleTruncate(tileName(tile), 34);
  const fill = (category: Category) => `var(${CATEGORY_VAR[category]})`;
  const hint = (text: string) => (hints ? text : null);
  switch (tile.kind) {
    case "unmeasured":
      return {
        title,
        kind: null,
        size,
        share,
        // Always said: a click here opens no item, so nothing about it is learned.
        hint: "Space the scan couldn’t see. Click to see why.",
        unreadable: null,
        change: null,
      };
    case "file":
      return {
        title,
        kind: {
          label: CATEGORY_LABEL[tile.category],
          fill: fill(tile.category),
        },
        size,
        share,
        hint: hint(`Click to select.${openFolder}`),
        unreadable: null,
        change,
      };
    case "volume":
      return {
        title,
        kind: { label: "Another volume on this disk", fill: null },
        size,
        share,
        // Always said: why this block can't be opened isn't something a user learns once.
        hint: "Measured, not scanned: macOS keeps this volume apart from your files.",
        unreadable: null,
        change,
      };
    case "group":
      return {
        title,
        kind: null,
        size,
        share,
        hint: hint(`Too small to show one by one.${openFolder}`),
        unreadable: null,
        change,
      };
    case "collapsed":
    case "package":
      return {
        title,
        kind: { label: blockKind(tile), fill: fill(tile.category) },
        size,
        share,
        hint: hint("Click to select. Double-click to open."),
        unreadable: unreadableInside(tile.node),
        change,
      };
    case "folder":
      // Drawn as a container around its contents, so its swatch is an outline.
      return {
        title,
        kind: { label: "Folder", fill: null },
        size,
        share,
        hint: hint("Click to select. Double-click to open."),
        unreadable: unreadableInside(tile.node),
        change,
      };
  }
}
