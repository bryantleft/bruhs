/**
 * Keeping a map still while its host replaces it, as Pith's live map does every two seconds while the disk changes:
 * what a newer layout of the same folder does, and the hold that makes it wait while the person clicks or reads the
 * hover card, so the block under the pointer is the one they aimed at. Pure timing and geometry, and a small driver
 * that runs them on a clock: the canvas component gives it the browser's clock and the pointer, and tests a clock of
 * their own.
 */

import { drawsTheSame, type TreemapLayout } from "./treemap-layout.ts";

/** The longest a hold keeps a newer layout waiting, from when the hold began: the spec's "about three seconds". */
export const LONGEST_HOLD = 3000;

/**
 * What holds the map still, at times in milliseconds: a mouse button down over it, a click that a second click could
 * still make a double-click of, and the hover card open.
 */
export interface Hold {
  /** When the hold under way began: null before anything holds the map, and once the hold ended with its folder. */
  readonly since: number | null;
  readonly pressed: boolean;
  /** Until when a second click would make a double-click of the last one. */
  readonly clicked: number;
  readonly card: boolean;
}

export const NO_HOLD: Hold = {
  since: null,
  pressed: false,
  clicked: Number.NEGATIVE_INFINITY,
  card: false,
};

export type HoldEvent =
  /** A button goes down over the map: a new click, which begins a hold unless one is under way. */
  | { readonly type: "press" }
  /** The button comes up, and a second click within `doubleClick` ms would make a double-click. */
  | { readonly type: "release"; readonly doubleClick: number }
  /** The press opened the item's menu instead, which takes the rest of the click. */
  | { readonly type: "menu" }
  | { readonly type: "card"; readonly open: boolean };

/**
 * Whether a click is under way at `now`: its button is down, or a second click could still make a double-click of
 * it. A click acts on the layout on screen when its button went down, and a double-click on its first click's.
 */
export const clicking = (hold: Hold, now: number) =>
  hold.pressed || now < hold.clicked;

/** Whether anything holds the map at `now`, though the hold may have run out. */
const holds = (hold: Hold, now: number) => clicking(hold, now) || hold.card;

export function holdAfter(hold: Hold, event: HoldEvent, now: number): Hold {
  switch (event.type) {
    case "press":
      // A press during a hold joins it, so clicking again and again never keeps a newer map waiting longer.
      return {
        ...hold,
        pressed: true,
        since: heldUntil(hold, now) === null ? now : hold.since,
      };
    case "release":
      return hold.pressed
        ? { ...hold, pressed: false, clicked: now + event.doubleClick }
        : hold;
    case "menu":
      return { ...hold, pressed: false };
    case "card": {
      if (event.open === hold.card) return hold;
      // A card opening begins a hold when nothing holds the map, or the last hold ended with its folder; one opening
      // while something else holds the map joins that, however long it has held.
      const begins = event.open && (hold.since === null || !holds(hold, now));
      return { ...hold, card: event.open, since: begins ? now : hold.since };
    }
  }
}

/**
 * The hold, ended: the map shows another folder, which its newer layouts fill in at once. The next press begins a
 * hold again, and so does the card opening again.
 */
export const holdEnded = (hold: Hold): Hold => ({ ...hold, since: null });

/**
 * When the map stops holding if nothing else happens: when a double-click can no longer come, or three seconds after
 * the hold began, whichever is first. Null when it doesn't hold at `now`.
 */
export function heldUntil(hold: Hold, now: number): number | null {
  if (hold.since === null || !holds(hold, now)) return null;
  const longest = hold.since + LONGEST_HOLD;
  if (now >= longest) return null;
  return hold.pressed || hold.card ? longest : Math.min(longest, hold.clicked);
}

/**
 * What a map that holds still does with a newer layout: shows it, keeps the layout it shows, the same object, so the
 * blocks the pointer finds and the hover card stay as they are, or lets it wait until the hold lets go. A layout of
 * another folder or at another size always shows at once, since the person asked for it.
 */
export function nextStep(
  shown: TreemapLayout | null,
  next: TreemapLayout,
  holding: boolean,
): "show" | "keep" | "wait" {
  if (
    shown === null ||
    shown.root.path !== next.root.path ||
    shown.width !== next.width ||
    shown.height !== next.height
  ) {
    return "show";
  }
  if (drawsTheSame(shown, next)) return "keep";
  return holding ? "wait" : "show";
}

/** What a steady map shows and holds back. */
export interface Steady {
  /** The layout the map shows, which it draws next if it hasn't yet. */
  readonly shown: TreemapLayout | null;
  /** The layout the map last drew: the one on screen. */
  readonly drawn: TreemapLayout | null;
  /** The newest layout of the folder shown, waiting for the hold to let go. */
  readonly waiting: TreemapLayout | null;
  readonly hold: Hold;
  /** The layout on screen when the click under way began, which the click acts on. */
  readonly pressedOn: TreemapLayout | null;
}

export const NOTHING_SHOWN: Steady = {
  shown: null,
  drawn: null,
  waiting: null,
  hold: NO_HOLD,
  pressedOn: null,
};

