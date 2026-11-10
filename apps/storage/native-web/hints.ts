import { useEffect, useMemo, useState } from "react";
import {
  HINT_STEPS,
  type HintStep,
  type LearnedHints,
  type MapHints,
  NOTHING_LEARNED,
} from "../src/lib/map-hints.ts";

/**
 * The map's click hints as Pith keeps them, in its settings rather than the page's storage, which WebKit forgets with
 * each window: Pith sends the hints learned so far once the page is ready, and the page tells Pith each one it learns.
 */

declare global {
  interface Window {
    /** The hints the person has learned, by name (`MapHints` in MapHints.swift), which Pith sends once the page is ready. */
    pithReceiveLearnedHints: (names: unknown) => void;
  }
}

/**
 * `learned` with the hints `names` lists, Pith's list of them, added: a hint the page learned before the list came
 * stays learned. Anything but a list of names Pith knows adds nothing.
 */
export function learnedFrom(
  names: unknown,
  learned: LearnedHints,
): LearnedHints {
  const sent = new Set(Array.isArray(names) ? names : []);
  const has = (step: HintStep) => learned[step] || sent.has(step);
  return { selected: has("selected"), opened: has("opened") };
}

/**
 * The map's hints as Pith keeps them: none learned until Pith's list comes, and each one the map learns told to Pith
 * with `tell`, which keeps it for the next window and launch.
 */
export function useLearnedHints(tell: (step: HintStep) => void): MapHints {
  const [learned, setLearned] = useState(NOTHING_LEARNED);
  useEffect(() => {
    window.pithReceiveLearnedHints = (names) =>
      setLearned((current) => learnedFrom(names, current));
    return () => {
      window.pithReceiveLearnedHints = () => {};
    };
  }, []);
  return useMemo(
    () => ({
      learned,
      learn: (step: HintStep) => {
        if (!HINT_STEPS.includes(step)) return;
        setLearned((current) => ({ ...current, [step]: true }));
        tell(step);
      },
    }),
    [learned, tell],
  );
}
