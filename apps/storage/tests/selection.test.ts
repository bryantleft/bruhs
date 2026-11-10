import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { selectionFrom, selectMessage } from "../native-web/selection.ts";

describe("the selection Pith keeps for the map", () => {
  test("is the paths Pith sends, in its order", () => {
    assert.deepEqual(selectionFrom(["/r/b", "/r/a"]), ["/r/b", "/r/a"]);
    assert.deepEqual(selectionFrom([]), []);
  });

  test("takes nothing but absolute paths", () => {
    assert.deepEqual(selectionFrom(null), []);
    assert.deepEqual(selectionFrom("/r/a"), []);
    assert.deepEqual(selectionFrom(["/r/a", 3, "relative", null]), ["/r/a"]);
  });

  test("is asked for by what was clicked: an item, none, or an item to add or take out", () => {
    assert.deepEqual(selectMessage("/r/a", false), {
      action: "select",
      paths: ["/r/a"],
      toggle: false,
    });
    assert.deepEqual(selectMessage(null, false), {
      action: "select",
      paths: [],
      toggle: false,
    });
    assert.deepEqual(selectMessage("/r/a", true), {
      action: "select",
      paths: ["/r/a"],
      toggle: true,
    });
  });
});
