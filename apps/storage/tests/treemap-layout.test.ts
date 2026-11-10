import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type CollapsedTile,
  dominantCategory,
  drawsTheSame,
  type FileTile,
  folderToOpenAt,
  GAP,
  groupName,
  headerLabel,
  kindBytesByFolder,
  layoutTreemap,
  MIN_TILE,
  siblingOrder,
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
  UnreadableNode,
} from "../src/lib/types.ts";

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** Files a folder holds, as the scanner counts them. */
function countFiles(children: readonly TreeNode[]): number {
  return children.reduce(
    (sum, child) =>
      sum +
      (child.kind === "file"
        ? 1
        : child.kind === "dir" || child.kind === "aggregate"
          ? child.files
          : 0),
    0,
  );
}

function dir(path: string, children: TreeNode[]): DirNode {
  const size = children.reduce((sum, child) => sum + child.size, 0);
  return {
    kind: "dir",
    name: nameOf(path),
    path,
    size,
    files: countFiles(children),
    children,
  };
}

function file(path: string, size: number): FileNode {
  return { kind: "file", name: nameOf(path), path, size };
}

/** The scanner's own "(smaller items)" node. */
function smaller(parent: string, size: number): AggregateNode {
  return {
    kind: "aggregate",
    files: 1,
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
      size: "1.29 GB",
      lines: 2,
    });
  });

  test("fits name and size on one line in a short tile, cutting the name", () => {
    assert.deepEqual(tileLabel(tile(160, 22), metrics), {
      name: "before-a…shot.png",
      size: "1.29 GB",
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
      size: "1.50 KB",
    });
  });
});

/** A newer layout of the same folder, given the order the shown one placed its siblings in. */
function relayout(
  previous: TreemapLayout,
  root: DirNode,
  width = previous.width,
  height = previous.height,
) {
  return layoutTreemap(
    root,
    width,
    height,
    kindBytesByFolder(root),
    siblingOrder(previous),
  );
}

/** The names of a folder's items as the layout places them, the group of smaller items left out. */
const names = (tiles: readonly Tile[]) =>
  tiles.flatMap((tile) => (tile.kind === "group" ? [] : [tile.node.name]));

describe("layoutTreemap with the shown layout's order", () => {
  // Two files fill a 100 × 100 map, 10,000 px², so a file of n bytes gets n px², a square n px² on a side.
  const pair = (a: number, b: number) =>
    dir("/r", [file("/r/a.bin", a), file("/r/b.bin", b)]);
  const before = layout(pair(5100, 4900), 100, 100);

  test("keeps a sibling's place while the change in size that would move it can't be seen", () => {
    assert.deepEqual(names(before.tiles), ["a.bin", "b.bin"]);
    // b passes a by 140 bytes: their squares' sides, 70.21 and 71.20 px, differ by less than a pixel.
    const root = pair(4930, 5070);
    assert.deepEqual(names(layout(root, 100, 100).tiles), ["b.bin", "a.bin"]);
    assert.deepEqual(names(relayout(before, root).tiles), ["a.bin", "b.bin"]);
  });

  test("moves a sibling ahead once its square would be a whole pixel wider", () => {
    // 70.21 and 71.21 px.
    assert.deepEqual(names(relayout(before, pair(4929, 5071)).tiles), [
      "b.bin",
      "a.bin",
    ]);
  });

  test("moves a sibling that clearly outgrows another ahead of it", () => {
    assert.deepEqual(names(relayout(before, pair(3000, 7000)).tiles), [
      "b.bin",
      "a.bin",
    ]);
  });

  test("measures the margin at the map's own size", () => {
    // At 1,000 × 1,000 px the same 140 bytes are 9.9 px of side, so b moves ahead.
    const large = layout(pair(5100, 4900), 1000, 1000);
    assert.deepEqual(names(relayout(large, pair(4930, 5070)).tiles), [
      "b.bin",
      "a.bin",
    ]);
  });

  test("places an item it didn't draw before by its size", () => {
    const root = (d: number) =>
      dir("/r", [
        file("/r/a.bin", 5000),
        file("/r/b.bin", 3000),
        file("/r/c.bin", 2000),
        ...(d > 0 ? [file("/r/d.bin", d)] : []),
      ]);
    const shown = layout(root(0), 100, 100);
    assert.deepEqual(names(shown.tiles), ["a.bin", "b.bin", "c.bin"]);
    assert.deepEqual(names(relayout(shown, root(2500)).tiles), [
      "a.bin",
      "b.bin",
      "d.bin",
      "c.bin",
    ]);
  });

  test("keeps the places inside each folder it shows", () => {
    const root = (x: number, y: number) =>
      dir("/r", [
        dir("/r/big", [file("/r/big/x.bin", x), file("/r/big/y.bin", y)]),
        file("/r/other.bin", 4000),
      ]);
    const shown = layout(root(3100, 2900), 400, 300);
    assert.deepEqual(names(only(shown, "folder", "/r/big").children), [
      "x.bin",
      "y.bin",
    ]);
    // y passes x by 2 bytes of the folder's 6,000, a fraction of a pixel of side.
    const next = relayout(shown, root(2999, 3001));
    assert.deepEqual(names(only(next, "folder", "/r/big").children), [
      "x.bin",
      "y.bin",
    ]);
    const fresh = layout(root(2999, 3001), 400, 300);
    assert.deepEqual(names(only(fresh, "folder", "/r/big").children), [
      "y.bin",
      "x.bin",
    ]);
  });

  test("never leaves an item behind one it visibly outgrows", () => {
    // A fixed pseudo-random run: sizes drift from map to map, each laid out with the order of the one before.
    let seed = 7;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    const sizes = Array.from({ length: 12 }, () => 1000 + random() * 9000);
    const root = () =>
      dir(
        "/r",
        sizes.map((size, i) => file(`/r/f-${i}.bin`, Math.round(size))),
      );
    let shown = layout(root(), 300, 200);
    let moved = 0;
    for (let map = 0; map < 200; map++) {
      for (let i = 0; i < sizes.length; i++) sizes[i] *= 0.97 + random() * 0.06;
      const next = relayout(shown, root());
      if (names(next.tiles).join() !== names(shown.tiles).join()) moved += 1;
      const pxPerByte = (300 * 200) / next.root.size;
      const side = (tile: Tile) =>
        Math.sqrt((tile.kind === "file" ? tile.node.size : 0) * pxPerByte);
      const files = next.tiles.filter((tile) => tile.kind === "file");
      files.forEach((later, i) => {
        for (const earlier of files.slice(0, i)) {
          assert.ok(
            side(later) < side(earlier) + 1,
            `${names([later])} is behind ${names([earlier])} by ${side(later) - side(earlier)} px`,
          );
        }
      });
      shown = next;
    }
    // The sizes drift enough that some maps do reorder.
    assert.ok(moved > 0);
  });
});

