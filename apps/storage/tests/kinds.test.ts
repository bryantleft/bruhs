import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { CATEGORY_LABEL, categoryForName } from "../src/lib/format.ts";
import { KIND_GLYPHS } from "../src/lib/kind-glyphs.ts";

/**
 * The scanner tallies grouped files by kind with its own copy of the extension table
 * (scanner/src/kinds.rs). It must say the same as the disk map's, or the legend would
 * count a grouped file as one kind and a listed one as another.
 */
describe("the scanner's kinds", () => {
  const rust = readFileSync(
    new URL("../scanner/src/kinds.rs", import.meta.url),
    "utf8",
  );
  const lists = [...rust.matchAll(/const (\w+): &\[&str\] = &\[(.*?)\];/g)];

  test("list every extension the disk map knows, as the same kind", () => {
    assert.ok(lists.length >= 7);
    for (const [, name, body] of lists) {
      const kind = name.toLowerCase();
      for (const [, ext] of body.matchAll(/"([^"]+)"/g)) {
        // "raw" is in two lists; the map calls it an archive, as the scanner's lookup does.
        if (ext === "raw" && kind === "image") continue;
        assert.equal(categoryForName(`file.${ext}`), kind, `.${ext}`);
      }
    }
  });

  test("leave out nothing the disk map lists", () => {
    const listed = new Set(
      lists.flatMap(([, , body]) =>
        [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
      ),
    );
    const format = readFileSync(
      new URL("../src/lib/format.ts", import.meta.url),
      "utf8",
    );
    for (const [, body] of format.matchAll(/register\("\w+", \[(.*?)\]\);/gs)) {
      for (const [, ext] of body.matchAll(/"([^"]+)"/g)) {
        assert.ok(
          listed.has(ext),
          `.${ext} is missing from scanner/src/kinds.rs`,
        );
      }
    }
  });
});

/**
 * With Differentiate Without Color on, the map and By kind show each kind's glyph, the cue that doesn't need colour,
 * so no two kinds may share one.
 */
describe("the kinds' glyphs", () => {
  test("give every kind a glyph of its own", () => {
    const glyphs = Object.keys(CATEGORY_LABEL).map((kind) =>
      JSON.stringify(KIND_GLYPHS[kind as keyof typeof KIND_GLYPHS]),
    );
    assert.ok(glyphs.every((glyph) => glyph !== undefined && glyph !== "[]"));
    assert.equal(new Set(glyphs).size, glyphs.length);
  });
});
