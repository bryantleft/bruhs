import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type LabelFonts,
  paintBlockLabel,
  paintHeaderLabel,
} from "../src/components/map-labels.ts";
import {
  type FileTile,
  type FolderTile,
  headerLabel,
  labelMiddle,
  PADLOCK,
  tileLabel,
} from "../src/lib/treemap-layout.ts";
import type { DirNode } from "../src/lib/types.ts";

/** The metrics the labels' layout was laid out with: 6 px a character, as in the layout's own tests. */
const METRICS = { charWidth: 6, lineHeight: 13, padX: 4, padY: 3 };
/**
 * How wide a character of the face the canvas paints in is: wider than the layout's metrics, as once the labels' web
 * font has loaded while the map held a layout laid out with the face that stood in for it.
 */
const PAINTED = 7;
const FONTS: LabelFonts = { name: "500 11px Neon", size: "400 11px Neon" };

/** A 2D context that records the text painted, with its room, and where the padlock goes, measuring in `PAINTED`. */
function recordingContext() {
  const calls: unknown[][] = [];
  const context = {
    font: "",
    fillStyle: "",
    textAlign: "start",
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    beginPath: () => {},
    rect: (...box: number[]) => calls.push(["rect", ...box]),
    clip: () => calls.push(["clip"]),
    translate: (x: number, y: number) => calls.push(["translate", x, y]),
    scale: () => {},
    fill: () => calls.push(["fill", context.fillStyle]),
    fillText: (text: string, x: number, y: number, maxWidth?: number) =>
      calls.push([
        "fillText",
        text,
        x,
        y,
        maxWidth,
        context.font,
        context.textAlign,
        context.fillStyle,
      ]),
    measureText: (text: string) => ({ width: text.length * PAINTED }),
  };
  return { calls, context: context as unknown as CanvasRenderingContext2D };
}

const painted = (calls: unknown[][]) =>
  calls.filter((call) => call[0] === "fillText");

describe("painting the map's labels", () => {
  // Node has no canvas paths: a stand-in, as the padlock's path is made when it's first drawn.
  (globalThis as { Path2D?: unknown }).Path2D = class {};

  const report = {
    kind: "file",
    name: "before-app-review.png",
    path: "/r/before-app-review.png",
    size: 1_500_000,
  } as const;
  const block = (height: number): FileTile => ({
    kind: "file",
    node: report,
    category: "image",
    depth: 1,
    x0: 10,
    y0: 20,
    x1: 170,
    y1: 20 + height,
  });

  test("a block's name and its size beside it are each painted no wider than the room their cut gave them", () => {
    // 159 px painted, 151 inside the padding: the size takes its 7 characters, and the name what's left before a space.
    const tile = block(22);
    const label = tileLabel(tile, METRICS);
    assert.ok(label && label.lines === 1 && label.size === "1.50 MB");
    const { calls, context } = recordingContext();
    paintBlockLabel(context, tile, METRICS, FONTS, "ink");
    const middle = labelMiddle(tile, METRICS);
    assert.deepEqual(painted(calls), [
      [
        "fillText",
        label.name,
        14,
        middle,
        151 - 8 * 6,
        FONTS.name,
        "left",
        "ink",
      ],
      ["fillText", "1.50 MB", 165, middle, 7 * 6, FONTS.size, "right", "ink"],
    ]);
  });

  test("a block's name has its whole line, after its mark, and its size the block's width on a line of its own", () => {
    const tile = { ...block(60), slot: 14 };
    const label = tileLabel(tile, METRICS);
    assert.ok(label && label.lines === 2 && label.size === "1.50 MB");
    const { calls, context } = recordingContext();
    paintBlockLabel(context, tile, METRICS, FONTS, "ink");
    const middle = labelMiddle(tile, METRICS);
    assert.deepEqual(painted(calls), [
      ["fillText", label.name, 32, middle, 151 - 18, FONTS.name, "left", "ink"],
      ["fillText", "1.50 MB", 14, middle + 13, 151, FONTS.size, "left", "ink"],
    ]);
  });

  test("a header's name leaves room for its padlock and its size, and the padlock follows the name as painted, kept to its room", () => {
    const node: DirNode = {
      kind: "dir",
      name: "node_modules-and-everything-else",
      path: "/r/node_modules-and-everything-else",
      size: 2_000_000_000,
      files: 1,
      children: [
        {
          kind: "unreadable",
          name: "locked",
          path: "/r/node_modules-and-everything-else/locked",
          size: 0,
          reason: "denied",
        } as unknown as DirNode,
      ],
    };
    const tile: FolderTile = {
      kind: "folder",
      node,
      header: 18,
      children: [],
      depth: 1,
      x0: 10,
      y0: 20,
      x1: 210,
      y1: 120,
      slot: 14,
      padlock: true,
    };
    const label = headerLabel(tile, METRICS);
    assert.ok(label?.size === "2.00 GB");
    // 191 px inside the padding: 18 for the icon and its gap, 12 for the padlock, then the size and a space.
    const room = 191 - 18 - 12 - 8 * 6;
    assert.ok(
      label.name.length * PAINTED > room,
      "the face painted runs past the room its cut gave it",
    );
    const { calls, context } = recordingContext();
    paintHeaderLabel(context, tile, METRICS, FONTS, {
      name: "text",
      size: "secondary",
    });
    const middle = labelMiddle(tile, METRICS);
    assert.deepEqual(painted(calls), [
      ["fillText", label.name, 32, middle, room, FONTS.name, "left", "text"],
      [
        "fillText",
        "2.00 GB",
        205,
        middle,
        7 * 6,
        FONTS.size,
        "right",
        "secondary",
      ],
    ]);
    const padlock = calls.find((call) => call[0] === "translate");
    assert.equal(padlock?.[1], 10 + 4 + 18 + room + PADLOCK.gap);
  });
});
