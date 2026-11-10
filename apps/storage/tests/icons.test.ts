import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  GROUP_KEY,
  IconCache,
  type IconItem,
  iconKey,
  iconScale,
  iconURL,
  itemAt,
  itemKey,
  parseIconRule,
} from "../native-web/icons.ts";
import type { DirNode, FileNode, TreeNode } from "../src/lib/types.ts";

/** The table native sends for a test home, and each item's key by Pith's own rule, which IconRuleTests.swift checks too. */
const fixture = JSON.parse(
  readFileSync(new URL("./icon-keys.json", import.meta.url), "utf8"),
) as {
  rule: unknown;
  cases: { why: string; node: IconItem; asking: boolean; key: string }[];
};

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
    const rule = parseIconRule(fixture.rule);
    assert.ok(rule, "the table native sends");
    assert.ok(fixture.cases.length > 30);
    for (const { why, node, asking, key } of fixture.cases) {
      assert.equal(iconKey(node, { ...rule, asking }), key, why);
    }
  });

  test("gives the map's blocks of smaller items the rule's group key", () => {
    const rule = parseIconRule(fixture.rule);
    assert.ok(rule);
    assert.equal(
      iconKey({ kind: "aggregate", path: "/Users/x/__other__" }, rule),
      GROUP_KEY,
    );
  });

  test("spells an app's bundle as the route reads it", () => {
    assert.equal(
      itemKey("/Applications/Zoë's App (Beta).app"),
      "item/%2FApplications%2FZo%C3%AB%27s%20App%20%28Beta%29.app",
    );
    assert.equal(itemKey("/a/\ud800"), "item/%2Fa%2F%EF%BF%BD");
  });
});

describe("parseIconRule", () => {
  const sent = fixture.rule as Record<string, unknown>;

  test("reads the table as native sends it", () => {
    const rule = parseIconRule(sent);
    assert.equal(rule?.asking, false);
    assert.equal(parseIconRule({ ...sent, asking: true })?.asking, true);
  });

  test("refuses a table of another shape", () => {
    const [place] = sent.places as Record<string, unknown>[];
    for (const value of [
      null,
      "table",
      [],
      { ...sent, places: undefined },
      { ...sent, places: [{ ...place, id: 7 }] },
      { ...sent, places: [{ id: "mail" }] },
      { ...sent, guarded: ["/Users/x/Documents", 3] },
      { ...sent, guarded: "/Users/x/Documents" },
      { ...sent, asking: "yes" },
      { ...sent, asking: undefined },
    ]) {
      assert.equal(parseIconRule(value), null, JSON.stringify(value));
    }
  });
});

describe("iconURL", () => {
  test("puts the size and key after the base Pith sends", () => {
    assert.equal(
      iconURL("pith://app/icon/3/dark/", 16, 2, "type/pdf"),
      "pith://app/icon/3/dark/16@2x/type/pdf.png",
    );
    assert.equal(
      iconURL("pith://app/icon/1/light/", 16, 1, itemKey("/My Files")),
      "pith://app/icon/1/light/16@1x/item/%2FMy%20Files.png",
    );
  });

  test("draws at a whole scale from 1x to 3x, whatever the page's zoom", () => {
    for (const [ratio, scale] of [
      [1, 1],
      [2, 2],
      [1.25, 1],
      [1.5, 2],
      [2.5, 3],
      [3, 3],
      [4, 3],
      [0.5, 1],
      [0, 1],
      [Number.NaN, 1],
      [Number.POSITIVE_INFINITY, 1],
    ]) {
      assert.equal(iconScale(ratio), scale, String(ratio));
    }
  });
});

describe("itemAt", () => {
  const home = "/Users/zoë";
  const rule = parseIconRule(fixture.rule);
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
      `item/${"%2FUsers%2Fzo%C3%AB%2FProjects%2FGone"}`,
    );
    assert.equal(
      iconKey(itemAt(map, `${home}/Documents`, []), rule),
      "place/documents",
    );
  });
});

