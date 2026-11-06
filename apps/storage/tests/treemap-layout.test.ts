import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type CollapsedTile,
  dominantCategory,
  type FileTile,
  folderToOpenAt,
  GAP,
  groupName,
  headerLabel,
  kindBytesByFolder,
  layoutTreemap,
  MIN_TILE,
  type Tile,
  type TreemapLayout,
  tileAt,
  tileForPath,
  tileLabel,
} from "../src/lib/treemap-layout.ts";
import type {
  AggregateNode,
  DirNode,
  FileNode,
  TreeNode,
} from "../src/lib/types.ts";

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function dir(path: string, children: TreeNode[]): DirNode {
  const size = children.reduce((sum, child) => sum + child.size, 0);
  return { kind: "dir", name: nameOf(path), path, size, children };
}

function file(path: string, size: number): FileNode {
  return { kind: "file", name: nameOf(path), path, size };
}

/** The scanner's own "(smaller items)" node. */
function smaller(parent: string, size: number): AggregateNode {
  return {
    kind: "aggregate",
    name: "(smaller items)",
    path: `${parent}/__other__`,
    size,
  };
}

function layout(root: DirNode, width: number, height: number) {
  return layoutTreemap(root, width, height, kindBytesByFolder(root));
}

function allTiles(tiles: readonly Tile[]): Tile[] {
  return tiles.flatMap((tile) =>
    tile.kind === "folder" ? [tile, ...allTiles(tile.children)] : [tile],
  );
}

