import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { grewRows, writersHeading } from "../native-web/grew-since.ts";
import { GREW_SHOWN } from "../native-web/side-lists.ts";

describe("grewRows", () => {
  const changes = new Map([
    ["/Users/bryantle/Documents/bruhs/node_modules", 4_000_000_000],
    [
      "/Users/bryantle/Documents/bruhs/apps/storage/native/.build",
      3_000_000_000,
    ],
    ["/private", 2_000_000_000],
    ["/Users/bryantle/Library/Caches/com.apple.Safari", 1_500_000_000],
    ["/Users/bryantle/Documents/bruhs/target", 1_200_000_000],
    ["/Users/bryantle/Downloads/old.dmg", -900_000_000],
    ["/Applications/Xcode.app", 800_000_000],
  ]);

  test("leads each row with the item's name, the folder it's in after, as Largest files' rows show a file's", () => {
    const [modules, build] = grewRows(changes, "/");
    assert.equal(modules.name, "node_modules");
    assert.equal(modules.folder, "Users/bryantle/Documents/bruhs");
    assert.equal(build.name, ".build");
    assert.equal(
      build.folder,
      "Users/bryantle/Documents/bruhs/apps/storage/native",
    );
    // Opened further down, the folder starts below the open folder, whose own name the path bar shows.
    const [inside] = grewRows(changes, "/Users/bryantle");
    assert.equal(inside.folder, "Documents/bruhs");
  });

  test("an item right in the open folder has its name alone", () => {
    const top = grewRows(changes, "/").find((row) => row.path === "/private");
    assert.deepEqual(
      { name: top?.name, folder: top?.folder },
      { name: "private", folder: null },
    );
    const [bruhs] = grewRows(changes, "/Users/bryantle/Documents/bruhs");
    assert.deepEqual(
      { name: bruhs.name, folder: bruhs.folder },
      { name: "node_modules", folder: null },
    );
  });

  test("gives the growth where Largest files gives the size, and VoiceOver the name, the growth and the folder", () => {
    const [modules] = grewRows(changes, "/");
    assert.equal(modules.figure, "+4.00 GB");
    assert.equal(
      modules.label,
      "node_modules, +4.00 GB, in Users/bryantle/Documents/bruhs",
    );
    const top = grewRows(changes, "/").find((row) => row.path === "/private");
    assert.equal(top?.label, "private, +2.00 GB");
  });

  test("lists only what grew inside the open folder, most first, as many as the section shows", () => {
    const rows = grewRows(changes, "/");
    assert.equal(rows.length, GREW_SHOWN);
    assert.deepEqual(
      rows.map((row) => row.path),
      [
        "/Users/bryantle/Documents/bruhs/node_modules",
        "/Users/bryantle/Documents/bruhs/apps/storage/native/.build",
        "/private",
        "/Users/bryantle/Library/Caches/com.apple.Safari",
        "/Users/bryantle/Documents/bruhs/target",
      ],
    );
    assert.deepEqual(
      grewRows(changes, "/Users/bryantle/Library").map((row) => row.path),
      ["/Users/bryantle/Library/Caches/com.apple.Safari"],
    );
    assert.deepEqual(grewRows(changes, "/Users/bryantle/Downloads"), []);
    assert.deepEqual(
      grewRows(changes, "/Users/bryan"),
      [],
      "a folder whose name only starts the same",
    );
  });
});

describe("writersHeading", () => {
  test("says since then when its stretch begins with Grew since's, whose heading gives the date just above", () => {
    assert.equal(writersHeading("Nov 9"), "Wrote the most since then");
    assert.equal(writersHeading("Nov 9", "Nov 9"), "Wrote the most since then");
  });

  test("gives its own date when Pith's history begins later", () => {
    assert.equal(
      writersHeading("Nov 2", "Nov 6"),
      "Wrote the most since Nov 6",
    );
  });
});
