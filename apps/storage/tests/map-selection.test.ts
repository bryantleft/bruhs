import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  arrowStep,
  rowLabel,
  SELECTED_SAID,
  selectedRow,
  selectionButton,
} from "../src/components/map-selection.ts";
import type { Tile } from "../src/lib/treemap-layout.ts";
import type {
  AggregateNode,
  DirNode,
  FileNode,
  VolumeNode,
} from "../src/lib/types.ts";

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const fileNode = (path: string): FileNode => ({
  kind: "file",
  name: nameOf(path),
  path,
  size: 100,
});

/** A file block at column `x`, row `y` of a grid of 100 px cells. */
const block = (path: string, x: number, y: number): Tile => ({
  kind: "file",
  node: fileNode(path),
  category: "other",
  x0: x * 100,
  y0: y * 100,
  x1: x * 100 + 100,
  y1: y * 100 + 100,
  depth: 1,
});

// a b c
// d   e (the smaller items)
const a = block("/r/a", 0, 0);
const b = block("/r/b", 1, 0);
const c = block("/r/c", 2, 0);
const d = block("/r/d", 0, 1);
const group: Tile = {
  kind: "group",
  parent: {
    kind: "dir",
    name: "r",
    path: "/r",
    size: 500,
    files: 5,
    children: [],
  },
  size: 10,
  count: 2,
  partial: false,
  x0: 200,
  y0: 100,
  x1: 300,
  y1: 200,
  depth: 1,
};
const tiles: readonly Tile[] = [a, b, c, d, group];

const pathOf = (step: ReturnType<typeof arrowStep>) =>
  step &&
  ("select" in step ? `select ${step.select.path}` : `add ${step.add.path}`);

describe("the map's arrow keys", () => {
  test("move the selection to the next item in that direction", () => {
    assert.equal(
      pathOf(arrowStep(tiles, a, "ArrowRight", false, [a])),
      "select /r/b",
    );
    assert.equal(
      pathOf(arrowStep(tiles, a, "ArrowDown", false, [a])),
      "select /r/d",
    );
    assert.equal(
      pathOf(arrowStep(tiles, null, "ArrowRight", false, [])),
      "select /r/a",
      "from nothing, the first item",
    );
  });

  test("with Shift, add the next item in that direction, as Finder's icon view extends a selection", () => {
    assert.equal(
      pathOf(arrowStep(tiles, a, "ArrowRight", true, [a])),
      "add /r/b",
    );
    assert.equal(
      pathOf(arrowStep(tiles, b, "ArrowRight", true, [a, b])),
      "add /r/c",
    );
    assert.equal(
      pathOf(arrowStep(tiles, null, "ArrowDown", true, [])),
      "add /r/a",
      "from nothing, the first item",
    );
  });

  test("with Shift, pass over items already selected, and never add what's no item", () => {
    // b is selected already, so → from a reaches c.
    assert.equal(
      pathOf(arrowStep(tiles, a, "ArrowRight", true, [b, a])),
      "add /r/c",
    );
    // Straight below c are the smaller items, which are no item, nearer than d down to the left: nothing, as for a
    // plain arrow.
    assert.equal(arrowStep(tiles, c, "ArrowDown", true, [c]), null);
    // To the right of a, all but the smaller items are selected.
    assert.equal(arrowStep(tiles, a, "ArrowRight", true, [a, b, c]), null);
  });
});

describe("the add button in the map's list of items", () => {
  const folder: DirNode = {
    kind: "dir",
    name: "Photos",
    path: "/r/Photos",
    size: 10,
    files: 1,
    children: [],
  };
  const smaller: AggregateNode = {
    kind: "aggregate",
    name: "(smaller items)",
    path: "/r/__other__",
    size: 10,
    files: 3,
  };
  const volume: VolumeNode = {
    kind: "volume",
    name: "Preboot",
    path: "/r/Preboot",
    size: 10,
    sharesDisk: true,
  };

  test("adds a file or folder to the selection, or takes it out, saying which", () => {
    assert.deepEqual(selectionButton(folder, false), {
      text: "Add",
      label: "Add Photos to the selection",
    });
    assert.deepEqual(selectionButton(fileNode("/r/a.mov"), true), {
      text: "Take Out",
      label: "Take a.mov out of the selection",
    });
  });

  test("shows for nothing that's no item", () => {
    assert.equal(selectionButton(smaller, false), null);
    assert.equal(selectionButton(volume, false), null);
  });
});

describe("a list row that selects its item", () => {
  test("says its item is selected, and is no toggle, since pressing it selects that item alone", () => {
    assert.deepEqual(selectedRow(true), { "data-selected": "" });
    assert.deepEqual(selectedRow(false), {});
    for (const row of [selectedRow(true), selectedRow(false)]) {
      assert.ok(
        !("aria-pressed" in row),
        "a toggle's state would have VoiceOver announce one",
      );
    }
    assert.equal(
      rowLabel("video.mov, 2.00 MB, in sub", true),
      "video.mov, 2.00 MB, in sub, selected",
    );
    assert.equal(
      rowLabel("video.mov, 2.00 MB, in sub", false),
      "video.mov, 2.00 MB, in sub",
    );
    assert.equal(SELECTED_SAID, ", selected");
  });
});
