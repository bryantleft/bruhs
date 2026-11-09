import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  folderChain,
  type Navigation,
  NO_MAP,
  navigate,
} from "../native-web/navigation.ts";
import type { DirNode, TreeNode } from "../src/lib/types.ts";

function dir(path: string, children: TreeNode[] = []): DirNode {
  return {
    kind: "dir",
    name: path.slice(path.lastIndexOf("/") + 1),
    path,
    size: children.reduce((sum, child) => sum + child.size, 1),
    files: children.length,
    children,
  };
}

/** /r holding a/b/c and d, as a scan of /r lays it out. */
function map(): DirNode {
  const c = dir("/r/a/b/c");
  const b = dir("/r/a/b", [c]);
  const a = dir("/r/a", [b]);
  return dir("/r", [a, dir("/r/d")]);
}

const here = (state: Navigation) => state.trail.at(-1)?.path;
const paths = (state: Navigation) => state.trail.map((folder) => folder.path);

/** The map of /r, open at its root, as the first payload leaves it. */
function opened(root = map()): Navigation {
  return navigate(NO_MAP, { type: "received", root });
}

/** Each step in turn, as the person takes them, each from where the map is when they take it. */
function walk(state: Navigation, ...steps: string[]): Navigation {
  return steps.reduce(
    (now, path) => navigate(now, { type: "open", path, from: here(now) }),
    state,
  );
}

describe("folderChain", () => {
  test("lists each folder from the root down to the path", () => {
    assert.deepEqual(folderChain("/", "/Users/me"), [
      "/",
      "/Users",
      "/Users/me",
    ]);
    assert.deepEqual(folderChain("/r", "/r/a/b"), ["/r", "/r/a", "/r/a/b"]);
    assert.deepEqual(folderChain("/r", "/r"), ["/r"]);
    assert.deepEqual(folderChain("/", "/"), ["/"]);
  });

  test("refuses a path outside the root, or one that isn't plain", () => {
    assert.equal(folderChain("/r", "/elsewhere"), null);
    assert.equal(folderChain("/r", "/r-b/a"), null);
    assert.equal(folderChain("/r", "/r/a//b"), null);
    assert.equal(folderChain("/r", "/r/a/"), null);
    assert.equal(folderChain("/r", "r/a"), null);
  });
});

