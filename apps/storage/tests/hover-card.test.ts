import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type CardContext,
  describe as describeCard,
} from "../src/components/hover-card.ts";
import {
  kindBytesByFolder,
  layoutTreemap,
  type Tile,
} from "../src/lib/treemap-layout.ts";
import type { DirNode, FileNode, VolumeNode } from "../src/lib/types.ts";

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function dir(
  path: string,
  children: (DirNode | FileNode | VolumeNode)[],
): DirNode {
  return {
    kind: "dir",
    name: nameOf(path),
    path,
    size: children.reduce((sum, child) => sum + child.size, 0),
    files: children.filter((child) => child.kind === "file").length,
    children,
  };
}

const file = (path: string, size: number): FileNode => ({
  kind: "file",
  name: nameOf(path),
  path,
  size,
});

// A volume's root with one item of every kind a block can show, and 5,000 bytes the scan couldn't measure.
const users = dir("/Users", [file("/Users/a.mov", 4000)]);
const xcode = dir("/Xcode.app", [file("/Xcode.app/Xcode", 3000)]);
const tiny = dir("/tiny", [file("/tiny/t.txt", 10)]);
const disk = file("/big.dmg", 3000);
const preboot: VolumeNode = {
  kind: "volume",
  name: "Preboot",
  path: "/Preboot",
  size: 1000,
  sharesDisk: true,
};
const root = dir("/", [users, xcode, tiny, disk, preboot]);
const layout = layoutTreemap(
  root,
  400,
  300,
  kindBytesByFolder(root),
  undefined,
  undefined,
  { unmeasured: 5000, used: root.size + 5000 },
);

const box = { x0: 0, y0: 0, x1: 120, y1: 90, depth: 1 };
const blocks: readonly Tile[] = [
  { kind: "unmeasured", size: 5000, ...box },
  { kind: "file", node: disk, category: "archive", ...box },
  { kind: "folder", node: users, header: 18, children: [], ...box },
  { kind: "collapsed", node: tiny, category: "document", ...box },
  {
    kind: "package",
    node: xcode,
    category: "binary",
    kindFrom: "name",
    ...box,
  },
  { kind: "volume", node: preboot, ...box },
  { kind: "group", parent: root, size: 10, count: 2, partial: false, ...box },
];

/** A card's context: a double-click there opens Users, and the block grew since Nov 3. */
const context = (
  clicks: boolean,
  hints = true,
  several = false,
): CardContext => ({
  open: users,
  layout,
  hints,
  clicks,
  several,
  change: "+1 KB since Nov 3",
});

const hintOf = (tile: Tile, clicks: boolean, hints = true, several = false) =>
  describeCard(tile, context(clicks, hints, several)).hint;

describe("the hover card's clicks", () => {
  test("says what clicks do while the map takes them", () => {
    assert.deepEqual(
      blocks.map((tile) => hintOf(tile, true)),
      [
        "Space the scan couldn’t see. Click to see why.",
        "Click to select. Double-click to open Users/.",
        "Click to select. Double-click to open.",
        "Click to select. Double-click to open.",
        "Click to select. Double-click to open.",
        "Measured, not scanned: macOS keeps this volume apart from your files.",
        "Too small to show one by one. Double-click to open Users/.",
      ],
    );
  });

  test("says a ⌘-click selects several where the host keeps several, as Pith does, once in each card", () => {
    assert.deepEqual(
      blocks.map((tile) => hintOf(tile, true, true, true)),
      [
        "Space the scan couldn’t see. Click to see why.",
        "Click to select, or ⌘-click to select several. Double-click to open Users/.",
        "Click to select, or ⌘-click to select several. Double-click to open.",
        "Click to select, or ⌘-click to select several. Double-click to open.",
        "Click to select, or ⌘-click to select several. Double-click to open.",
        "Measured, not scanned: macOS keeps this volume apart from your files.",
        "Too small to show one by one. Double-click to open Users/.",
      ],
    );
    // Neither once the person has learned the clicks, nor while the map takes none.
    for (const tile of blocks) {
      assert.doesNotMatch(
        hintOf(tile, true, false, true) ?? "",
        /⌘/,
        tile.kind,
      );
      assert.doesNotMatch(
        hintOf(tile, false, true, true) ?? "",
        /click/i,
        tile.kind,
      );
    }
  });

  test("offers no click while the host takes none, as Pith while a scan runs, and says the rest", () => {
    assert.deepEqual(
      blocks.map((tile) => hintOf(tile, false)),
      [
        "Space the scan couldn’t see.",
        null,
        null,
        null,
        null,
        "Measured, not scanned: macOS keeps this volume apart from your files.",
        "Too small to show one by one.",
      ],
    );
    for (const tile of blocks) {
      for (const hints of [true, false]) {
        assert.doesNotMatch(
          hintOf(tile, false, hints) ?? "",
          /click/i,
          tile.kind,
        );
      }
    }
  });

  test("keeps every other part of the card while the map takes no clicks", () => {
    for (const tile of blocks) {
      const taken = describeCard(tile, context(true));
      const ignored = describeCard(tile, context(false));
      assert.deepEqual(
        { ...ignored, hint: null },
        { ...taken, hint: null },
        tile.kind,
      );
    }
    // The share is of the volume's used space, as with clicks: 5,000 of 16,010 bytes.
    assert.equal(
      describeCard(blocks[0], context(false)).share,
      "31% of used space",
    );
  });

  test("says nothing the person has learned, but still why the Not measured block opens no item", () => {
    assert.deepEqual(
      blocks.map((tile) => hintOf(tile, true, false)),
      [
        "Space the scan couldn’t see. Click to see why.",
        null,
        null,
        null,
        null,
        "Measured, not scanned: macOS keeps this volume apart from your files.",
        null,
      ],
    );
    assert.equal(
      hintOf(blocks[0], false, false),
      "Space the scan couldn’t see.",
    );
  });
});
