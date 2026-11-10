/**
 * The disk map's click hints: its hover card says how to select and open an item until the person has selected and
 * opened something on the map once. A host can keep which they've learned, as Pith keeps them in its settings;
 * otherwise the map keeps them in the page's own storage.
 */

/** A hint the map learns: the person selected something on the map, or opened it. */
export type HintStep = "selected" | "opened";

export const HINT_STEPS: readonly HintStep[] = ["selected", "opened"];

export interface LearnedHints {
  readonly selected: boolean;
  readonly opened: boolean;
}

export const NOTHING_LEARNED: LearnedHints = { selected: false, opened: false };

/** The hints a host keeps for the map: which it has learned, and what to do when it learns one. */
export interface MapHints {
  readonly learned: LearnedHints;
  learn(step: HintStep): void;
}

/** Where the map keeps them in the page's own storage, when no host keeps them. */
const HINTS_KEY = "pith.mapHintsLearned";

/** The hints the page's own storage has learned. When storage is unavailable the hints keep showing. */
export function storedHints(): LearnedHints {
  try {
    const saved = JSON.parse(localStorage.getItem(HINTS_KEY) ?? "{}");
    return { selected: saved.selected === true, opened: saved.opened === true };
  } catch {
    return NOTHING_LEARNED;
  }
}

/** Keeps `step` learned in the page's own storage. */
export function storeHint(step: HintStep): void {
  try {
    const learned = { ...storedHints(), [step]: true };
    localStorage.setItem(HINTS_KEY, JSON.stringify(learned));
  } catch {
    // Without storage the hints stay, which is harmless.
  }
}