describe("navigate", () => {
  test("a first map opens at its root, with nowhere to go back or forward", () => {
    const state = opened();
    assert.deepEqual(paths(state), ["/r"]);
    assert.deepEqual(state.back, []);
    assert.deepEqual(state.forward, []);
  });

  test("opening a folder leaves a step back to where the map was", () => {
    const state = navigate(opened(), { type: "open", path: "/r/a/b" });
    assert.deepEqual(paths(state), ["/r", "/r/a", "/r/a/b"]);
    assert.deepEqual(state.back, ["/r"]);
    assert.deepEqual(state.forward, []);
  });

  test("a folder opened several levels down in one go is one step back", () => {
    // The map opens a folder further down one level at a time, every level from where the map was.
    let state = opened();
    for (const path of ["/r/a", "/r/a/b", "/r/a/b/c"]) {
      state = navigate(state, { type: "open", path, from: "/r" });
    }
    assert.deepEqual(paths(state), ["/r", "/r/a", "/r/a/b", "/r/a/b/c"]);
    assert.deepEqual(state.back, ["/r"]);
  });

  test("each separate step leaves its own step back", () => {
    const state = walk(opened(), "/r/a", "/r/a/b");
    assert.deepEqual(state.back, ["/r", "/r/a"]);
  });

  test("opening the open folder, or one outside the map, changes nothing", () => {
    const state = walk(opened(), "/r/a");
    assert.equal(navigate(state, { type: "open", path: "/r/a" }), state);
    assert.equal(navigate(state, { type: "open", path: "/elsewhere" }), state);
    assert.equal(navigate(NO_MAP, { type: "open", path: "/r/a" }), NO_MAP);
  });

  test("up opens the enclosing folder, as a step back", () => {
    const state = navigate(walk(opened(), "/r/a/b"), { type: "up" });
    assert.deepEqual(paths(state), ["/r", "/r/a"]);
    assert.deepEqual(state.back, ["/r", "/r/a/b"]);
    const root = opened();
    assert.equal(navigate(root, { type: "up" }), root);
  });

  test("back and forward retrace the steps", () => {
    let state = walk(opened(), "/r/a", "/r/a/b");
    state = navigate(state, { type: "back" });
    assert.equal(here(state), "/r/a");
    assert.deepEqual(state.back, ["/r"]);
    assert.deepEqual(state.forward, ["/r/a/b"]);
    state = navigate(state, { type: "back" });
    assert.equal(here(state), "/r");
    assert.deepEqual(state.back, []);
    assert.deepEqual(state.forward, ["/r/a/b", "/r/a"]);
    assert.equal(navigate(state, { type: "back" }), state);
    state = navigate(state, { type: "forward" });
    assert.equal(here(state), "/r/a");
    state = navigate(state, { type: "forward" });
    assert.equal(here(state), "/r/a/b");
    assert.deepEqual(state.back, ["/r", "/r/a"]);
    assert.deepEqual(state.forward, []);
    assert.equal(navigate(state, { type: "forward" }), state);
  });

  test("a new step after going back drops the way forward", () => {
    let state = walk(opened(), "/r/a", "/r/a/b");
    state = navigate(state, { type: "back" });
    state = walk(state, "/r/d");
    assert.deepEqual(state.back, ["/r", "/r/a"]);
    assert.deepEqual(state.forward, []);
  });

  test("a newer map of the same folder keeps the open folder and the steps", () => {
    let state = walk(opened(), "/r/a", "/r/a/b");
    state = navigate(state, { type: "back" });
    const newer = map();
    state = navigate(state, { type: "received", root: newer });
    assert.equal(state.trail[0], newer);
    assert.deepEqual(paths(state), ["/r", "/r/a"]);
    assert.deepEqual(state.back, ["/r"]);
    assert.deepEqual(state.forward, ["/r/a/b"]);
  });

  test("an empty payload keeps the open folders for the next map of the same folder", () => {
    let state = walk(opened(), "/r/a");
    state = navigate(state, { type: "received", root: null });
    assert.deepEqual(state.trail, []);
    assert.deepEqual(state.back, ["/r"]);
    state = navigate(state, { type: "received", root: map() });
    assert.deepEqual(paths(state), ["/r", "/r/a"]);
    assert.deepEqual(state.back, ["/r"]);
  });

  test("a map of another folder starts over at its root", () => {
    let state = walk(opened(), "/r/a");
    state = navigate(state, { type: "back" });
    state = navigate(state, {
      type: "received",
      root: dir("/s", [dir("/s/a")]),
    });
    assert.deepEqual(paths(state), ["/s"]);
    assert.deepEqual(state.back, []);
    assert.deepEqual(state.forward, []);
  });

  test("a folder that went away moves the map up, without a step back to where it lands", () => {
    let state = walk(opened(), "/r/a", "/r/a/b");
    // b is gone: the map falls back to a, and the step back to a would lead nowhere.
    state = navigate(state, {
      type: "received",
      root: dir("/r", [dir("/r/a"), dir("/r/d")]),
    });
    assert.deepEqual(paths(state), ["/r", "/r/a"]);
    assert.deepEqual(state.back, ["/r"]);
  });

  test("going back to a folder the map leaves out opens what it can, then the folder once a map holds it", () => {
    let state = walk(opened(), "/r/a", "/r/a/b", "/r/a/b/c");
    state = walk(state, "/r");
    // The live map leaves out small folders far from the open one: this map stops at a.
    const coarse = dir("/r", [dir("/r/a", [dir("/r/a/x")]), dir("/r/d")]);
    state = navigate(state, { type: "received", root: coarse });
    state = navigate(state, { type: "back" });
    assert.deepEqual(paths(state), ["/r", "/r/a"]);
    assert.deepEqual(state.forward, ["/r"]);
    assert.deepEqual(state.back, ["/r", "/r/a", "/r/a/b"]);
    // The next map shows the open folder in detail, so it holds c.
    state = navigate(state, { type: "received", root: map() });
    assert.deepEqual(paths(state), ["/r", "/r/a", "/r/a/b", "/r/a/b/c"]);
    assert.equal(state.wanted, null);
    assert.deepEqual(state.back, ["/r", "/r/a", "/r/a/b"]);
    assert.deepEqual(state.forward, ["/r"]);
  });

  test("a map that still leaves the folder out keeps it wanted for the next", () => {
    let state = walk(opened(), "/r/a", "/r/a/b", "/r/a/b/c", "/r");
    const coarse = () => dir("/r", [dir("/r/a", [dir("/r/a/x")])]);
    state = navigate(state, { type: "received", root: coarse() });
    state = navigate(state, { type: "back" });
    // A map asked for before the person went back can arrive first.
    state = navigate(state, { type: "received", root: coarse() });
    assert.deepEqual(paths(state), ["/r", "/r/a"]);
    state = navigate(state, { type: "received", root: map() });
    assert.equal(here(state), "/r/a/b/c");
  });

  test("a folder asked for and still missing is given up at the next step", () => {
    let state = walk(opened(), "/r/a", "/r/a/b", "/r/a/b/c", "/r");
    state = navigate(state, {
      type: "received",
      root: dir("/r", [dir("/r/a", [dir("/r/a/x")])]),
    });
    state = navigate(state, { type: "back" });
    assert.notEqual(state.wanted, null);
    state = walk(state, "/r/a/x");
    assert.equal(state.wanted, null);
    state = navigate(state, { type: "received", root: map() });
    assert.equal(here(state), "/r/a");
  });
});
