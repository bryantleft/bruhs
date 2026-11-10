import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type Frames,
  iconArrivals,
  iconPaint,
  type MapIcons,
} from "../src/components/map-marks.ts";
import type { Tile } from "../src/lib/treemap-layout.ts";

/** Icons a test hands out: loaded ones, and the requests and listeners the map makes. */
function testIcons(loaded: Record<string, string> = {}) {
  const images = new Map(Object.entries(loaded));
  const requested: string[] = [];
  const listeners = new Set<() => void>();
  const icons: MapIcons = {
    url: (tile, points, ratio) =>
      tile.kind === "group"
        ? null
        : `pith://app/icon/1/dark/${points}@${ratio}x/item/${tile.node.name}.png`,
    image: (url) =>
      (images.get(url) as unknown as CanvasImageSource | undefined) ?? null,
    request: (url) => {
      requested.push(url);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  /** An icon loads, or fails, and the cache tells its listeners. */
  const arrive = (url: string, image?: string) => {
    if (image !== undefined) images.set(url, image);
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

  test("stops listening once every icon has come, and leaves a failed one's room empty", () => {
    const { icons, arrive, listeners } = testIcons();
    const { frames, pending, run } = testFrames();
    const painted: string[] = [];
    const left = [waiting("a", 4), waiting("refused", 70)];
    iconArrivals(left, icons, frames, (icon) => painted.push(icon.url));
    // A failed load tells the listeners too, but has no image to paint.
    arrive(left[1].url);
    run();
    assert.deepEqual(painted, []);
    arrive(left[0].url, "a");
    run();
    assert.deepEqual(painted, [left[0].url]);
    assert.equal(
      listeners.size,
      1,
      "the refused icon may come under a new rule",
    );
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