/** A loader whose loads finish when the test says. */
function loader() {
  const loads: {
    url: string;
    finish: (image: string) => void;
    fail: () => void;
  }[] = [];
  const load = (url: string) =>
    new Promise<string>((resolve, reject) => {
      loads.push({
        url,
        finish: resolve,
        fail: () => reject(new Error("404")),
      });
    });
  return { loads, load };
}

/** Lets the cache see a load finish. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("IconCache", () => {
  const base = "pith://app/icon/1/dark/";
  const url = `${base}16@2x/type/pdf.png`;

  test("loads an icon once, however often it's asked for, and keeps it for a canvas", async () => {
    const { loads, load } = loader();
    const cache = new IconCache(load);
    cache.setBase(base);
    let heard = 0;
    const stop = cache.subscribe(() => {
      heard += 1;
    });
    assert.equal(cache.state(url), undefined);
    cache.request(url);
    cache.request(url);
    assert.equal(loads.length, 1);
    assert.equal(cache.state(url), "loading");
    assert.equal(cache.image(url), null);
    loads[0].finish("pdf icon");
    await settle();
    assert.equal(cache.state(url), "loaded");
    assert.equal(cache.image(url), "pdf icon");
    assert.equal(heard, 1);
    cache.request(url);
    assert.equal(loads.length, 1);
    stop();
    cache.request(`${base}16@2x/folder.png`);
    loads[1].finish("folder icon");
    await settle();
    assert.equal(heard, 1, "no one listens after stopping");
  });

  test("remembers a failed load, so later maps don't ask again", async () => {
    const { loads, load } = loader();
    const cache = new IconCache(load);
    cache.setBase(base);
    cache.request(url);
    loads[0].fail();
    await settle();
    assert.equal(cache.state(url), "failed");
    assert.equal(cache.image(url), null);
    cache.request(url);
    assert.equal(loads.length, 1);
  });

  test("starts over with a new base, and keeps everything while the base stays", async () => {
    const { loads, load } = loader();
    const cache = new IconCache(load);
    cache.setBase(base);
    cache.request(url);
    loads[0].fail();
    await settle();
    cache.setBase(base);
    assert.equal(cache.state(url), "failed", "the same base, as with each map");
    let heard = 0;
    cache.subscribe(() => {
      heard += 1;
    });
    const next = "pith://app/icon/2/light/";
    cache.setBase(next);
    assert.equal(heard, 1);
    assert.equal(cache.state(url), undefined);
    cache.request(`${next}16@2x/type/pdf.png`);
    assert.equal(loads.length, 2);
    cache.request(url);
    assert.equal(
      loads.length,
      2,
      "an icon of the last base isn't loaded again",
    );
    assert.equal(cache.state(url), undefined);
  });

  test("drops a load from before a new base when it arrives", async () => {
    const { loads, load } = loader();
    const cache = new IconCache(load);
    cache.setBase(base);
    cache.request(url);
    cache.setBase("pith://app/icon/2/light/");
    let heard = 0;
    cache.subscribe(() => {
      heard += 1;
    });
    loads[0].finish("stale icon");
    await settle();
    assert.equal(cache.state(url), undefined);
    assert.equal(cache.image(url), null);
    assert.equal(heard, 0);
  });

  test("lets failed loads be tried again under a new rule, keeping the loaded ones", async () => {
    const { loads, load } = loader();
    const cache = new IconCache(load);
    cache.setBase(base);
    const folder = `${base}16@2x/item/%2FUsers%2Fx%2FDocuments%2FTaxes.png`;
    cache.request(url);
    cache.request(folder);
    loads[0].finish("pdf icon");
    // Refused while macOS was asking.
    loads[1].fail();
    await settle();
    let heard = 0;
    cache.subscribe(() => {
      heard += 1;
    });
    cache.forgetFailures();
    assert.equal(heard, 1);
    assert.equal(cache.state(folder), undefined);
    assert.equal(cache.state(url), "loaded");
    assert.equal(cache.image(url), "pdf icon");
    cache.request(folder);
    assert.equal(loads.length, 3);
    cache.forgetFailures();
    assert.equal(heard, 1, "nothing had failed, so nothing changed");
  });
});
