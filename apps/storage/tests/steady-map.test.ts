import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type Clock,
  clicking,
  type Hold,
  type HoldEvent,
  heldUntil,
  holdAfter,
  holdEnded,
  LONGEST_HOLD,
  NO_HOLD,
  NOTHING_SHOWN,
  nextStep,
  type Steady,
  type SteadyInput,
  steadyAfter,
  steadyMap,
  wakeAt,
} from "../src/lib/steady-map.ts";
import {
  kindBytesByFolder,
  layoutTreemap,
  type TreemapLayout,
} from "../src/lib/treemap-layout.ts";
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

  test("a press during a hold doesn't make it longer", () => {
    // The pointer rests on the map and the person clicks every 2.5 s: no map waits past three seconds of a hold.
    const clicks = after([0, cardOpens], [2500, press], [2600, release]);
    assert.equal(heldUntil(clicks, 2700), LONGEST_HOLD);
    assert.equal(heldUntil(clicks, LONGEST_HOLD), null);
    const next = after(
      [0, cardOpens],
      [2500, press],
      [2600, release],
      [5000, press],
      [5100, release],
    );
    assert.equal(
      heldUntil(next, 5200),
      5000 + LONGEST_HOLD,
      "a press once the hold has run out begins one of its own",
    );
    assert.equal(heldUntil(holdAfter(next, press, 7500), 7600), 8000);
  });

  test("a hold that ended begins again with the next press, or the card opening again", () => {
    // Ended as its folder changed, though the card is open and a double-click could still come.
    const ended = holdEnded(
      after([0, cardOpens], [100, press], [180, release]),
    );
    assert.equal(heldUntil(ended, 200), null);
    assert.equal(clicking(ended, 200), true);
    assert.equal(
      heldUntil(holdAfter(ended, press, 300), 300),
      300 + LONGEST_HOLD,
    );
    const reopened = holdAfter(
      holdAfter(ended, cardCloses, 300),
      cardOpens,
      400,
    );
    assert.equal(heldUntil(reopened, 400), 400 + LONGEST_HOLD);
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

  test("holds back the Not measured block coming, or a padlock, as any change it can see", () => {
    const root = map(1_000_000);
    const kinds = kindBytesByFolder(root);
    const usedSpace = { unmeasured: 2_000_000, used: 3_500_000 };
    const blocked = layoutTreemap(
      root,
      400,
      300,
      kinds,
      undefined,
      undefined,
      usedSpace,
    );
    assert.equal(nextStep(shown, blocked, true), "wait");
    assert.equal(nextStep(shown, blocked, false), "show");
    assert.equal(
      nextStep(
        blocked,
        layoutTreemap(root, 400, 300, kinds, undefined, undefined, usedSpace),
        true,
      ),
      "keep",
    );
    // A folder holding one the scan couldn't read: its header gains a padlock where Pith's page draws them.
    const locked = dir("/r", [
      dir("/r/a", [
        file("/r/a/x.mov", 600_000),
        file("/r/a/y.mov", 400_000),
        {
          kind: "unreadable",
          name: "z",
          path: "/r/a/z",
          size: 0,
          reason: "protected",
        },
      ]),
      file("/r/notes.pdf", 500_000),
    ]);
    const marks = (padlocks: boolean) => ({
      icons: true,
      glyphs: false,
      padlocks,
      metrics: { charWidth: 6, lineHeight: 13, padX: 4, padY: 3 },
    });
    const plain = layoutTreemap(
      locked,
      400,
      300,
      kindBytesByFolder(locked),
      undefined,
      marks(false),
    );
    const padlocked = layoutTreemap(
      locked,
      400,
      300,
      kindBytesByFolder(locked),
      undefined,
      marks(true),
    );
    assert.equal(nextStep(plain, padlocked, true), "wait");
    assert.equal(
      nextStep(
        padlocked,
        layoutTreemap(
          locked,
          400,
          300,
          kindBytesByFolder(locked),
          undefined,
          marks(true),
        ),
        true,
      ),
      "keep",
    );
  });
});

