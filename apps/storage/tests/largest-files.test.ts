import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { largestFilesIn } from "../src/lib/largest-files.ts";
import type {
  DirNode,
  FileEntry,
  FileNode,
  TreeNode,
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

const entry = (path: string, size: number): FileEntry => ({
  name: nameOf(path),
  path,
  size,
});

describe("largestFilesIn", () => {
  const apps = dir("/r/apps", [file("/r/apps/big.mov", 900)]);
  const root = dir("/r", [apps, file("/r/notes.txt", 50)]);
  // The scan's overall list can hold files its tree folded into "(smaller items)".
  const topFiles = [
    entry("/r/apps/unlisted.bin", 1000),
    entry("/r/apps/big.mov", 900),
    entry("/elsewhere/other.mov", 5000),
  ];

  test("lists files inside the folder, from the scan's list and its tree, largest first", () => {
    assert.deepEqual(
      largestFilesIn(apps, topFiles, 10).map((f) => f.path),
      ["/r/apps/unlisted.bin", "/r/apps/big.mov"],
    );
    assert.deepEqual(
      largestFilesIn(root, topFiles, 10).map((f) => f.path),
      ["/r/apps/unlisted.bin", "/r/apps/big.mov", "/r/notes.txt"],
    );
  });

  test("keeps at most `limit` files", () => {
    assert.equal(largestFilesIn(root, topFiles, 2).length, 2);
  });

  test("treats every absolute path as inside the disk's root", () => {
    const disk = dir("/", [dir("/r", [file("/r/a.mov", 10)])]);
    assert.deepEqual(
      largestFilesIn(disk, topFiles, 10).map((f) => f.path),
      [
        "/elsewhere/other.mov",
        "/r/apps/unlisted.bin",
        "/r/apps/big.mov",
        "/r/a.mov",
      ],
    );
  });
});
