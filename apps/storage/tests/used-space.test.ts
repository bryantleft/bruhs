import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readUsedSpace } from "../native-web/used-space.ts";

describe("readUsedSpace", () => {
  test("reads the volume's used space Pith sends with a map of a whole volume", () => {
    assert.deepEqual(readUsedSpace("/", 73_000_000_000, 994_000_000_000), {
      root: "/",
      usedSpace: { unmeasured: 73_000_000_000, used: 994_000_000_000 },
    });
  });

  test("takes nothing for any other map, or figures that can't be a volume's", () => {
    assert.equal(readUsedSpace(null, null, null), null);
    assert.equal(readUsedSpace("/", 0, 994), null, "nothing not measured");
    assert.equal(readUsedSpace("/", 73, null), null, "no used space");
    assert.equal(readUsedSpace("/", 1.5, 994), null, "a fraction of a byte");
    assert.equal(
      readUsedSpace("/", 995, 994),
      null,
      "more not measured than used",
    );
    assert.equal(readUsedSpace(7, 73, 994), null, "no root");
  });
});