describe("drawsTheSame", () => {
  const root = (video = 1_288_490_189, extra: TreeNode[] = []) =>
    dir("/r", [
      file("/r/clip.mov", video),
      dir("/r/shots", [
        file("/r/shots/a.png", 300_000_000),
        file("/r/shots/b.png", 200_000_000),
      ]),
      ...extra,
    ]);
  const shown = layout(root(), 400, 300);

  test("holds for a newer map that draws every tile the same", () => {
    assert.equal(drawsTheSame(shown, layout(root(), 400, 300)), true);
    // A byte more moves no edge and prints the same size.
    assert.equal(
      drawsTheSame(shown, layout(root(1_288_490_190), 400, 300)),
      true,
    );
  });

  test("fails for a moved edge, a new size to print, a new name or another map size", () => {
    assert.equal(
      drawsTheSame(shown, layout(root(2_000_000_000), 400, 300)),
      false,
    );
    assert.equal(drawsTheSame(shown, layout(root(), 401, 300)), false);
    const renamed = dir("/r", [
      file("/r/clip.mp4", 1_288_490_189),
      ...root().children.slice(1),
    ]);
    assert.equal(drawsTheSame(shown, layout(renamed, 400, 300)), false);
  });

  test("fails for the same box with another size to print", () => {
    // One file fills the map whatever its size, so only its label changes: 1.29 GB, then 1.30 GB.
    const alone = (size: number) => dir("/r", [file("/r/clip.mov", size)]);
    assert.equal(
      drawsTheSame(
        layout(alone(1_288_490_189), 400, 300),
        layout(alone(1_300_000_000), 400, 300),
      ),
      false,
    );
  });

  test("fails for a folder block that changes colour", () => {
    // A folder too small for its contents is one block, coloured by what it holds most of.
    const holding = (png: number, mov: number) =>
      dir("/r", [
        file("/r/big.bin", 1_000_000),
        dir("/r/mixed", [
          file("/r/mixed/a.png", png),
          file("/r/mixed/b.mov", mov),
        ]),
      ]);
    const images = layout(holding(3001, 2999), 300, 200);
    assert.equal(only(images, "collapsed", "/r/mixed").category, "image");
    const videos = layout(holding(2999, 3001), 300, 200);
    assert.equal(only(videos, "collapsed", "/r/mixed").category, "video");
    assert.equal(drawsTheSame(images, videos), false);
  });

  test("fails for a folder whose card counts another folder inside it that couldn't be read", () => {
    // The scan lists such folders at 0 bytes, so no block moves: only the card's "2 folders inside couldn't be read".
    const locked = (parent: string, count: number): UnreadableNode[] =>
      Array.from({ length: count }, (_, i) => ({
        kind: "unreadable",
        name: `locked-${i}`,
        path: `${parent}/locked-${i}`,
        size: 0,
        reason: "denied",
      }));
    const holding = (inShots: number, inMixed: number) =>
      dir("/r", [
        file("/r/big.bin", 500_000),
        dir("/r/shots", [
          file("/r/shots/a.png", 400_000),
          file("/r/shots/b.png", 100_000),
          ...locked("/r/shots", inShots),
        ]),
        dir("/r/mixed", [
          file("/r/mixed/a.png", 3000),
          file("/r/mixed/b.mov", 3000),
          ...locked("/r/mixed", inMixed),
        ]),
      ]);
    const shown = layout(holding(1, 1), 400, 300);
    assert.equal(only(shown, "folder", "/r/shots").kind, "folder");
    assert.equal(only(shown, "collapsed", "/r/mixed").kind, "collapsed");
    assert.equal(drawsTheSame(shown, layout(holding(1, 1), 400, 300)), true);
    assert.equal(
      drawsTheSame(shown, layout(holding(2, 1), 400, 300)),
      false,
      "a folder drawn around its contents",
    );
    assert.equal(
      drawsTheSame(shown, layout(holding(1, 2), 400, 300)),
      false,
      "a folder drawn as one block",
    );
  });

  test("fails for a group that counts another item", () => {
    const tiny = Array.from({ length: 50 }, (_, i) =>
      file(`/r/note-${i}.txt`, 100),
    );
    const big = file("/r/big.mov", 1_000_000);
    // A byte more in the group prints the same size, 5.00 KB, but "51 smaller items".
    assert.equal(
      drawsTheSame(
        layout(dir("/r", [big, ...tiny]), 400, 300),
        layout(dir("/r", [big, ...tiny, file("/r/dot.txt", 1)]), 400, 300),
      ),
      false,
    );
  });
});
