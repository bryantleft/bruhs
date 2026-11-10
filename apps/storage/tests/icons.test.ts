import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { IconCache, iconScale, iconURL } from "../native-web/icons.ts";

describe("iconURL", () => {
  test("puts the size and key after the base Pith sends", () => {
    assert.equal(
      iconURL("pith://app/icon/3/dark/", 16, 2, "type/pdf"),
      "pith://app/icon/3/dark/16@2x/type/pdf.png",
    );
    assert.equal(
      iconURL("pith://app/icon/1/light/", 16, 1, "item/%2FMy%20Files"),
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

  test("says whether a list has any icon to show, or may yet", async () => {
    const { loads, load } = loader();
    const cache = new IconCache(load);
    cache.setBase(base);
    const app = `${base}16@2x/item/%2FApplications%2FSafari.app.png`;
    const guarded = `${base}16@2x/item/%2FUsers%2Fx%2FDownloads%2FTool.app.png`;
    assert.equal(cache.mayShowAny([]), false);
    assert.equal(cache.mayShowAny([null, null]), false, "no app has a bundle");
    assert.equal(cache.mayShowAny([guarded, null]), true, "not asked for yet");
    cache.request(guarded);
    assert.equal(cache.mayShowAny([guarded, null]), true, "loading");
    loads[0].fail();
    await settle();
    assert.equal(cache.mayShowAny([guarded, null]), false, "every icon failed");
    assert.equal(cache.mayShowAny([guarded, app]), true);
    cache.request(app);
    loads[1].finish("safari icon");
    await settle();
    assert.equal(cache.mayShowAny([guarded, app]), true, "one loaded");
  });
});
