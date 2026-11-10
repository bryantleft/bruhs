import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  GROUP_KEY,
  type IconItem,
  iconKey,
  itemAt,
  itemKey,
  readIconRule,
} from "../native-web/icon-rule.ts";
import type { DirNode, FileNode, TreeNode } from "../src/lib/types.ts";

/** The table native sends for a test home, and each item's key by Pith's own rule, which IconRuleTests.swift checks too. */
const fixture = JSON.parse(
  readFileSync(new URL("./icon-keys.json", import.meta.url), "utf8"),
) as {
  rule: Record<string, unknown>;
  cases: { why: string; node: IconItem; asking: boolean; key: string }[];
};

/** The fixture's table as native sends it: JSON. */
const sent = (table: unknown = fixture.rule) => JSON.stringify(table);

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function dir(path: string, children: TreeNode[] = []): DirNode {
  return {
    kind: "dir",
    name: nameOf(path),
    path,
    size: children.reduce((sum, child) => sum + child.size, 4096),
    files: children.length,
    children,
  };
}

function file(path: string): FileNode {
  return { kind: "file", name: nameOf(path), path, size: 2_000_000 };
}

describe("iconKey", () => {
  test("gives each item of the fixture the key Pith's own rule gives it", () => {
    const rule = readIconRule(sent());
    assert.ok(rule, "the table native sends");
    assert.ok(fixture.cases.length > 40);
    for (const { why, node, asking, key } of fixture.cases) {
      assert.equal(iconKey(node, { ...rule, asking }), key, why);
    }
  });

  test("gives the map's blocks of smaller items the rule's group key", () => {
    const rule = readIconRule(sent());
    assert.ok(rule);
    assert.equal(
      iconKey({ kind: "aggregate", path: "/Users/x/__other__" }, rule),
      GROUP_KEY,
    );
  });

  test("spells an app's bundle as the route reads it", () => {
    assert.equal(
      itemKey("/Applications/Zo\u00eb's App (Beta).app"),
      "item/%2FApplications%2FZo%C3%AB%27s%20App%20%28Beta%29.app",
    );
    assert.equal(itemKey("/a/\ud800"), "item/%2Fa%2F%EF%BF%BD");
  });
});

describe("readIconRule", () => {
  test("reads the table as native sends it", () => {
    assert.equal(readIconRule(sent())?.asking, false);
    assert.equal(
      readIconRule(sent({ ...fixture.rule, asking: true }))?.asking,
      true,
    );
  });

  test("refuses anything else", () => {
    const [place] = fixture.rule.places as Record<string, unknown>[];
    for (const text of [
      null,
      undefined,
      7,
      "",
      "{",
      "table",
      sent(null),
      sent("table"),
      sent([]),
      sent({ ...fixture.rule, places: undefined }),
      sent({ ...fixture.rule, places: [{ ...place, id: 7 }] }),
      sent({ ...fixture.rule, places: [{ id: "mail" }] }),
      sent({ ...fixture.rule, guarded: ["/Users/x/Documents", 3] }),
      sent({ ...fixture.rule, guarded: "/Users/x/Documents" }),
      sent({ ...fixture.rule, asking: "yes" }),
      sent({ ...fixture.rule, asking: undefined }),
    ]) {
      assert.equal(readIconRule(text), null, String(text));
    }
  });
});

describe("itemAt", () => {
  const home = "/Users/zo\u00eb";
  const rule = readIconRule(sent());
  assert.ok(rule);
  const taxes = dir(`${home}/Documents/Taxes`, [
    file(`${home}/Documents/Taxes/2026.pdf`),
  ]);
  const map = dir(home, [
    dir(`${home}/Documents`, [taxes]),
    dir(`${home}/Projects`, [file(`${home}/Projects/Movie.mov`)]),
  ]);

  test("finds what grew in the map", () => {
    assert.equal(itemAt(map, taxes.path, []), taxes);
    assert.equal(itemAt(map, `${home}/Projects/Movie.mov`, []).kind, "file");
    assert.equal(itemAt(map, home, []), map);
  });

  test("takes a file the map only lists for a file", () => {
    const folded = `${home}/Projects/Folded.zip`;
    assert.equal(
      iconKey(
        itemAt(map, folded, [{ name: "Folded.zip", path: folded, size: 1 }]),
        rule,
      ),
      "type/zip",
    );
  });

  test("gives anything else the rule's key for a folder the map hasn't listed", () => {
    // Where macOS guards, a plain folder: nothing is looked up by a path the map doesn't show.
    assert.equal(
      iconKey(itemAt(map, `${home}/Documents/Gone`, []), rule),
      "folder",
    );
    assert.equal(
      iconKey(itemAt(map, `${home}/Documents/Taxes/Gone.pdf`, []), rule),
      "folder",
    );
    // Elsewhere its own path, which the route refuses for a path the map doesn't show.
    assert.equal(
      iconKey(itemAt(map, `${home}/Projects/Gone`, []), rule),
      "item/%2FUsers%2Fzo%C3%AB%2FProjects%2FGone",
    );
    assert.equal(
      iconKey(itemAt(map, `${home}/Documents`, []), rule),
      "place/documents",
    );
  });
});
