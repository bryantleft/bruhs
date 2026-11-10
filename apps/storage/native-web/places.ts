import { formatBytes } from "../src/lib/format.ts";
import type { TreeNode, UnreadableNode } from "../src/lib/types.ts";
import { PLACES_SHOWN } from "./side-lists.ts";

/**
 * Places, which opens the disk map's side column at the startup disk's root and the home folder: the well-known places
 * inside the open folder, such as the Photos library, Mail and Developer, each with its size or a word on why Pith
 * can't read it. Native sends the table beside the live map (`PlacesTable` in KnownPlaces.swift), and only for the live
 * map of the startup disk. Places are shortcuts, not a partition (the Photos library sits inside Pictures), so the
 * section gives no total.
 */

/** A known place the live map has, as native sends it. */
export interface Place {
  readonly id: string;
  /** Its name, as KnownPlaces names it. */
  readonly name: string;
  readonly path: string;
  /**
   * Its icon's key, `place/<id>`, or the empty Trash's, `place/trash-empty`, while the Trash holds nothing by the
   * scanner's word (`KnownPlaces.trashHoldsNothing`).
   */
  readonly key: string;
  /** Its size as the map shows it, or null where Pith can't read it. */
  readonly size: number | null;
  /**
   * Pith can't read it yet because macOS is still asking the person about it, which answering settles, rather than
   * because only Full Disk Access would let Pith in.
   */
  readonly asking: boolean;
}

export interface PlacesTable {
  /** The folders the section shows at: the startup disk's root and the home folder. */
  readonly shownAt: readonly string[];
  /** The places the live map has, in the table's order. */
  readonly places: readonly Place[];
}

/** The smallest place the section shows by its size: 1 GB, in the decimal units `formatBytes` counts sizes in. */
export const PLACE_MIN_BYTES = 1000 ** 3;

/** What a place Pith can't read shows in place of its size. */
export const NEEDS_ACCESS = "Needs Full Disk Access";

/**
 * What a place macOS is still asking the person about shows instead: the asking notice on the same screen says that
 * answering is enough, and Full Disk Access isn't needed.
 */
export const WAITING_FOR_ANSWER = "Waiting for your answer";

/** A place's size as the map writes the same folder's, or why Pith can't give one. */
export const placeFigure = (place: Place) =>
  place.size !== null
    ? formatBytes(place.size)
    : place.asking
      ? WAITING_FOR_ANSWER
      : NEEDS_ACCESS;

/**
 * The places the section shows with `folder` open: none unless it's a folder the table shows at. Otherwise the places
 * inside it, up to six: first those of 1 GB or more, largest first, then those Pith can't read, in the table's order.
 * A smaller place doesn't show. Paths compare composed, since native's come from `URL`, decomposed, while the scanner
 * names folders as the disk spells them.
 */
export function placesIn(table: PlacesTable | null, folder: string): Place[] {
  const open = folder.normalize("NFC");
  if (!table?.shownAt.some((shown) => shown.normalize("NFC") === open)) {
    return [];
  }
  const prefix = open === "/" ? "/" : `${open}/`;
  const inside = table.places.filter((place) =>
    place.path.normalize("NFC").startsWith(prefix),
  );
  // Array.prototype.sort is stable, so places of one size keep the table's order.
  const sized = inside
    .filter((place) => place.size !== null && place.size >= PLACE_MIN_BYTES)
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  const unreadable = inside.filter((place) => place.size === null);
  return [...sized, ...unreadable].slice(0, PLACES_SHOWN);
}

/**
 * The open folder's folders the map couldn't read, which Couldn't read lists: all but those Places shows already, so a
 * place Pith can't read is named once on the screen, in Places. Paths compare composed, as `placesIn` compares them.
 */
export function unreadableBesides(
  children: readonly TreeNode[],
  shown: readonly Place[],
): UnreadableNode[] {
  const named = new Set(shown.map((place) => place.path.normalize("NFC")));
  return children.filter(
    (child): child is UnreadableNode =>
      child.kind === "unreadable" && !named.has(child.path.normalize("NFC")),
  );
}

/** The table native sends, as JSON, as the page uses it: null for anything else. */
export function readPlaces(text: unknown): PlacesTable | null {
  if (typeof text !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { shownAt, places } = value as Record<string, unknown>;
  if (
    !Array.isArray(shownAt) ||
    !shownAt.every((folder) => typeof folder === "string") ||
    !Array.isArray(places)
  ) {
    return null;
  }
  const read: Place[] = [];
  for (const item of places) {
    if (typeof item !== "object" || item === null) return null;
    const { id, name, path, key, size, asking } = item as Record<
      string,
      unknown
    >;
    if (
      typeof id !== "string" ||
      typeof name !== "string" ||
      typeof path !== "string" ||
      typeof key !== "string" ||
      (asking !== undefined && typeof asking !== "boolean")
    ) {
      return null;
    }
    // Native leaves the size out, or sends null, for a place Pith can't read, and says when macOS is still asking.
    if (size === undefined || size === null) {
      read.push({ id, name, path, key, size: null, asking: asking === true });
    } else if (
      typeof size === "number" &&
      Number.isSafeInteger(size) &&
      size >= 0
    ) {
      read.push({ id, name, path, key, size, asking: false });
    } else {
      return null;
    }
  }
  return { shownAt, places: read };
}
