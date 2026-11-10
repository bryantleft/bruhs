import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  drawMark,
  type Frames,
  iconArrivals,
  iconPaint,
  type MapIcons,
  paintArrived,
} from "../src/components/map-marks.ts";
import { KIND_GLYPHS } from "../src/lib/kind-glyphs.ts";
import type { Tile } from "../src/lib/treemap-layout.ts";

/** Icons a test hands out: loaded ones, failed ones, and the requests and listeners the map makes. */
function testIcons(
  loaded: Record<string, string> = {},
  refused: readonly string[] = [],
) {
  const images = new Map(Object.entries(loaded));
  const failed = new Set(refused);
  const requested: string[] = [];
  const listeners = new Set<() => void>();
  const icons: MapIcons = {
    url: (tile, points, ratio) =>
      tile.kind === "group"
        ? null
        : `pith://app/icon/1/dark/${points}@${ratio}x/item/${tile.node.name}.png`,
    image: (url) =>
      (images.get(url) as unknown as CanvasImageSource | undefined) ?? null,
    failed: (url) => failed.has(url),
    request: (url) => {
      requested.push(url);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  /** An icon loads, or fails without an image, and the cache tells its listeners. */
  const arrive = (url: string, image?: string) => {
    if (image === undefined) failed.add(url);
    else images.set(url, image);
    for (const listener of [...listeners]) listener();
  };
  return { icons, requested, listeners, arrive };
}

/** Animation frames that run when the test says. */
function testFrames() {
  let next = 1;
  const pending = new Map<number, () => void>();
  const frames: Frames = {
    request: (run) => {
      pending.set(next, run);
      return next++;
    },
    cancel: (id) => {
      pending.delete(id);
    },
  };
  const run = () => {
    const due = [...pending.values()];
    pending.clear();
    for (const paint of due) paint();
  };
  return { frames, pending, run };
}

const folder = (name: string): Tile => ({
  kind: "collapsed",
  node: {
    kind: "dir",
    name,
    path: `/r/${name}`,
    size: 1,
    files: 1,
    children: [],
  },
  category: "other",
  depth: 3,
  x0: 0,
  y0: 0,
  x1: 60,
  y1: 30,
  slot: 14,
});

/** A canvas context that records what it draws, and at what alpha. */
function testContext(alpha = 1) {
  const drawn: { image: unknown; x: number; y: number; alpha: number }[] = [];
  const context = {
    globalAlpha: alpha,
    drawImage(image: unknown, x: number, y: number) {
      drawn.push({ image, x, y, alpha: context.globalAlpha });
    },
  };
  return { context, drawn };
}

describe("iconPaint", () => {
  const url = (name: string) => `pith://app/icon/1/dark/14@2x/item/${name}.png`;

  test("draws the icons that have loaded at once, and asks once for each that hasn't", () => {
    const { icons, requested } = testIcons({ [url("Loaded")]: "loaded" });
    const { context, drawn } = testContext();
    const paint = iconPaint(icons, 2);
    paint.draw(context, folder("Loaded"), 4, 3, 14);
    paint.draw(context, folder("Missing"), 70, 3, 14);
    // Blocks can share an icon, as folders where macOS guards share a plain folder's while it's asking.
    paint.draw(context, folder("Missing"), 140, 3, 14);
    assert.deepEqual(drawn, [{ image: "loaded", x: 4, y: 3, alpha: 1 }]);
    assert.deepEqual(requested, [], "asked once the paint is done");
    const waiting = paint.done();
    assert.deepEqual(requested, [url("Missing")]);
    assert.deepEqual(
      waiting.map((icon) => [icon.url, icon.x]),
      [
        [url("Missing"), 70],
        [url("Missing"), 140],
      ],
    );
  });

  test("leaves a refused icon's room empty, and neither waits for it nor asks again", () => {
    const { icons, requested } = testIcons({}, [url("Refused")]);
    const { context, drawn } = testContext();
    const paint = iconPaint(icons, 2);
    paint.draw(context, folder("Refused"), 4, 3, 14);
    assert.deepEqual(paint.done(), []);
    assert.deepEqual(requested, []);
    assert.deepEqual(drawn, []);
  });

  test("leaves a tile without an icon alone, and keeps the alpha its block was drawn at", () => {
    const { icons, requested } = testIcons();
    const { context } = testContext(0.2);
    const paint = iconPaint(icons, 2);
    paint.draw(context, { ...folder("x"), kind: "group" } as Tile, 4, 3, 14);
    paint.draw(context, folder("Dim"), 4, 3, 14);
    assert.deepEqual(
      paint.done().map((icon) => icon.alpha),
      [0.2],
    );
    assert.deepEqual(requested, [url("Dim")]);
  });
});

describe("iconArrivals", () => {
  const waiting = (name: string, x: number) => ({
    url: `pith://app/icon/1/dark/14@2x/item/${name}.png`,
    x,
    y: 3,
    size: 14,
    alpha: 1,
  });

  test("paints the icons that arrive once, on the next frame, however many came before it", () => {
    const { icons, arrive } = testIcons();
    const { frames, pending, run } = testFrames();
    const painted: [string, unknown][] = [];
    const left = [waiting("a", 4), waiting("b", 70), waiting("c", 140)];
    iconArrivals(left, icons, frames, (icon, image) =>
      painted.push([icon.url, image]),
    );
    arrive(left[0].url, "a");
    arrive(left[1].url, "b");
    arrive("pith://app/icon/1/dark/16@2x/type/pdf.png", "a list's icon");
    assert.equal(pending.size, 1, "one frame for every arrival");
    run();
    assert.deepEqual(painted, [
      [left[0].url, "a"],
      [left[1].url, "b"],
    ]);
    // The last one comes later, on a frame of its own.
    arrive(left[2].url, "c");
    run();
    assert.deepEqual(painted.at(-1), [left[2].url, "c"]);
    assert.equal(painted.length, 3);
  });

  test("leaves a failed icon's room empty, waits for it no more, and stops once the rest have come", () => {
    const { icons, arrive, listeners } = testIcons();
    const { frames, pending, run } = testFrames();
    const painted: string[] = [];
    const left = [waiting("a", 4), waiting("refused", 70)];
    iconArrivals(left, icons, frames, (icon) => painted.push(icon.url));
    // A failed load tells the listeners too, but has no image to paint.
    arrive(left[1].url);
    run();
    assert.deepEqual(painted, []);
    assert.equal(listeners.size, 1, "the other icon is still coming");
    arrive(left[0].url, "a");
    run();
    assert.deepEqual(painted, [left[0].url]);
    // Later changes to the cache, as a list's icons loading, cost no frame.
    assert.equal(listeners.size, 0);
    arrive("pith://app/icon/1/dark/16@2x/type/pdf.png", "a list's icon");
    assert.equal(pending.size, 0);
  });

  test("lets go when every icon it waited for has been painted", () => {
    const { icons, arrive, listeners } = testIcons();
    const { frames, run } = testFrames();
    const left = [waiting("a", 4)];
    iconArrivals(left, icons, frames, () => {});
    arrive(left[0].url, "a");
    run();
    assert.equal(listeners.size, 0);
  });

  test("stops, frame and all, when the map paints again", () => {
    const { icons, arrive, listeners } = testIcons();
    const { frames, pending, run } = testFrames();
    const painted: string[] = [];
    const left = [waiting("a", 4)];
    const stop = iconArrivals(left, icons, frames, (icon) =>
      painted.push(icon.url),
    );
    arrive(left[0].url, "a");
    assert.equal(pending.size, 1);
    stop();
    assert.equal(pending.size, 0);
    assert.equal(listeners.size, 0);
    run();
    assert.deepEqual(painted, []);
  });
});

/** A 2D context that records the calls drawing marks makes. */
function recordingContext() {
  const calls: unknown[][] = [];
  const context = {
    globalAlpha: 1,
    fillStyle: "",
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    translate: (x: number, y: number) => calls.push(["translate", x, y]),
    scale: (x: number, y: number) => calls.push(["scale", x, y]),
    setTransform: (...matrix: number[]) =>
      calls.push(["setTransform", ...matrix]),
    fill: (path: { d: string }, rule: string) =>
      calls.push(["fill", path.d, rule, context.fillStyle]),
    drawImage: (image: unknown, ...box: number[]) =>
      calls.push(["drawImage", image, ...box, context.globalAlpha]),
  };
  return { calls, context: context as unknown as CanvasRenderingContext2D };
}

describe("drawing marks", () => {
  // Node has no canvas paths: a stand-in that keeps its path data, as the browser's would.
  (globalThis as { Path2D?: unknown }).Path2D = class {
    readonly d: string;
    constructor(d: string) {
      this.d = d;
    }
  };
  const metrics = { charWidth: 6, lineHeight: 13, padX: 4, padY: 3 };
  const at = <T extends Tile>(tile: T): T => ({
    ...tile,
    x0: 10,
    y0: 20,
    x1: 110,
    y1: 60,
  });
  const clip: Tile = at({
    kind: "file",
    node: { kind: "file", name: "clip.mov", path: "/r/clip.mov", size: 1 },
    category: "video",
    depth: 1,
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0,
    slot: 14,
  });

  test("draws a file's kind glyph in its label's ink, at the start of its first label line", () => {
    const { calls, context } = recordingContext();
    drawMark(context, clip, metrics, null, "ink");
    assert.deepEqual(calls, [
      ["save"],
      // 4 px of padding in, and centred on the first line, 10 px down: the 14 px square's top is 3 px down.
      ["translate", 14, 23],
      ["scale", 14 / 16, 14 / 16],
      ...KIND_GLYPHS.video.map(({ d, evenOdd }) => [
        "fill",
        d,
        evenOdd ? "evenodd" : "nonzero",
        "ink",
      ]),
      ["restore"],
    ]);
  });

  test("draws any other tile's icon at the same place, through the paint's icons", () => {
    const url = "pith://app/icon/1/dark/14@2x/item/shots.png";
    const { icons } = testIcons({ [url]: "folder icon" });
    const { calls, context } = recordingContext();
    drawMark(context, at(folder("shots")), metrics, iconPaint(icons, 2), "ink");
    assert.deepEqual(calls, [["drawImage", "folder icon", 14, 23, 14, 14, 1]]);
    // A header's 12 px icon is centred on its 16 px strip.
    const header: Tile = {
      kind: "folder",
      node: {
        kind: "dir",
        name: "src",
        path: "/r/src",
        size: 1,
        files: 1,
        children: [],
      },
      header: 16,
      children: [],
      depth: 2,
      x0: 10,
      y0: 20,
      x1: 110,
      y1: 60,
      slot: 12,
    };
    const headerURL = "pith://app/icon/1/dark/12@2x/item/src.png";
    const drawn = recordingContext();
    drawMark(
      drawn.context,
      header,
      metrics,
      iconPaint(testIcons({ [headerURL]: "src icon" }).icons, 2),
      "ink",
    );
    assert.deepEqual(drawn.calls, [
      ["drawImage", "src icon", 14, 23, 12, 12, 1],
    ]);
  });

  test("draws nothing for a tile its layout kept no room for", () => {
    const { calls, context } = recordingContext();
    const { slot: _, ...plain } = clip;
    drawMark(context, plain as Tile, metrics, null, "ink");
    assert.deepEqual(calls, []);
  });

  test("paints an icon that came late into its room, at its block's alpha and the canvas's scale", () => {
    const { calls, context } = recordingContext();
    const canvas = {
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    paintArrived(
      canvas,
      2,
      { url: "u", x: 14, y: 23, size: 14, alpha: 0.2 },
      "icon" as unknown as CanvasImageSource,
    );
    assert.deepEqual(calls, [
      ["save"],
      ["setTransform", 2, 0, 0, 2, 0, 0],
      ["drawImage", "icon", 14, 23, 14, 14, 0.2],
      ["restore"],
    ]);
  });
});
