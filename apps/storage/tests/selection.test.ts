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
    assert.deepEqual(selectMessage("/r/a"), {
      action: "select",
      paths: ["/r/a"],
      how: "only",
    });
    assert.deepEqual(selectMessage(null), {
      action: "select",
      paths: [],
      how: "only",
    });
    assert.deepEqual(selectMessage("/r/a", "toggle"), {
      action: "select",
      paths: ["/r/a"],
      how: "toggle",
    });
  });

  test("Shift and an arrow key ask for the next item to be added, which a repeat of the key asks again", () => {
    // A toggle would take out the item the last press added, when the key repeats before Pith has answered.
    assert.deepEqual(selectMessage("/r/b", "add"), {
      action: "select",
      paths: ["/r/b"],
      how: "add",
    });
  });
});
