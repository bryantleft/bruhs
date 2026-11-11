/**
 * The map's labels as its canvas paints them: a folder's name and size on its header strip, and a block's name with its
 * size beside it or on a line of its own, each cut with the metrics its layout was laid out with (`labelMetricsOf`),
 * and painted no wider than the room that cut gave it (`fillText`'s `maxWidth`). A label cut with one face's metrics
 * and painted in another that runs wider, as when the labels' web font finishes loading while the map holds a layout
 * still, narrows to its room for those few seconds rather than running past it, under its size or its padlock. Nothing
 * here needs React.
 */

import {
  type FolderTile,
  GAP,
  headerLabel,
  type LabelMetrics,
  labelMiddle,
  markRoom,
  padlockRoom,
  type Tile,
  tileLabel,
} from "../lib/treemap-layout.ts";
import { drawPadlock } from "./map-marks.ts";

/** The fonts a label's name and its size are painted in. */
export interface LabelFonts {
  readonly name: string;
  readonly size: string;
}

/** A tile's painted area. */
export interface Drawn {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A tile's painted area: its box less the gap on the right and bottom. */
export const drawnBox = (tile: Tile): Drawn => ({
  x: tile.x0,
  y: tile.y0,
  w: tile.x1 - tile.x0 - GAP,
  h: tile.y1 - tile.y0 - GAP,
});

/** Paints `value` at `x`, `y` in `font` and `color`, aligned `align`, no wider than `room` CSS pixels. */
function paintText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign,
  room: number,
) {
  context.font = font;
  context.fillStyle = color;
  context.textAlign = align;
  context.fillText(value, x, y, room);
}

/** Runs `paint` with the canvas clipped to `box`. */
function clipped(
  context: CanvasRenderingContext2D,
  box: Drawn,
  paint: () => void,
) {
  context.save();
  context.beginPath();
  context.rect(box.x, box.y, box.w, box.h);
  context.clip();
  paint();
  context.restore();
}

/** The room a label's size takes on its line, in CSS pixels, as the label was cut with `metrics`: a character each. */
const sizeRoom = (size: string, metrics: LabelMetrics) =>
  size.length * metrics.charWidth;

/** How wide a tile's label line is inside its padding, in CSS pixels. */
const inside = (box: Drawn, metrics: LabelMetrics) => box.w - 2 * metrics.padX;

/**
 * Paints `tile`'s header label (`headerLabel`), its name in `colors.name` and its size in `colors.size`, and the padlock
 * after its name as painted, in the size's colour. The name's room ends where its icon's, its padlock's and its size's,
 * with a space before the size, leave off, as the cut counted them; the size's is its own characters.
 */
export function paintHeaderLabel(
  context: CanvasRenderingContext2D,
  tile: FolderTile,
  metrics: LabelMetrics,
  fonts: LabelFonts,
  colors: { readonly name: string; readonly size: string },
): void {
  const label = headerLabel(tile, metrics);
  if (!label) return;
  const box = drawnBox(tile);
  const middle = labelMiddle(tile, metrics);
  const size = label.size === null ? 0 : sizeRoom(label.size, metrics);
  const name =
    inside(box, metrics) -
    markRoom(tile) -
    padlockRoom(tile) -
    (label.size === null ? 0 : size + metrics.charWidth);
  clipped(context, { ...box, h: tile.header }, () => {
    paintText(
      context,
      label.name,
      box.x + metrics.padX + markRoom(tile),
      middle,
      fonts.name,
      colors.name,
      "left",
      name,
    );
    // After the name as painted, which its room may have narrowed, in the room its layout kept.
    drawPadlock(
      context,
      tile,
      metrics,
      Math.min(context.measureText(label.name).width, name),
      colors.size,
    );
    if (label.size !== null) {
      paintText(
        context,
        label.size,
        box.x + box.w - metrics.padX,
        middle,
        fonts.size,
        colors.size,
        "right",
        size,
      );
    }
  });
}

/**
 * Paints a block's label (`tileLabel`) in `ink`: its name after its mark, with its size beside it, its own characters
 * and a space before them taken from the name's room, or on a line of its own, which has the block's whole width.
 */
export function paintBlockLabel(
  context: CanvasRenderingContext2D,
  tile: Exclude<Tile, FolderTile>,
  metrics: LabelMetrics,
  fonts: LabelFonts,
  ink: string,
): void {
  const label = tileLabel(tile, metrics);
  if (!label) return;
  const box = drawnBox(tile);
  const first = labelMiddle(tile, metrics);
  const line = inside(box, metrics);
  const beside = label.size !== null && label.lines === 1;
  const size = label.size === null ? 0 : sizeRoom(label.size, metrics);
  clipped(context, box, () => {
    paintText(
      context,
      label.name,
      box.x + metrics.padX + markRoom(tile),
      first,
      fonts.name,
      ink,
      "left",
      line - markRoom(tile) - (beside ? size + metrics.charWidth : 0),
    );
    if (label.size === null) return;
    if (beside) {
      paintText(
        context,
        label.size,
        box.x + box.w - metrics.padX,
        first,
        fonts.size,
        ink,
        "right",
        size,
      );
    } else {
      paintText(
        context,
        label.size,
        box.x + metrics.padX,
        first + metrics.lineHeight,
        fonts.size,
        ink,
        "left",
        line,
      );
    }
  });
}