/** A clock that moves only when the test moves it, running each timer that comes due on the way, in order. */
function testClock(): Clock & { to(time: number): void; waiting(): number } {
  let now = 0;
  const timers: { at: number; run: () => void; live: boolean }[] = [];
  return {
    now: () => now,
    after(ms, run) {
      const timer = { at: now + ms, run, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
    to(time) {
      for (;;) {
        const due = timers
          .filter((timer) => timer.live && timer.at <= time)
          .sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        due.live = false;
        now = due.at;
        due.run();
      }
      now = time;
    },
    waiting: () => timers.filter((timer) => timer.live).length,
  };
}

/** A steady map on a test's clock, and what it has shown. */
function steadyOnClock() {
  const clock = testClock();
  const shown: (TreemapLayout | null)[] = [];
  const map = steadyMap(clock, (layout) => shown.push(layout));
  return { clock, map, shown, last: () => shown.at(-1) };
}

describe("a steady map", () => {
  // Three maps of one folder, each drawn differently, and two of another.
  const folder = (clip: number) =>
    dir("/r", [file("/r/clip.mov", clip), file("/r/notes.pdf", 500_000)]);
  const a = layout(folder(1_000_000));
  const b = layout(folder(3_000_000));
  const c = layout(folder(6_000_000));
  const opened = (split: number) =>
    layout(
      dir("/r/sub", [
        file("/r/sub/one.bin", split),
        file("/r/sub/two.bin", 1_000_000 - split),
      ]),
    );

  test("shows the first layout at once, and a newer one of its folder once the hold lets go", () => {
    const { clock, map, last } = steadyOnClock();
    map.newer(a);
    assert.equal(last(), a);
    clock.to(100);
    map.card(true);
    clock.to(500);
    map.newer(b);
    clock.to(900);
    map.newer(c);
    clock.to(3099);
    assert.equal(last(), a, "both wait while the card is open");
    clock.to(3100);
    assert.equal(
      last(),
      c,
      "the newest shows three seconds after the card opened",
    );
    assert.equal(clock.waiting(), 0);
  });

  test("shows a waiting layout as soon as nothing holds the map", () => {
    const { clock, map, last } = steadyOnClock();
    map.newer(a);
    map.press(1);
    clock.to(100);
    map.newer(b);
    map.release(500);
    clock.to(599);
    assert.equal(last(), a);
    clock.to(600);
    assert.equal(last(), b, "a second click can no longer come");
  });

  test("keeps the layout shown for a newer one that draws the same, which drops what waited", () => {
    const { clock, map, shown } = steadyOnClock();
    map.newer(a);
    map.card(true);
    map.newer(b);
    clock.to(100);
    map.newer(layout(folder(1_000_001)));
    clock.to(5000);
    assert.deepEqual(shown, [a]);
  });

  test("shows another folder at once and ends the hold, so the folder's finer layout shows at once too", () => {
    const { clock, map, last } = steadyOnClock();
    map.newer(a);
    map.drew(a);
    clock.to(100);
    map.card(true);
    map.press(1);
    clock.to(180);
    map.release(500);
    clock.to(260);
    map.press(2);
    clock.to(340);
    map.release(500);
    // The double-click opens a folder, whose finer tree comes a moment later, the pointer still on the map.
    map.newer(opened(500_000));
    assert.deepEqual(last(), opened(500_000));
    clock.to(450);
    const finer = opened(800_000);
    map.newer(finer);
    assert.equal(last(), finer);
  });

  test("holds the new folder still again from the next press, or once the card opens again", () => {
    const { clock, map, last } = steadyOnClock();
    const before = opened(500_000);
    map.newer(a);
    map.card(true);
    clock.to(100);
    map.newer(before);
    clock.to(1000);
    map.press(1);
    map.newer(opened(800_000));
    clock.to(1100);
    map.release(500);
    clock.to(3999);
    assert.equal(
      last(),
      before,
      "the card is open, so the press holds for three seconds",
    );
    clock.to(4000);
    assert.deepEqual(last(), opened(800_000));

    const reopened = steadyOnClock();
    reopened.map.newer(a);
    reopened.map.card(true);
    reopened.map.newer(before);
    reopened.clock.to(500);
    reopened.map.card(false);
    reopened.clock.to(600);
    reopened.map.card(true);
    reopened.map.newer(opened(800_000));
    reopened.clock.to(3599);
    assert.equal(reopened.last(), before);
    reopened.clock.to(3600);
    assert.deepEqual(reopened.last(), opened(800_000));
  });

  test("keeps holding at another size of the same folder", () => {
    const { clock, map, last } = steadyOnClock();
    map.newer(a);
    map.card(true);
    const wider = layout(folder(1_000_000), 500, 300);
    map.newer(wider);
    assert.equal(last(), wider, "the person resized the map");
    map.newer(layout(folder(3_000_000), 500, 300));
    clock.to(2999);
    assert.equal(last(), wider);
  });

  test("shows a layout answering the person's own action at once, though the hold lasts", () => {
    const { clock, map, last, shown } = steadyOnClock();
    map.newer(a);
    map.card(true);
    clock.to(100);
    map.newer(b);
    clock.to(200);
    map.show(c);
    assert.equal(last(), c);
    clock.to(5000);
    assert.deepEqual(shown, [a, c], "what waited is out of date");
  });

  test("shows nothing at once when the map has no room", () => {
    const { map, last } = steadyOnClock();
    map.newer(a);
    map.card(true);
    map.newer(null);
    assert.equal(last(), null);
  });

  test("clicks on the layout drawn when the button went down, though a newer one shows before it comes up", () => {
    const { clock, map, last } = steadyOnClock();
    map.newer(a);
    map.drew(a);
    map.card(true);
    clock.to(1000);
    map.newer(b);
    // The press joins the card's hold, which lets go at 3 s, in the middle of the click.
    clock.to(2900);
    map.press(1);
    clock.to(3000);
    assert.equal(last(), b);
    map.drew(b);
    clock.to(3050);
    map.release(500);
    assert.equal(map.clicked(), a);
    clock.to(3200);
    map.press(2);
    clock.to(3250);
    map.release(500);
    assert.equal(
      map.clicked(),
      a,
      "a double-click's second click acts where the first did",
    );
    clock.to(3750);
    assert.equal(map.clicked(), b, "once a second click can no longer come");
  });

  test("clicks on the layout on screen, not one shown that isn't drawn yet", () => {
    const { map } = steadyOnClock();
    map.newer(a);
    map.drew(a);
    map.show(b);
    map.press(1);
    map.release(500);
    assert.equal(map.clicked(), a);
    map.drew(b);
    map.press(1);
    assert.equal(map.clicked(), b);
  });

  test("clicks on the folder shown when one opened between the clicks", () => {
    const { map } = steadyOnClock();
    const sub = opened(500_000);
    map.newer(a);
    map.drew(a);
    map.press(1);
    map.release(500);
    map.show(sub);
    map.drew(sub);
    map.press(2);
    map.release(500);
    assert.equal(map.clicked(), sub);
  });

  test("stops its clock", () => {
    const { clock, map, shown } = steadyOnClock();
    map.newer(a);
    map.card(true);
    map.newer(b);
    assert.equal(clock.waiting(), 1);
    map.stop();
    clock.to(5000);
    assert.deepEqual(shown, [a]);
  });
});

describe("steadyAfter", () => {
  const a = layout(
    dir("/r", [file("/r/clip.mov", 1_000_000), file("/r/notes.pdf", 500_000)]),
  );
  const run = (...steps: [number, SteadyInput][]): Steady =>
    steps.reduce(
      (state, [now, input]) => steadyAfter(state, input, now),
      NOTHING_SHOWN,
    );

  test("lets go of the click's layout once a second click can no longer come", () => {
    const clicked = run(
      [0, { type: "newer", layout: a }],
      [0, { type: "drew", layout: a }],
      [10, { type: "press", clicks: 1 }],
      [100, { type: "release", doubleClick: 500 }],
    );
    assert.equal(clicked.pressedOn, a);
    assert.equal(wakeAt(clicked, 100), 600);
    const over = steadyAfter(clicked, { type: "time" }, 600);
    assert.equal(over.pressedOn, null);
    assert.equal(wakeAt(over, 600), null);
  });

  test("wakes when the hold lets go of a waiting layout", () => {
    const grown = layout(
      dir("/r", [
        file("/r/clip.mov", 3_000_000),
        file("/r/notes.pdf", 500_000),
      ]),
    );
    const waiting = run(
      [0, { type: "newer", layout: a }],
      [0, { type: "card", open: true }],
      [200, { type: "newer", layout: grown }],
    );
    assert.equal(waiting.waiting, grown);
    assert.equal(wakeAt(waiting, 200), LONGEST_HOLD);
  });

  test("never wakes for a time already past", () => {
    // A state no input leaves, a click's layout kept past its double-click window, must not make a clock spin.
    const stale: Steady = {
      ...NOTHING_SHOWN,
      shown: a,
      drawn: a,
      pressedOn: a,
      hold: { ...NO_HOLD, clicked: 600 },
    };
    assert.equal(wakeAt(stale, 700), null);
  });
});
