import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { learnedFrom } from "../native-web/hints.ts";
import { NOTHING_LEARNED } from "../src/lib/map-hints.ts";

describe("learnedFrom", () => {
  test("reads the hints Pith keeps in its settings, by name", () => {
    assert.deepEqual(learnedFrom(["selected"], NOTHING_LEARNED), {
      selected: true,
      opened: false,
    });
    assert.deepEqual(learnedFrom(["opened", "selected"], NOTHING_LEARNED), {
      selected: true,
      opened: true,
    });
  });

  test("ignores names it doesn't know and anything that isn't a list of names", () => {
    assert.deepEqual(
      learnedFrom(["hovered", 3, null], NOTHING_LEARNED),
      NOTHING_LEARNED,
    );
    for (const sent of [null, undefined, "selected", { selected: true }, 1]) {
      assert.deepEqual(learnedFrom(sent, NOTHING_LEARNED), NOTHING_LEARNED);
    }
  });

  test("never forgets a hint the page learned before Pith's list came", () => {
    assert.deepEqual(learnedFrom([], { selected: true, opened: false }), {
      selected: true,
      opened: false,
    });
    assert.deepEqual(
      learnedFrom(["opened"], { selected: true, opened: false }),
      { selected: true, opened: true },
    );
  });
});
