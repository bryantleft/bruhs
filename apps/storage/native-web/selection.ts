import { useEffect, useState } from "react";

/**
 * The map's selection as Pith keeps it (`DiskSelection` in DiskSelection.swift): the items selected, in the order they
 * were picked, none inside another. The page says what the person clicked or pressed, a click or a ⌘-click on an item,
 * or Shift and an arrow key, and outlines what Pith answers with, never a selection of its own.
 */

declare global {
  interface Window {
    /** The items selected, by path, which Pith sends once the page is ready and whenever they change. */
    pithReceiveSelection: (paths: unknown) => void;
  }
}

/**
 * How a click or key picks an item: alone, as a click does; in or out of the selection, as a ⌘-click toggles it; or
 * added, as Shift and an arrow key add the next item, and an item selected already stays. A held key repeats before
 * Pith has answered, so it can ask for the same item twice, which a toggle would take out again.
 */
export type SelectHow = "only" | "toggle" | "add";

/** What the page tells Pith of a click on the map or a list, or a key: the items, and how they're picked. */
export interface SelectMessage {
  action: "select";
  paths: string[];
  how: SelectHow;
}

/**
 * A click on `path`, which selects just it, or on nothing, which selects nothing; a ⌘-click, which adds it or takes it
 * out; or Shift and an arrow key, which adds it.
 */
export function selectMessage(
  path: string | null,
  how: SelectHow = "only",
): SelectMessage {
  return { action: "select", paths: path === null ? [] : [path], how };
}

/** The selection Pith sent: its absolute paths, in its order, or none for anything but a list. */
export function selectionFrom(paths: unknown): readonly string[] {
  if (!Array.isArray(paths)) return [];
  return paths.filter(
    (path): path is string => typeof path === "string" && path.startsWith("/"),
  );
}

/** The items selected, as Pith last sent them: none until it has. */
export function useSelection(): readonly string[] {
  const [selected, setSelected] = useState<readonly string[]>([]);
  useEffect(() => {
    window.pithReceiveSelection = (paths) => {
      const next = selectionFrom(paths);
      // The same selection again keeps its list, so nothing that shows it draws again.
      setSelected((current) =>
        current.length === next.length &&
        current.every((path, index) => path === next[index])
          ? current
          : next,
      );
    };
    return () => {
      window.pithReceiveSelection = () => {};
    };
  }, []);
  return selected;
}
