/**
 * Keeping a map still while its host replaces it, as Pith's live map does every two seconds while the disk changes:
 * what a newer layout of the same folder does, and the hold that makes it wait while the person clicks or reads the
 * hover card, so the block under the pointer is the one they aimed at. Pure timing and geometry: the canvas component
 * wires it to the pointer and a timer, and tests check it without a browser.
 */

import { drawsTheSame, type TreemapLayout } from "./treemap-layout.ts";

/** The longest a hold keeps a newer layout waiting, from when the hold began: the spec's "about three seconds". */
export const LONGEST_HOLD = 3000;

/**
 * What holds the map still, at times in milliseconds: a mouse button down over it, a click that a second click could
 * still make a double-click of, and the hover card open.
 */
export interface Hold {
  /** When the hold began; null until something first holds the map. */
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
  /** A button goes down over the map: a new click, which begins a hold however long the card has held. */
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
      return { ...hold, pressed: true, since: now };
    case "release":
      return hold.pressed
        ? { ...hold, pressed: false, clicked: now + event.doubleClick }
        : hold;
    case "menu":
      return { ...hold, pressed: false };
    case "card":
      if (event.open === hold.card) return hold;
      // A card opening while nothing holds begins a hold; one opening during a hold joins it.
      return {
        ...hold,
        card: event.open,
        since: event.open && !holds(hold, now) ? now : hold.since,
      };
  }
}

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