const area = (t: Tile) => (t.x1 - t.x0) * (t.y1 - t.y0);
const drawnWidth = (t: Tile) => t.x1 - t.x0 - GAP;
const drawnHeight = (t: Tile) => t.y1 - t.y0 - GAP;
const centre = (t: Tile) => [(t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2] as const;

function only<T extends Tile["kind"]>(
  map: TreemapLayout,
  kind: T,
  path: string,
): Extract<Tile, { kind: T }> {
  const found = allTiles(map.tiles).find(
    (t) => t.kind === kind && t.kind !== "group" && t.node.path === path,
  );
  assert.ok(found, `expected a ${kind} tile for ${path}`);
  return found as Extract<Tile, { kind: T }>;
}

describe("layoutTreemap", () => {
  test("fills the whole area with whole-pixel tiles sized by bytes", () => {
    const root = dir("/r", [
      file("/r/a.mov", 600),
      file("/r/b.mov", 300),
      file("/r/c.mov", 100),
    ]);
    const map = layout(root, 100, 100);
    assert.equal(map.tiles.length, 3);
    assert.equal(
      map.tiles.reduce((sum, t) => sum + area(t), 0),
      100 * 100,
    );
    for (const tile of map.tiles) {
      assert.ok(tile.kind === "file");
      for (const edge of [tile.x0, tile.y0, tile.x1, tile.y1]) {
        assert.ok(Number.isInteger(edge), `${edge} is a whole pixel`);
      }
      // Rounding to whole pixels moves each edge by at most half a pixel.
      const expected = (tile.node.size / root.size) * 100 * 100;
      const slack = tile.x1 - tile.x0 + (tile.y1 - tile.y0);
      assert.ok(Math.abs(area(tile) - expected) <= slack);
    }
  });

  test("merges siblings too small for a tile into one group, placed last", () => {
    const tiny = Array.from({ length: 50 }, (_, i) =>
      file(`/r/note-${i}.txt`, 100),
    );
    const root = dir("/r", [file("/r/big.mov", 1_000_000), ...tiny]);
    const map = layout(root, 400, 300);
    assert.deepEqual(
      map.tiles.map((t) => t.kind),
      ["file", "group"],
    );
    const group = map.tiles[1];
    assert.ok(group.kind === "group");
    assert.equal(group.count, 50);
    assert.equal(group.size, 5000);
    assert.equal(group.partial, false);
    assert.equal(groupName(group), "50 smaller items");
  });

  test("folds the scanner's grouped items into the group and marks it partial", () => {
    const root = dir("/r", [
      file("/r/big.mov", 1_000_000),
      smaller("/r", 200_000),
      file("/r/a.txt", 100),
      file("/r/b.txt", 100),
    ]);
    const group = layout(root, 400, 300).tiles.find((t) => t.kind === "group");
    assert.ok(group?.kind === "group");
    assert.equal(group.count, 2);
    assert.equal(group.size, 200_200);
    assert.equal(group.partial, true);
    assert.equal(groupName(group), "2+ smaller items");

    const onlyScanner = dir("/s", [
      file("/s/big.mov", 1000),
      smaller("/s", 500),
    ]);
    const alone = layout(onlyScanner, 400, 300).tiles.find(
      (t) => t.kind === "group",
    );
    assert.ok(alone?.kind === "group");
    assert.equal(groupName(alone), "Smaller items");
  });

  test("draws a lone small item as itself rather than a group of one", () => {
    const root = dir("/r", [
      file("/r/a.mov", 5000),
      file("/r/b.mov", 4950),
      file("/r/tiny.txt", 50),
    ]);
    const tiles = layout(root, 100, 100).tiles;
    // Whether the tiny file keeps a whole pixel depends on rounding; it's never a group.
    assert.ok(tiles.length >= 2);
    assert.ok(tiles.every((t) => t.kind === "file"));
  });

  test("keeps every tile but the group at least MIN_TILE on each side", () => {
    const files = Array.from({ length: 200 }, (_, i) =>
      file(`/r/f-${i}.bin`, Math.round(1e9 / (i + 1) ** 1.5)),
    );
    const map = layout(dir("/r", files), 300, 200);
    const tiles = allTiles(map.tiles);
    assert.ok(tiles.some((t) => t.kind === "group"));
    for (const tile of tiles) {
      if (tile.kind === "group") continue;
      assert.ok(
        drawnWidth(tile) >= MIN_TILE && drawnHeight(tile) >= MIN_TILE,
        `${drawnWidth(tile)}×${drawnHeight(tile)} is below the minimum tile`,
      );
    }
  });

  test("gives the top two folder levels a header and draws the third as blocks", () => {
    const root = dir("/r", [
      dir("/r/a", [
        dir("/r/a/b", [
          dir("/r/a/b/c", [
            file("/r/a/b/c/x.png", 500),
            file("/r/a/b/c/y.png", 500),
          ]),
          file("/r/a/b/clip.mov", 1000),
        ]),
        file("/r/a/z.txt", 1000),
      ]),
    ]);
    const map = layout(root, 600, 400);
    const a = only(map, "folder", "/r/a");
    const b = only(map, "folder", "/r/a/b");
    const c = only(map, "collapsed", "/r/a/b/c");
    assert.deepEqual([a.depth, b.depth, c.depth], [1, 2, 3]);
    assert.ok(a.header > b.header && b.header > 0);
    assert.equal(c.category, "image");
    // Contents sit inside their folder, below its header.
    for (const child of a.children) {
      assert.ok(child.y0 >= a.y0 + a.header && child.y1 <= a.y1);
      assert.ok(child.x0 > a.x0 && child.x1 < a.x1);
    }
  });

  test("draws a folder too small for a header and contents as one block", () => {
    const root = dir("/r", [
      file("/r/big.mov", 1_000_000),
      dir("/r/shots", [
        file("/r/shots/a.png", 3000),
        file("/r/shots/b.png", 3000),
      ]),
    ]);
    const shots = only(layout(root, 300, 200), "collapsed", "/r/shots");
    assert.equal(shots.category, "image");
  });

  test("returns no tiles when there is nothing to draw", () => {
    assert.deepEqual(layout(dir("/r", []), 300, 200).tiles, []);
    assert.deepEqual(
      layout(dir("/r", [file("/r/a.mov", 10)]), 0, 200).tiles,
      [],
    );
  });
});

describe("kindBytesByFolder and dominantCategory", () => {
  const root = dir("/r", [
    file("/r/a.png", 700),
    smaller("/r", 50),
    dir("/r/src", [file("/r/src/main.ts", 200), file("/r/src/README", 25)]),
  ]);
  const bytes = kindBytesByFolder(root);

  test("totals each folder's bytes by kind, scanner groups apart", () => {
    const top = bytes.get(root);
    assert.ok(top);
    assert.equal(top.image, 700);
    assert.equal(top.code, 200);
    assert.equal(top.other, 25);
    assert.equal(top.grouped, 50);
    assert.equal(
      Object.values(top).reduce((sum, n) => sum + n, 0),
      root.size,
    );
    assert.equal(bytes.get(root.children[2] as DirNode)?.code, 200);
  });

  test("names the kind with the most bytes, ignoring unknown groups", () => {
    const top = bytes.get(root);
    assert.ok(top);
    assert.equal(dominantCategory(top), "image");
    const grouped = dir("/g", [smaller("/g", 10)]);
    const groupedBytes = kindBytesByFolder(grouped).get(grouped);
    assert.ok(groupedBytes);
    assert.equal(dominantCategory(groupedBytes), "other");
  });
});

describe("tileAt and tileForPath", () => {
  const tiny = Array.from({ length: 100 }, (_, i) =>
    file(`/r/a/tiny-${i}.txt`, 10),
  );
  const root = dir("/r", [
    dir("/r/a", [
      dir("/r/a/b", [
        dir("/r/a/b/c", [file("/r/a/b/c/x.png", 5000)]),
        file("/r/a/b/clip.mov", 9000),
      ]),
      file("/r/a/z.txt", 8000),
      ...tiny,
      smaller("/r/a", 2),
    ]),
    file("/r/top.mov", 20_000),
  ]);
  const map = layout(root, 600, 400);
  const a = only(map, "folder", "/r/a");
  const b = only(map, "folder", "/r/a/b");
  const c = only(map, "collapsed", "/r/a/b/c");
  const group = a.children.find((t) => t.kind === "group");

  test("finds the deepest tile under a point, and a folder from its header", () => {
    assert.equal(tileAt(map, a.x0 + 3, a.y0 + 3), a);
    assert.equal(tileAt(map, b.x0 + 3, b.y0 + 3), b);
    assert.equal(tileAt(map, ...centre(c)), c);
    assert.equal(tileAt(map, -1, -1), null);
  });

  test("opens the folder under the pointer, or the folder holding a block", () => {
    assert.equal(folderToOpenAt(map, ...centre(c)), c.node);
    assert.equal(folderToOpenAt(map, b.x0 + 3, b.y0 + 3), b.node);
    const clip = only(map, "file", "/r/a/b/clip.mov");
    assert.equal(folderToOpenAt(map, ...centre(clip)), b.node);
    assert.ok(group);
    assert.equal(folderToOpenAt(map, ...centre(group)), a.node);
    // A file directly in the map's folder has nothing further to open.
    const top = only(map, "file", "/r/top.mov");
    assert.equal(folderToOpenAt(map, ...centre(top)), null);
  });

  test("resolves a path to its tile, or to the tile that holds it", () => {
    assert.equal(tileForPath(map, "/r/a/b"), b);
    assert.equal(tileForPath(map, "/r/a/b/c/x.png"), c);
    assert.ok(group);
    assert.equal(tileForPath(map, "/r/a/tiny-7.txt"), group);
    // Files the scanner folded away are somewhere in the group.
    assert.equal(tileForPath(map, "/r/a/unlisted.bin"), group);
    assert.equal(tileForPath(map, "/r"), null);
    assert.equal(tileForPath(map, "/elsewhere/x"), null);
    assert.equal(tileForPath(map, "/r/a-sibling"), null);
  });
});

describe("labels", () => {
  const metrics = { charWidth: 6, lineHeight: 13, padX: 4, padY: 3 };
  const tile = (x1: number, y1: number, size = 1_288_490_189): FileTile => ({
    kind: "file",
    node: file("/r/before-app-review-screenshot.png", size),
    category: "image",
    depth: 1,
    x0: 0,
    y0: 0,
    x1,
    y1,
  });

  test("shows name and size on two lines when the tile is tall enough", () => {
    assert.deepEqual(tileLabel(tile(220, 60), metrics), {
      name: "before-app-review-screenshot.png",
      size: "1.20 GB",
      lines: 2,
    });
  });

  test("fits name and size on one line in a short tile, cutting the name", () => {
    assert.deepEqual(tileLabel(tile(160, 22), metrics), {
      name: "before-a…shot.png",
      size: "1.20 GB",
      lines: 1,
    });
  });

  test("drops the size before the name, then the label", () => {
    assert.deepEqual(tileLabel(tile(70, 22), metrics), {
      name: "befor….png",
      size: null,
      lines: 1,
    });
    assert.equal(tileLabel(tile(20, 60), metrics), null);
    assert.equal(tileLabel(tile(200, 12), metrics), null);
  });

  test("never cuts a name below four of its own characters", () => {
    // 33 px holds four characters: "befo…" would say nothing.
    assert.equal(tileLabel(tile(33, 60), metrics), null);
    const tsc: FileTile = { ...tile(33, 60), node: file("/r/tsc", 23_698_310) };
    assert.equal(tileLabel(tsc, metrics)?.name, "tsc");
  });

  const folder = (name: string, x1: number): CollapsedTile => ({
    kind: "collapsed",
    node: dir(`/r/${name}`, [file(`/r/${name}/a.js`, 4096)]),
    category: "code",
    depth: 3,
    x0: 0,
    y0: 0,
    x1,
    y1: 60,
  });

  test("marks folders with a trailing slash and cuts them at the end", () => {
    assert.equal(
      tileLabel(folder("node_modules", 200), metrics)?.name,
      "node_modules/",
    );
    // A folder's name starts with what tells it apart: "@biomejs+c…", not "@bio…6.4".
    assert.equal(
      tileLabel(folder("@biomejs+cli-darwin-arm64@2.6.4", 81), metrics)?.name,
      "@biomejs+c…/",
    );
  });

  test("shortens a group's name before cutting it", () => {
    const group: Tile = {
      kind: "group",
      parent: dir("/r", []),
      size: 187_695_104,
      count: 253,
      partial: true,
      depth: 2,
      x0: 0,
      y0: 0,
      x1: 81,
      y1: 60,
    };
    assert.equal(tileLabel(group, metrics)?.name, "253+ items");
    assert.equal(
      tileLabel({ ...group, x1: 200 }, metrics)?.name,
      "253+ smaller items",
    );
    assert.equal(tileLabel({ ...group, x1: 45 }, metrics), null);
  });

  test("puts a folder's name and size in its header", () => {
    const root = dir("/r", [
      dir("/r/apps", [file("/r/apps/a.mov", 900), file("/r/apps/b.mov", 600)]),
    ]);
    const apps = only(layout(root, 400, 300), "folder", "/r/apps");
    assert.deepEqual(headerLabel(apps, metrics), {
      name: "apps",
      size: "1.46 KB",
    });
  });
});
