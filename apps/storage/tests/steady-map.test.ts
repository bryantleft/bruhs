import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  clicking,
  type Hold,
  type HoldEvent,
  heldUntil,
  holdAfter,
  LONGEST_HOLD,
  NO_HOLD,
  nextStep,
} from "../src/lib/steady-map.ts";
import { kindBytesByFolder, layoutTreemap } from "../src/lib/treemap-layout.ts";
import type { DirNode, FileNode } from "../src/lib/types.ts";

/** The hold after each event in turn, each at its time in milliseconds. */
function after(...steps: [number, HoldEvent][]): Hold {
  return steps.reduce(
    (hold, [now, event]) => holdAfter(hold, event, now),
    NO_HOLD,
  );
}

const press: HoldEvent = { type: "press" };
const release: HoldEvent = { type: "release", doubleClick: 500 };
const cardOpens: HoldEvent = { type: "card", open: true };
const cardCloses: HoldEvent = { type: "card", open: false };

describe("the hold", () => {
  test("nothing holds the map until the person presses on it or the card opens", () => {
    assert.equal(heldUntil(NO_HOLD, 0), null);
  });

  test("a button held down holds the map for at most three seconds", () => {
    const down = after([1000, press]);
    assert.equal(heldUntil(down, 1500), 1000 + LONGEST_HOLD);
    assert.equal(heldUntil(down, 3999), 4000);
    assert.equal(heldUntil(down, 4000), null);
  });

  test("a click holds the map until a second click can no longer make a double-click", () => {
    const clicked = after([0, press], [100, release]);
    assert.equal(heldUntil(clicked, 200), 600);
    assert.equal(heldUntil(clicked, 600), null);
  });

  test("a double-click slower than three seconds still lets go three seconds after the press", () => {
    const clicked = after(
      [0, press],
      [100, { type: "release", doubleClick: 5000 }],
    );
    assert.equal(heldUntil(clicked, 200), LONGEST_HOLD);
  });

  test("the hover card holds the map for three seconds from when it opened, however long it stays", () => {
    const reading = after([0, cardOpens]);
    assert.equal(heldUntil(reading, 2000), LONGEST_HOLD);
    assert.equal(heldUntil(reading, LONGEST_HOLD), null);
    assert.equal(heldUntil(reading, 10_000), null);
  });

  test("the card closing lets go, unless a double-click can still come", () => {
    assert.equal(
      heldUntil(after([0, cardOpens], [1000, cardCloses]), 1000),
      null,
    );
    const clicked = after(
      [0, cardOpens],
      [100, press],
      [200, release],
      [300, cardCloses],
    );
    assert.equal(heldUntil(clicked, 300), 700);
  });

  test("a press after the card has held its three seconds begins a hold of its own", () => {
    const pressed = after([0, cardOpens], [5000, press]);
    assert.equal(heldUntil(pressed, 5000), 5000 + LONGEST_HOLD);
    assert.equal(
      heldUntil(holdAfter(pressed, release, 5100), 5700),
      8000,
      "the card is still open",
    );
  });

  test("the card opening during a hold doesn't make it longer", () => {
    const clicked = after([0, press], [100, release], [200, cardOpens]);
    assert.equal(heldUntil(clicked, 300), LONGEST_HOLD);
  });

  test("the card opening once everything has let go begins a new hold", () => {
    const later = after([0, press], [100, release], [700, cardOpens]);
    assert.equal(heldUntil(later, 700), 700 + LONGEST_HOLD);
  });

  test("the card opening while a button has been down for over three seconds begins no new hold", () => {
    // Pressed all along: the press's hold ran out at 3 s, and the card adds to that press rather than beginning anew.
    const held = after([0, press], [4000, cardOpens]);
    assert.equal(heldUntil(held, 4000), null);
  });

  test("a press that opens the item's menu waits for no double-click", () => {
    const menu = after([0, press], [50, { type: "menu" }]);
    assert.equal(heldUntil(menu, 60), null);
  });

  test("a button coming up that went down elsewhere changes nothing", () => {
    assert.deepEqual(holdAfter(NO_HOLD, release, 100), NO_HOLD);
  });

  test("a click lasts from its press until a second click can no longer make a double-click", () => {
    assert.equal(clicking(NO_HOLD, 0), false);
    assert.equal(clicking(after([0, press]), 10_000), true);
    const clicked = after([0, press], [100, release]);
    assert.equal(clicking(clicked, 599), true);
    assert.equal(clicking(clicked, 600), false);
    // The card holds the map, but a click is over all the same.
    assert.equal(clicking(holdAfter(clicked, cardOpens, 200), 700), false);
    assert.equal(
      clicking(after([0, press], [50, { type: "menu" }]), 60),
      false,
    );
  });
});

function dir(path: string, children: FileNode[]): DirNode {
  return {
    kind: "dir",
    name: path.slice(path.lastIndexOf("/") + 1),
    path,
    size: children.reduce((sum, child) => sum + child.size, 0),
    files: children.length,
    children,
  };
}

const file = (path: string, size: number): FileNode => ({
  kind: "file",
  name: path.slice(path.lastIndexOf("/") + 1),
  path,
  size,
});

const layout = (root: DirNode, width = 400, height = 300) =>
  layoutTreemap(root, width, height, kindBytesByFolder(root));

describe("nextStep", () => {
  const map = (clip: number) =>
    dir("/r", [file("/r/clip.mov", clip), file("/r/notes.pdf", 500_000)]);
  const shown = layout(map(1_000_000));

  test("shows the first layout, another folder's and another size's at once, holding or not", () => {
    assert.equal(nextStep(null, shown, true), "show");
    const other = dir("/s", [file("/s/clip.mov", 1_000_000)]);
    assert.equal(nextStep(shown, layout(other), true), "show");
    assert.equal(
      nextStep(shown, layout(map(1_000_000), 500, 300), true),
      "show",
    );
  });

  test("keeps the shown layout for a newer map that draws the same, holding or not", () => {
    assert.equal(nextStep(shown, layout(map(1_000_000)), false), "keep");
    assert.equal(nextStep(shown, layout(map(1_000_001)), true), "keep");
  });

  test("holds back a newer map that draws differently while the hold lasts, and shows it otherwise", () => {
    const grown = layout(map(3_000_000));
    assert.equal(nextStep(shown, grown, true), "wait");
    assert.equal(nextStep(shown, grown, false), "show");
  });
});
