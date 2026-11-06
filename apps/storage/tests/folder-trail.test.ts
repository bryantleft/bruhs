import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { foldersBetween, retraceFolders } from "../src/lib/folder-trail.ts";
import type { DirNode, TreeNode } from "../src/lib/types.ts";

function dir(path: string, children: TreeNode[]): DirNode {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const size = children.reduce((sum, child) => sum + child.size, 0);
  return { kind: "dir", name, path, size, children };
}

describe("foldersBetween", () => {
  const c = dir("/r/a/b/c", [
    { kind: "file", name: "x", path: "/r/a/b/c/x", size: 1 },
  ]);
  const b = dir("/r/a/b", [c]);
  const a = dir("/r/a", [b, dir("/r/a-b", [])]);
  const root = dir("/r", [dir("/r/a-b", []), a]);

  test("lists each folder from just below `from` down to `to`", () => {
    assert.deepEqual(foldersBetween(root, c), [a, b, c]);
    assert.deepEqual(foldersBetween(root, a), [a]);
    assert.deepEqual(foldersBetween(root, root), []);
  });

  test("refuses a folder that isn't inside `from`", () => {
    assert.throws(() => foldersBetween(b, a), /isn't inside/);
  });
});

describe("retraceFolders", () => {
  const x = { kind: "file", name: "x", path: "/r/a/b/x", size: 1 } as const;
  const b = dir("/r/a/b", [x]);
  const a = dir("/r/a", [b]);
  const root = dir("/r", [a]);

  test("finds the same folders in a new scan of the same root", () => {
    assert.deepEqual(retraceFolders(root, ["/r", "/r/a", "/r/a/b"]), [
      root,
      a,
      b,
    ]);
  });

  test("stops where a folder no longer exists, such as one moved to the Trash", () => {
    assert.deepEqual(
      retraceFolders(root, ["/r", "/r/a", "/r/a/gone", "/r/a/gone/deeper"]),
      [root, a],
    );
  });

  test("starts over at the root for a scan of another folder", () => {
    assert.deepEqual(retraceFolders(root, ["/elsewhere", "/elsewhere/a"]), [
      root,
    ]);
    assert.deepEqual(retraceFolders(root, []), [root]);
  });
});
