import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  endTruncate,
  folderBelow,
  middleTruncate,
  parentFolder,
  splitFolder,
  splitName,
} from "../src/lib/display-names.ts";

describe("middleTruncate", () => {
  test("leaves names that fit alone", () => {
    assert.equal(middleTruncate("report.pdf", 10), "report.pdf");
    assert.equal(middleTruncate("report.pdf", 40), "report.pdf");
  });

  test("cuts the middle and keeps the whole extension", () => {
    assert.equal(
      middleTruncate("before-app-review-screenshot.png", 16),
      "before-a…hot.png",
    );
  });

  test("splits names without an extension evenly, head first", () => {
    assert.equal(middleTruncate("ExpoModulesCore", 10), "ExpoM…Core");
    // A leading dot marks a hidden file, not an extension.
    assert.equal(middleTruncate(".gitignore", 6), ".gi…re");
  });

  test("falls back to cutting the end when the extension can't fit", () => {
    assert.equal(middleTruncate("disk-image.sparsebundle", 8), "disk-im…");
  });

  test("never splits a character from its accent", () => {
    // macOS often stores accented names decomposed: "e" followed by U+0301.
    const decomposed = "café-menu-redesign-final.png";
    const result = middleTruncate(decomposed, 12);
    assert.equal(result, "café-m…l.png");
    assert.equal([...new Intl.Segmenter().segment(result)].length, 12);
  });

  test("returns an ellipsis or nothing when there is almost no room", () => {
    assert.equal(middleTruncate("report.pdf", 1), "…");
    assert.equal(middleTruncate("report.pdf", 0), "");
  });
});

describe("endTruncate", () => {
  test("keeps the start, where a folder's name says what it is", () => {
    assert.equal(
      endTruncate("@biomejs+cli-darwin-arm64@2.6.4", 11),
      "@biomejs+c…",
    );
    assert.equal(endTruncate("node_modules", 12), "node_modules");
    assert.equal(endTruncate("re\u0301sume\u0301s", 4), "re\u0301s…");
    assert.equal(endTruncate("apps", 0), "");
  });

  test("doesn't leave a space before the ellipsis", () => {
    assert.equal(endTruncate("Application Support", 13), "Application…");
    assert.equal(
      middleTruncate("Screen Recording 2026-11-06.mov", 14),
      "Screen…06.mov",
    );
  });
});

describe("splitName", () => {
  test("keeps the extension and a few characters before it in the tail", () => {
    assert.deepEqual(splitName("before-app-review.png"), {
      head: "before-app-rev",
      tail: "iew.png",
    });
  });

  test("keeps the last characters of names without an extension", () => {
    assert.deepEqual(splitName("ExpoModulesCore"), {
      head: "ExpoModules",
      tail: "Core",
    });
  });

  test("doesn't split short names", () => {
    assert.deepEqual(splitName("biome"), { head: "biome", tail: "" });
  });
});

describe("parentFolder", () => {
  test("is the absolute folder", () => {
    assert.equal(parentFolder("/Users/me/Movies/trip.mov"), "/Users/me/Movies");
    assert.equal(parentFolder("/swapfile"), "/");
  });
});

describe("splitFolder", () => {
  test("keeps the last folder whole in the tail", () => {
    assert.deepEqual(splitFolder("bruhs/apps/storage"), {
      head: "bruhs/apps/",
      tail: "storage",
    });
    assert.deepEqual(splitFolder("/"), { head: "", tail: "/" });
    assert.deepEqual(splitFolder("bruhs"), { head: "", tail: "bruhs" });
  });
});

describe("folderBelow", () => {
  test("starts below the folder a list is of, whose own name the path bar shows", () => {
    assert.equal(
      folderBelow("/Users/me/bruhs/apps/storage/a.ts", "/Users/me/bruhs"),
      "apps/storage",
    );
    assert.equal(
      folderBelow("/Users/me/Movies/trip.mov", "/"),
      "Users/me/Movies",
    );
  });

  test("is none for an item right in that folder", () => {
    assert.equal(folderBelow("/Users/me/bruhs/a.ts", "/Users/me/bruhs"), null);
    assert.equal(folderBelow("/swapfile", "/"), null);
  });

  test("is the whole folder for an item outside it", () => {
    assert.equal(folderBelow("/opt/x/a.ts", "/Users/me"), "/opt/x");
    // A sibling whose name starts with the base's name isn't inside it.
    assert.equal(folderBelow("/Users/me2/a.ts", "/Users/me"), "/Users/me2");
  });
});
