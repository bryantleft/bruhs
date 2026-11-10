/**
 * How the disk map's keys and its list of items pick items without a mouse: the item an arrow key moves to, or with
 * Shift adds to the selection, and the button in the map's list of items that adds an item to the selection or takes it
 * out, which a keyboard or VoiceOver reaches where a ⌘-click can't. Only choices and words: treemap-canvas.tsx and
 * treemap-items.tsx act on them.
 */

import { nodeOf, type Tile } from "../lib/treemap-layout.ts";
import type { TreeNode } from "../lib/types.ts";

export type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/**
 * A selectable item: a file or folder. Groups and volumes can't be moved to the Trash or revealed, and the Not measured
 * block is no item at all.
 */
export const selectable = (tile: Tile | null): TreeNode | null =>
  tile && tile.kind !== "volume" ? nodeOf(tile) : null;

/** The tile nearest `from` in an arrow key's direction, among `tiles`. */
export function tileInDirection(
  tiles: readonly Tile[],
  from: Tile,
  key: ArrowKey,
): Tile | null {
  const center = (t: Tile) => ({ x: (t.x0 + t.x1) / 2, y: (t.y0 + t.y1) / 2 });
  const origin = center(from);
  let best: Tile | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const tile of tiles) {
    if (tile === from) continue;
    const c = center(tile);
    const dx = c.x - origin.x;
    const dy = c.y - origin.y;
    const along =
      key === "ArrowLeft"
        ? -dx
        : key === "ArrowRight"
          ? dx
          : key === "ArrowUp"
            ? -dy
            : dy;
    const across =
      key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dy) : Math.abs(dx);
    if (along <= 0) continue;
    // Straight ahead beats diagonal: sideways distance counts double.
    const score = along + 2 * across;
    if (score < bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  return best;
}

/** What an arrow key does: make an item the selection, or, with Shift, add one to it. */
export type ArrowStep =
  | { readonly select: TreeNode }
  | { readonly add: TreeNode };

/**
 * What an arrow key does among the open folder's own `tiles`, from `from`, the item picked last, or from nowhere when
 * that's none of them, so the first item. The nearest item in that direction becomes the selection. With `extend`, as
 * with Shift where the host keeps several, the nearest block not `selected` yet joins it instead, as Finder's icon view
 * extends a selection, passing over the items selected already. Nothing when that block is no item, such as the smaller
 * items, as for a plain arrow.
 */
export function arrowStep(
  tiles: readonly Tile[],
  from: Tile | null,
  key: ArrowKey,
  extend: boolean,
  selected: readonly Tile[],
): ArrowStep | null {
  const among = extend
    ? tiles.filter((tile) => !selected.includes(tile))
    : tiles;
  const next = from
    ? tileInDirection(among, from, key)
    : (among.find((tile) => selectable(tile)) ?? null);
  const node = selectable(next);
  if (!node) return null;
  return extend ? { add: node } : { select: node };
}

/**
 * The button beside an item in the map's list of items that adds it to the selection or takes it out: its words, and
 * its label, which names the item. Nothing for what's no item, such as the smaller items or another volume.
 */
export function selectionButton(
  node: TreeNode,
  selected: boolean,
): { readonly text: string; readonly label: string } | null {
  if (node.kind !== "dir" && node.kind !== "file") return null;
  return selected
    ? { text: "Take Out", label: `Take ${node.name} out of the selection` }
    : { text: "Add", label: `Add ${node.name} to the selection` };
}

/**
 * How a row of a list that selects its item says the item is selected. Pressing the row selects that item alone, so
 * the row is no toggle: `aria-pressed` would have VoiceOver announce one, and a press take out an item that it
 * doesn't. The row carries `data-selected`, which its style shows, and says "selected" after its name instead.
 */
export function selectedRow(selected: boolean): {
  readonly "data-selected"?: "";
} {
  return selected ? { "data-selected": "" } : {};
}

/** What a selected row says after its name, as VoiceOver reads it: a row whose name is its content says it last. */
export const SELECTED_SAID = ", selected";

/** A row's label as VoiceOver reads it, saying "selected" after it when its item is selected. */
export function rowLabel(label: string, selected: boolean): string {
  return selected ? `${label}${SELECTED_SAID}` : label;
}
