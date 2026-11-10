import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type CollapsedTile,
  dominantCategory,
  drawsTheSame,
  type FileTile,
  type FolderTile,
  folderToOpenAt,
  GAP,
  groupName,
  headerLabel,
  kindBytesByFolder,
  type LabelMarks,
  labelMiddle,
  layoutTreemap,
  MIN_TILE,
  markPlace,
  markRoom,
  type PackageTile,
  padlockRoom,
  siblingOrder,
  type Tile,
  type TreemapLayout,
  tileAt,
  tileForPath,
  tileLabel,
  tileName,
  type UnmeasuredTile,
} from "../src/lib/treemap-layout.ts";
import type {
  AggregateNode,
  DirNode,
  FileNode,
  TreeNode,
  UnreadableNode,
  VolumeNode,
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
    (t) =>
      t.kind === kind &&
      t.kind !== "group" &&
      t.kind !== "unmeasured" &&
      t.node.path === path,
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
  tiles.flatMap((tile) =>
    tile.kind === "group"
      ? []
      : [tile.kind === "unmeasured" ? tileName(tile) : tile.node.name],
  );

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

/** The labels' metrics the tests lay out and cut labels with: 6 px a character, as in the label tests above. */
const METRICS = { charWidth: 6, lineHeight: 13, padX: 4, padY: 3 };

/** `root` laid out for a host that draws `marks` at the start of labels, macOS's icons and kinds' glyphs, with `METRICS`. */
function marked(
  root: DirNode,
  width: number,
  height: number,
  marks: Partial<LabelMarks>,
) {
  return layoutTreemap(
    root,
    width,
    height,
    kindBytesByFolder(root),
    undefined,
    { icons: false, glyphs: false, metrics: METRICS, ...marks },
  );
}

describe("packages", () => {
  const xcode = dir("/r/Xcode.app", [
    dir("/r/Xcode.app/Contents", [
      file("/r/Xcode.app/Contents/Assets.car", 6000),
      file("/r/Xcode.app/Contents/Xcode.icns", 3000),
    ]),
  ]);
  const shots = dir("/r/shots", [
    file("/r/shots/a.png", 4500),
    file("/r/shots/b.png", 4500),
  ]);
  const map = layout(dir("/r", [xcode, shots]), 600, 400);

  test("draws a package as one block, where a folder of the same size holds its contents", () => {
    const app = only(map, "package", "/r/Xcode.app");
    assert.equal(app.node, xcode);
    assert.equal(app.depth, 1);
    assert.equal("children" in app, false);
    assert.equal(only(map, "folder", "/r/shots").children.length, 2);
  });

  test("colours an app as Apps & binaries, and another package by its kind or what it holds most of", () => {
    const root = dir("/r", [
      // An app holds images, Info.plist and its executable, but it's an app.
      dir("/r/Pictures.app", [
        file("/r/Pictures.app/a.png", 9000),
        file("/r/Pictures.app/tool", 1000),
      ]),
      dir("/r/Photos Library.photoslibrary", [
        dir("/r/Photos Library.photoslibrary/originals", [
          file("/r/Photos Library.photoslibrary/originals/IMG_1.heic", 8000),
          file("/r/Photos Library.photoslibrary/originals/IMG_2.mov", 2000),
        ]),
      ]),
      // A disk image's bands have no extension, but the kind table names its own.
      dir("/r/Backup.sparsebundle", [
        dir("/r/Backup.sparsebundle/bands", [
          file("/r/Backup.sparsebundle/bands/0", 5000),
          file("/r/Backup.sparsebundle/bands/1", 5000),
        ]),
      ]),
    ]);
    const map = layout(root, 600, 400);
    const app = only(map, "package", "/r/Pictures.app");
    const library = only(map, "package", "/r/Photos Library.photoslibrary");
    const backup = only(map, "package", "/r/Backup.sparsebundle");
    assert.deepEqual([app.category, app.kindFrom], ["binary", "name"]);
    assert.deepEqual(
      [library.category, library.kindFrom],
      ["image", "contents"],
    );
    assert.deepEqual([backup.category, backup.kindFrom], ["archive", "name"]);
  });

  test("opens a package with a double-click, and finds what's inside it at its block", () => {
    const app = only(map, "package", "/r/Xcode.app");
    assert.equal(tileAt(map, ...centre(app)), app);
    assert.equal(folderToOpenAt(map, ...centre(app)), xcode);
    assert.equal(tileForPath(map, "/r/Xcode.app/Contents/Assets.car"), app);
    // Inside a folder, a double-click on the package opens the package, not the folder around it.
    const inside = layout(
      dir("/r", [dir("/r/Applications", [xcode, shots])]),
      600,
      400,
    );
    const nested = only(inside, "package", "/r/Xcode.app");
    assert.equal(nested.depth, 2);
    assert.equal(folderToOpenAt(inside, ...centre(nested)), xcode);
  });

  test("lays out a package's contents as a folder's once it's open", () => {
    const opened = layout(xcode, 600, 400);
    assert.equal(
      only(opened, "folder", "/r/Xcode.app/Contents").children.length,
      2,
    );
  });

  test("names a package as one thing, without a folder's slash, and keeps its start when cut", () => {
    const metrics = { charWidth: 6, lineHeight: 13, padX: 4, padY: 3 };
    const app = only(map, "package", "/r/Xcode.app");
    assert.equal(tileName(app), "Xcode.app");
    assert.equal(tileName(only(map, "folder", "/r/shots")), "shots/");
    const code: PackageTile = {
      ...app,
      node: dir("/r/Visual Studio Code.app", [
        file("/r/Visual Studio Code.app/Code", 1_288_490_189),
      ]),
      x0: 0,
      y0: 0,
      x1: 120,
      y1: 60,
    };
    assert.deepEqual(tileLabel(code, metrics), {
      name: "Visual Studio Cod…",
      size: "1.29 GB",
      lines: 2,
    });
  });
});

describe("icon slots", () => {
  const metrics = METRICS;
  const root = dir("/r", [
    dir("/r/Applications", [
      dir("/r/Applications/Utilities", [
        dir("/r/Applications/Utilities/Terminal.app", [
          file("/r/Applications/Utilities/Terminal.app/Terminal", 30_000),
        ]),
        file("/r/Applications/Utilities/notes.txt", 20_000),
      ]),
      file("/r/Applications/clip.mov", 40_000),
    ]),
    file("/r/movie.mov", 60_000),
  ]);
  const preboot: VolumeNode = {
    kind: "volume",
    name: "Preboot",
    path: "/r/Preboot",
    size: 1000,
    sharesDisk: true,
  };
  /** What a tile's label says: a header strip's, or a block's. */
  const labelOf = (tile: Tile) =>
    tile.kind === "folder"
      ? headerLabel(tile, metrics)
      : tileLabel(tile, metrics);
  /** `node` alone in a map `width` by `height`, which its block fills: its painted box is the map less the gap. */
  const alone = (
    node: TreeNode,
    width: number,
    height: number,
    marks: Partial<LabelMarks> = { icons: true },
  ) => marked(dir("/r", [node]), width, height, marks).tiles[0];

  test("keeps no room for icons or glyphs for a host that draws neither", () => {
    for (const tile of allTiles(layout(root, 600, 400).tiles)) {
      assert.equal(tile.slot, undefined, tileName(tile));
    }
  });

  test("puts a 14 px icon on a depth-1 header strip and a 12 px one on a depth-2 strip", () => {
    const map = marked(root, 600, 400, { icons: true });
    assert.equal(only(map, "folder", "/r/Applications").slot, 14);
    assert.equal(only(map, "folder", "/r/Applications/Utilities").slot, 12);
  });

  test("puts a header's icon only where the folder's name still fits after it", () => {
    // The padding either side, the icon, its gap, and four characters and an ellipsis: 56 px painted after a 14 px
    // icon, 54 after a 12 px one. A depth-2 folder's box is its parent's less 2 px each side.
    const nested = dir("/r", [
      dir("/r/outer", [
        dir("/r/outer/inner", [
          file("/r/outer/inner/a.mov", 3000),
          file("/r/outer/inner/b.mov", 2000),
        ]),
      ]),
    ]);
    const slots = (width: number) => {
      const map = marked(nested, width, 120, { icons: true });
      return [
        only(map, "folder", "/r/outer").slot,
        only(map, "folder", "/r/outer/inner").slot,
      ];
    };
    assert.deepEqual(slots(56), [undefined, undefined]);
    assert.deepEqual(slots(57), [14, undefined]);
    assert.deepEqual(slots(58), [14, undefined]);
    assert.deepEqual(slots(59), [14, 12]);
  });

  test("gives package, volume and folder blocks a 14 px icon only where their name still fits after it", () => {
    const blocks: [TreeNode, Tile["kind"], number][] = [
      // Four characters and an ellipsis after the icon: 56 px painted.
      [dir("/r/Xcode.app", [file("/r/Xcode.app/Xcode", 1000)]), "package", 57],
      [preboot, "volume", 57],
      // A folder block's name ends in its slash too: 62 px. Too low for a header and its contents, so one block.
      [dir("/r/shots", [file("/r/shots/a.png", 1000)]), "collapsed", 63],
    ];
    for (const [node, kind, width] of blocks) {
      assert.equal(alone(node, width, 21).kind, kind);
      assert.equal(alone(node, width, 21).slot, 14, `${kind} at ${width}`);
      assert.equal(
        alone(node, width - 1, 21).slot,
        undefined,
        `${kind} at ${width - 1}`,
      );
      // 20 px painted holds the icon centred on the label's first line, with the label's padding below.
      assert.equal(
        alone(node, width, 20).slot,
        undefined,
        `${kind} painted 19 high`,
      );
    }
  });

  test("needs 61 px for a package's icon and 67 for a folder block's, in Monaspace at 11 px", () => {
    // Monaspace's advance is 1,240 of 2,000 units to the em: 6.82 px at 11 px.
    const monaspace = { ...METRICS, charWidth: (1240 / 2000) * 11 };
    const xcode = dir("/r/Xcode.app", [file("/r/Xcode.app/Xcode", 1000)]);
    const shots = dir("/r/shots", [file("/r/shots/a.png", 1000)]);
    const slot = (node: TreeNode, painted: number) =>
      alone(node, painted + 1, 21, { icons: true, metrics: monaspace }).slot;
    assert.deepEqual([slot(xcode, 60), slot(xcode, 61)], [undefined, 14]);
    assert.deepEqual([slot(shots, 66), slot(shots, 67)], [undefined, 14]);
  });

  /** Files, packages, folders and a volume, short and long named, which the properties below lay out at every size. */
  const named: TreeNode[] = [
    file("/r/clip.mov", 1000),
    file("/r/a.js", 1000),
    file("/r/before-app-review-screenshot.png", 1000),
    dir("/r/Xcode.app", [file("/r/Xcode.app/Xcode", 1000)]),
    dir("/r/Visual Studio Code.app", [
      file("/r/Visual Studio Code.app/Code", 1000),
    ]),
    dir("/r/src", [file("/r/src/main.ts", 600), file("/r/src/lib.ts", 400)]),
    dir("/r/node_modules", [
      file("/r/node_modules/a.js", 600),
      file("/r/node_modules/b.js", 400),
    ]),
    preboot,
    file("/r/readme.pdf", 1000),
    file("/r/Recording", 1000),
  ];
  /** Every tile of `named` laid out alone, without marks and with `marks`, at widths of 10 to 140 px and some heights. */
  function* sizes(marks: Partial<LabelMarks>) {
    for (const node of named) {
      for (let width = 10; width <= 140; width += 1) {
        for (const height of [15, 19, 20, 21, 26, 33, 40, 60]) {
          yield {
            plain: alone(node, width, height, {}),
            tile: alone(node, width, height, marks),
            at: `${node.name} at ${width} by ${height}`,
          };
        }
      }
    }
  }

  test("keeps every label a block or strip had: an icon goes only where the label still fits after it", () => {
    let marks = 0;
    for (const { plain, tile, at } of sizes({ icons: true })) {
      if (tile.slot !== undefined) marks += 1;
      if (labelOf(plain) !== null) assert.notEqual(labelOf(tile), null, at);
    }
    assert.ok(marks > 1000, "icons were kept where they fit");
  });

  test("with glyphs on, says every file block's kind without colour, giving way only a name cut short of its kind", () => {
    let glyphs = 0;
    for (const { plain, tile, at } of sizes({ glyphs: true })) {
      if (tile.kind !== "file" || plain.kind !== "file") continue;
      const label = tileLabel(tile, metrics);
      const before = tileLabel(plain, metrics);
      const whole = (shown: string) =>
        shown === tile.node.name ||
        (tile.node.name.includes(".") &&
          shown.endsWith(
            tile.node.name.slice(tile.node.name.lastIndexOf(".")),
          ));
      if (tile.slot !== undefined) glyphs += 1;
      // A block with room for a glyph says its kind: with the glyph, or a label with its whole name or extension.
      if (tile.x1 - tile.x0 - GAP >= 22 && tile.y1 - tile.y0 - GAP >= 20) {
        assert.ok(
          tile.slot !== undefined || (label !== null && whole(label.name)),
          at,
        );
      }
      // A label gives way only where it was cut short of the extension.
      if (before !== null && label === null) assert.ok(!whole(before.name), at);
    }
    assert.ok(glyphs > 300, "glyphs were drawn where they fit");
  });

  test("with glyphs on, gives a file block its kind's glyph before its label, or alone where no label fits", () => {
    const clip = file("/r/clip.mov", 1000);
    const glyphs = { glyphs: true };
    // Room for the glyph and four characters and an ellipsis after it.
    assert.equal(alone(clip, 57, 21, glyphs).slot, 14);
    assert.notEqual(labelOf(alone(clip, 57, 21, glyphs)), null);
    // No label fits at all, so the glyph is the only cue but colour: it needs the padding either side, 22 px painted.
    assert.equal(labelOf(alone(clip, 30, 21, {})), null);
    assert.equal(alone(clip, 30, 21, glyphs).slot, 14);
    assert.equal(alone(clip, 23, 21, glyphs).slot, 14);
    assert.equal(alone(clip, 22, 21, glyphs).slot, undefined);
    // A label that fits only without the glyph stays where it says the kind, with the whole name or its extension.
    const script = file("/r/a.js", 1000);
    assert.deepEqual(labelOf(alone(script, 40, 21, {}))?.name, "a.js");
    assert.equal(alone(script, 40, 21, glyphs).slot, undefined);
    // A name cut short of its extension doesn't, so it gives way to the glyph; the card still names it.
    const readme = file("/r/readme.pdf", 1000);
    assert.deepEqual(labelOf(alone(readme, 40, 21, {}))?.name, "read…");
    assert.equal(alone(readme, 40, 21, glyphs).slot, 14);
    assert.equal(labelOf(alone(readme, 40, 21, glyphs)), null);
    // macOS's icons alone never mark a file, and glyphs never mark a folder.
    assert.equal(alone(clip, 57, 21, { icons: true }).slot, undefined);
    const map = marked(root, 600, 400, glyphs);
    assert.equal(only(map, "folder", "/r/Applications").slot, undefined);
    assert.equal(only(map, "file", "/r/movie.mov").slot, 14);
  });

  test("gives the group of smaller items no mark", () => {
    // Each too small for a block of its own, together a sixth of the map.
    const tiny = Array.from({ length: 400 }, (_, i) =>
      file(`/r/note-${i}.txt`, 500),
    );
    const map = marked(
      dir("/r", [file("/r/big.mov", 1_000_000), ...tiny]),
      400,
      300,
      { icons: true, glyphs: true },
    );
    const group = map.tiles.find((tile) => tile.kind === "group");
    assert.ok(group);
    // Painted big enough for any block's mark: a folder block's needs 62 by 20 px with these metrics.
    assert.ok(
      group.x1 - group.x0 - GAP >= 62 && group.y1 - group.y0 - GAP >= 20,
    );
    assert.equal(group.slot, undefined);
  });

  test("puts a mark at the start of its first label line, centred on the line's text", () => {
    const map = marked(root, 600, 400, { icons: true, glyphs: true });
    const outer = only(map, "folder", "/r/Applications");
    const inner = only(map, "folder", "/r/Applications/Utilities");
    const movie = only(map, "file", "/r/movie.mov");
    // A header's text is centred on its strip, 9.5 px down an 18 px strip and 8.5 down a 16 px one; a block's first
    // line, 10 px down, below its 3 px of padding.
    assert.deepEqual(markPlace(outer, metrics), {
      x: outer.x0 + 4,
      y: outer.y0 + 3,
      size: 14,
    });
    assert.deepEqual(markPlace(inner, metrics), {
      x: inner.x0 + 4,
      y: inner.y0 + 3,
      size: 12,
    });
    assert.deepEqual(markPlace(movie, metrics), {
      x: movie.x0 + 4,
      y: movie.y0 + 3,
      size: 14,
    });
    assert.equal(labelMiddle(outer, metrics), outer.y0 + 9.5);
    assert.equal(labelMiddle(movie, metrics), movie.y0 + 10);
    assert.equal(
      markPlace(only(layout(root, 600, 400), "file", "/r/movie.mov"), metrics),
      null,
    );
  });

  test("starts a block's label after its mark, so the two never overlap", () => {
    const app = (x1: number, y1: number, slot?: number): PackageTile => ({
      kind: "package",
      node: dir("/r/Visual Studio Code.app", [
        file("/r/Visual Studio Code.app/Code", 1_288_490_189),
      ]),
      category: "binary",
      kindFrom: "name",
      depth: 1,
      x0: 0,
      y0: 0,
      x1,
      y1,
      ...(slot === undefined ? {} : { slot }),
    });
    // 120 px holds 18 characters, or 15 after a 14 px icon and its gap; the size on the second line keeps the width.
    assert.deepEqual(tileLabel(app(120, 60, 14), metrics), {
      name: "Visual Studio…",
      size: "1.29 GB",
      lines: 2,
    });
    // On one line, name and size share what's left after the icon.
    assert.deepEqual(tileLabel(app(190, 22), metrics), {
      name: "Visual Studio Code.app",
      size: "1.29 GB",
      lines: 1,
    });
    assert.deepEqual(tileLabel(app(190, 22, 14), metrics), {
      name: "Visual Studio Code…",
      size: "1.29 GB",
      lines: 1,
    });
  });

  test("starts a header's label after its icon", () => {
    const apps = (slot?: number): FolderTile => ({
      kind: "folder",
      node: dir("/r/Applications", [file("/r/Applications/a.mov", 1500)]),
      header: 18,
      children: [],
      depth: 1,
      x0: 0,
      y0: 0,
      x1: 140,
      y1: 100,
      ...(slot === undefined ? {} : { slot }),
    });
    assert.deepEqual(headerLabel(apps(), metrics), {
      name: "Applications",
      size: "1.50 KB",
    });
    assert.deepEqual(headerLabel(apps(14), metrics), {
      name: "Applicati…",
      size: "1.50 KB",
    });
  });

  test("draws differently when a mark's room comes or goes", () => {
    const plain = layout(root, 600, 400);
    const icons = marked(root, 600, 400, { icons: true });
    assert.equal(
      drawsTheSame(icons, marked(root, 600, 400, { icons: true })),
      true,
    );
    assert.equal(drawsTheSame(plain, icons), false);
    assert.equal(
      drawsTheSame(
        icons,
        marked(root, 600, 400, { icons: true, glyphs: true }),
      ),
      false,
    );
  });
});

describe("the Not measured block", () => {
  // 10,000 bytes on the map: a folder of two files and two files of its own.
  const root = dir("/", [
    dir("/Users", [file("/Users/a.mov", 4000), file("/Users/b.mov", 2000)]),
    file("/big.dmg", 3000),
    file("/small.bin", 1000),
  ]);
  const measured = (unmeasured?: number, width = 400, height = 300) =>
    layoutTreemap(
      root,
      width,
      height,
      kindBytesByFolder(root),
      undefined,
      undefined,
      unmeasured,
    );
  const blocks = (map: TreemapLayout) =>
    allTiles(map.tiles).filter((tile) => tile.kind === "unmeasured");
  const block = (map: TreemapLayout) => {
    const [found] = blocks(map);
    assert.ok(found, "expected the Not measured block");
    return found as UnmeasuredTile;
  };

  test("lays the map out as before without the bytes it couldn't measure", () => {
    assert.deepEqual(measured(undefined), layout(root, 400, 300));
    assert.deepEqual(measured(0), layout(root, 400, 300));
  });

  test("adds one block at the map's root, taking the share of used space the bytes are", () => {
    // As much again as the map holds: half the used space, so half the map.
    const map = measured(10_000);
    assert.equal(blocks(map).length, 1);
    assert.ok(
      map.tiles.includes(block(map)),
      "a block of the map's own folder",
    );
    assert.equal(block(map).size, 10_000);
    assert.equal(map.unmeasured, 10_000);
    assert.ok(Math.abs(area(block(map)) / (400 * 300) - 0.5) < 0.02);
    // The rest share the other half by bytes, as before.
    const users = only(map, "folder", "/Users");
    assert.ok(Math.abs(area(users) / (400 * 300) - 0.3) < 0.02);
    assert.equal(
      map.tiles.reduce((sum, tile) => sum + area(tile), 0),
      400 * 300,
    );
  });

  test("goes at the root alone: no folder inside gets one", () => {
    for (const tile of blocks(measured(10_000))) assert.equal(tile.depth, 1);
  });

  test("is named Not measured, with its size", () => {
    const map = measured(10_000);
    assert.equal(tileName(block(map)), "Not measured");
    assert.deepEqual(tileLabel(block(map), METRICS), {
      name: "Not measured",
      size: "10.0 KB",
      lines: 2,
    });
  });

  test("is no item: a double-click opens nothing there, and no path leads to it", () => {
    const map = measured(10_000);
    const [x, y] = centre(block(map));
    assert.equal(tileAt(map, x, y), block(map));
    assert.equal(folderToOpenAt(map, x, y), null);
    for (const path of ["/Users", "/Users/a.mov", "/big.dmg", "/elsewhere"]) {
      assert.notEqual(tileForPath(map, path), block(map), path);
    }
  });

  test("keeps its place among the root's items while its change in size can't be seen", () => {
    const before = measured(3010);
    assert.deepEqual(names(before.tiles), [
      "Users",
      "Not measured",
      "big.dmg",
      "small.bin",
    ]);
    // 2,990 bytes would go after /big.dmg's 3,000, but their squares' sides differ by under a pixel.
    assert.deepEqual(names(measured(2990).tiles), [
      "Users",
      "big.dmg",
      "Not measured",
      "small.bin",
    ]);
    const after = layoutTreemap(
      root,
      400,
      300,
      kindBytesByFolder(root),
      siblingOrder(before),
      undefined,
      2990,
    );
    assert.deepEqual(names(after.tiles), names(before.tiles));
  });

  test("draws differently when it comes, goes, or prints another size", () => {
    const shown = measured(10_000);
    assert.equal(drawsTheSame(shown, measured(10_000)), true);
    assert.equal(drawsTheSame(shown, measured(10_001)), true);
    assert.equal(drawsTheSame(shown, measured(undefined)), false);
    assert.equal(drawsTheSame(measured(undefined), shown), false);
    assert.equal(drawsTheSame(shown, measured(14_000)), false);
  });

  test("leaves out a block too small to draw, and the map's items fill the map", () => {
    const map = measured(1);
    assert.equal(blocks(map).length, 0);
    // Its bytes still count in the used space the root's shares are of.
    assert.equal(map.unmeasured, 1);
    assert.equal(
      map.tiles.reduce((sum, tile) => sum + area(tile), 0),
      400 * 300,
    );
  });

  test("keeps no room for a mark: it has no icon and no glyph", () => {
    const map = layoutTreemap(
      root,
      400,
      300,
      kindBytesByFolder(root),
      undefined,
      { icons: true, glyphs: true, metrics: METRICS },
      10_000,
    );
    assert.equal(block(map).slot, undefined);
  });
});

describe("padlocks", () => {
  const locked = (path: string): UnreadableNode => ({
    kind: "unreadable",
    name: nameOf(path),
    path,
    size: 0,
    reason: "protected",
  });
  const root = dir("/r", [
    dir("/r/Users", [
      dir("/r/Users/zoe", [
        file("/r/Users/zoe/a.mov", 3000),
        file("/r/Users/zoe/b.mov", 1000),
        locked("/r/Users/zoe/Documents"),
      ]),
      file("/r/Users/c.mov", 2000),
      locked("/r/Users/Shared"),
    ]),
    dir("/r/Library", [
      dir("/r/Library/Caches", [
        file("/r/Library/Caches/d.bin", 2000),
        file("/r/Library/Caches/e.bin", 1500),
      ]),
      file("/r/Library/f.mov", 1500),
    ]),
  ]);
  const padlocks: Partial<LabelMarks> = { icons: true, padlocks: true };
  /** Every folder drawn as a header strip, with whether it has a padlock. */
  const strips = (map: TreemapLayout) =>
    Object.fromEntries(
      allTiles(map.tiles)
        .filter((tile): tile is FolderTile => tile.kind === "folder")
        .map((tile) => [tile.node.path, tile.padlock === true]),
    );

  test("keeps no padlock for a host that doesn't draw them", () => {
    for (const map of [
      layout(root, 600, 400),
      marked(root, 600, 400, { icons: true }),
    ]) {
      assert.ok(!Object.values(strips(map)).includes(true));
    }
  });

  test("puts one on a depth-1 or depth-2 header whose folder holds folders the scan couldn't read", () => {
    assert.deepEqual(strips(marked(root, 600, 400, padlocks)), {
      "/r/Users": true,
      "/r/Users/zoe": true,
      "/r/Library": false,
      "/r/Library/Caches": false,
    });
  });

  test("puts none on a block: its card counts what couldn't be read", () => {
    // Too small for a header and its contents, so one block.
    const small = dir("/r", [
      file("/r/big.bin", 1_000_000),
      dir("/r/mixed", [file("/r/mixed/a.png", 3000), locked("/r/mixed/x")]),
    ]);
    const map = marked(small, 300, 200, padlocks);
    assert.equal(only(map, "collapsed", "/r/mixed").kind, "collapsed");
    assert.ok(!Object.values(strips(map)).includes(true));
  });

  test("leaves room for the padlock after the name, and the size gives way first", () => {
    const users = (padlock: boolean): FolderTile => ({
      kind: "folder",
      node: root.children[0] as DirNode,
      header: 18,
      children: [],
      depth: 1,
      x0: 0,
      y0: 0,
      x1: 120,
      y1: 100,
      ...(padlock ? { padlock } : {}),
    });
    // 111 px inside the padding: 18 characters, or 16 after the padlock's 12 px.
    assert.deepEqual(headerLabel(users(false), METRICS), {
      name: "Users",
      size: "6.00 KB",
    });
    assert.deepEqual(headerLabel(users(true), METRICS), {
      name: "Users",
      size: "6.00 KB",
    });
    const narrow = (padlock: boolean) => ({ ...users(padlock), x1: 70 });
    // 61 px: 10 characters, or 8 after the padlock: the name keeps its room and the size goes.
    assert.deepEqual(headerLabel(narrow(false), METRICS), {
      name: "Users",
      size: null,
    });
    assert.deepEqual(headerLabel(narrow(true), METRICS), {
      name: "Users",
      size: null,
    });
    assert.equal(padlockRoom(users(true)), 12);
    assert.equal(padlockRoom(users(false)), 0);
  });

  test("goes only where the name still fits beside it, and never takes an icon's place", () => {
    const one = (width: number, marks: Partial<LabelMarks>) =>
      only(marked(root, width, 400, marks), "folder", "/r/Users");
    let kept = 0;
    for (let width = 40; width <= 260; width += 1) {
      const plain = one(width, { icons: true });
      const locked = one(width, padlocks);
      assert.equal(locked.slot, plain.slot, `the icon at ${width}`);
      if (locked.padlock) kept += 1;
      if (headerLabel(plain, METRICS) !== null) {
        assert.notEqual(headerLabel(locked, METRICS), null, `at ${width}`);
      }
      if (locked.padlock) {
        // The padding either side, the icon and its gap, the padlock's room and four characters and an ellipsis.
        const painted = locked.x1 - locked.x0 - GAP;
        assert.ok(
          painted - 2 * METRICS.padX - markRoom(locked) - 12 >=
            5 * METRICS.charWidth,
          `at ${width}`,
        );
      }
    }
    assert.ok(kept > 100, "padlocks were drawn where they fit");
  });

  test("draws differently when a padlock comes or goes", () => {
    const shown = marked(root, 600, 400, padlocks);
    assert.equal(drawsTheSame(shown, marked(root, 600, 400, padlocks)), true);
    assert.equal(
      drawsTheSame(shown, marked(root, 600, 400, { icons: true })),
      false,
    );
  });
});