export type SteadyInput =
  /** A newer layout of the map, null when it has no room: it waits while the hold lasts, unless it draws what's shown. */
  | { readonly type: "newer"; readonly layout: TreemapLayout | null }
  /**
   * A layout to show as it is, now: one answering the person's own action, such as moving an item to the Trash, or
   * any layout of a map that doesn't hold still.
   */
  | { readonly type: "show"; readonly layout: TreemapLayout | null }
  /** The map drew `layout`. */
  | { readonly type: "drew"; readonly layout: TreemapLayout }
  /** A button went down over the map, as the `clicks`th click in a row (`MouseEvent.detail`). */
  | { readonly type: "press"; readonly clicks: number }
  | Exclude<HoldEvent, { readonly type: "press" }>
  /** Time passed: the hold may have let go, or a click ended. */
  | { readonly type: "time" };

/** `state` after `input` at `now`. */
export function steadyAfter(
  state: Steady,
  input: SteadyInput,
  now: number,
): Steady {
  return settled(applied(state, input, now), now);
}

function applied(state: Steady, input: SteadyInput, now: number): Steady {
  switch (input.type) {
    case "newer": {
      if (input.layout === null) return showing(state, null);
      const held = heldUntil(state.hold, now) !== null;
      const step = nextStep(state.shown, input.layout, held);
      if (step === "show") return showing(state, input.layout);
      // A layout that draws what's shown leaves that on screen, and makes whatever waited out of date.
      return { ...state, waiting: step === "wait" ? input.layout : null };
    }
    case "show":
      return showing(state, input.layout);
    case "drew":
      return { ...state, drawn: input.layout };
    case "press": {
      // A double-click's second press keeps what its first was aimed at.
      const second = input.clicks >= 2 && clicking(state.hold, now);
      return {
        ...state,
        hold: holdAfter(state.hold, { type: "press" }, now),
        pressedOn: second ? state.pressedOn : state.drawn,
      };
    }
    case "time":
      return state;
    default:
      return { ...state, hold: holdAfter(state.hold, input, now) };
  }
}

/** `state` showing `layout`. Another folder ends the hold and the click begun on the folder before. */
function showing(state: Steady, layout: TreemapLayout | null): Steady {
  const sameFolder =
    layout !== null && layout.root.path === state.shown?.root.path;
  return {
    ...state,
    shown: layout,
    waiting: null,
    hold: sameFolder ? state.hold : holdEnded(state.hold),
    pressedOn: sameFolder ? state.pressedOn : null,
  };
}

/** `state` as of `now`: the layout waiting shows once the hold lets go, and a click ends when a second can't come. */
function settled(state: Steady, now: number): Steady {
  let next = state;
  if (next.waiting !== null && heldUntil(next.hold, now) === null) {
    next = showing(next, next.waiting);
  }
  if (next.pressedOn !== null && !clicking(next.hold, now)) {
    next = { ...next, pressedOn: null };
  }
  return next;
}

/**
 * When `state` changes with time alone: when the hold lets go of the layout waiting, or the click under way ends
 * and lets go of the layout it began on. Always after `now`, so a clock never wakes for nothing; null when nothing
 * waits for a time.
 */
export function wakeAt(state: Steady, now: number): number | null {
  const times: number[] = [];
  const until = state.waiting === null ? null : heldUntil(state.hold, now);
  if (until !== null) times.push(until);
  if (
    state.pressedOn !== null &&
    !state.hold.pressed &&
    state.hold.clicked > now
  ) {
    times.push(state.hold.clicked);
  }
  return times.length === 0 ? null : Math.min(...times);
}

/** The layout a click acts on: the one on screen when its button went down, a double-click's first click's. */
export function clickedOn(state: Steady, now: number): TreemapLayout | null {
  return state.pressedOn !== null && clicking(state.hold, now)
    ? state.pressedOn
    : state.drawn;
}

/** The time a steady map runs on: the browser's, or a test's. */
export interface Clock {
  now(): number;
  /** Calls `run` in `ms` milliseconds, unless the function it returns is called first. */
  after(ms: number, run: () => void): () => void;
}

/**
 * A steady map on `clock`, which tells `show` each layout it shows. Its state lives outside React's, since the
 * pointer and the clock act between renders.
 */
export function steadyMap(
  clock: Clock,
  show: (layout: TreemapLayout | null) => void,
) {
  let state = NOTHING_SHOWN;
  let wake: { readonly at: number; readonly cancel: () => void } | null = null;
  const apply = (input: SteadyInput) => {
    const now = clock.now();
    const before = state;
    state = steadyAfter(state, input, now);
    const at = wakeAt(state, now);
    if (wake?.at !== at) {
      wake?.cancel();
      wake =
        at === null
          ? null
          : {
              at,
              cancel: clock.after(Math.max(0, at - now), () => {
                wake = null;
                apply({ type: "time" });
              }),
            };
    }
    if (state.shown !== before.shown) show(state.shown);
  };
  return {
    /** The layout shown, whose places a newer layout of the same folder keeps. */
    shown: () => state.shown,
    newer: (layout: TreemapLayout | null) => apply({ type: "newer", layout }),
    show: (layout: TreemapLayout | null) => apply({ type: "show", layout }),
    drew: (layout: TreemapLayout) => apply({ type: "drew", layout }),
    press: (clicks: number) => apply({ type: "press", clicks }),
    release: (doubleClick: number) => apply({ type: "release", doubleClick }),
    menu: () => apply({ type: "menu" }),
    card: (open: boolean) => apply({ type: "card", open }),
    clicked: () => clickedOn(state, clock.now()),
    /** Stops the clock, as the map goes. */
    stop: () => {
      wake?.cancel();
      wake = null;
    },
  };
}

export type SteadyMap = ReturnType<typeof steadyMap>;
