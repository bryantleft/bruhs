import { folderBelow } from "../src/lib/display-names.ts";
import { formatBytes } from "../src/lib/format.ts";
import { GREW_SHOWN } from "./side-lists.ts";

/**
 * A row of Grew since, worded as Largest files' rows are: the item's name, the folder it's in on a second line, and how
 * much it grew where they have a file's size.
 */
export interface GrewRow {
  readonly path: string;
  /** Its own name, the last part of its path, which the row leads with. */
  readonly name: string;
  /**
   * The folder it's in, as Largest files gives a file's (`folderBelow`): from below the open folder on, whose own name
   * the path bar shows. Null for an item right in the open folder, whose row is its name alone.
   */
  readonly folder: string | null;
  /** How much it grew, with a plus. */
  readonly figure: string;
  /** What VoiceOver hears: its name, how much it grew, and the folder it's in. */
  readonly label: string;
}

/**
 * What grew most inside the open folder `here` since the last scan of the scan's folder, of `changes`, by path: the
 * items that grew, most first, as many as Grew since shows.
 */
export function grewRows(
  changes: ReadonlyMap<string, number>,
  here: string,
  shown = GREW_SHOWN,
): GrewRow[] {
  const prefix = here === "/" ? "/" : `${here}/`;
  return [...changes]
    .filter(([path, delta]) => delta > 0 && path.startsWith(prefix))
    .sort((a, b) => b[1] - a[1])
    .slice(0, shown)
    .map(([path, delta]) => {
      const name = path.slice(path.lastIndexOf("/") + 1);
      const folder = folderBelow(path, here);
      const figure = `+${formatBytes(delta)}`;
      const label =
        folder === null
          ? `${name}, ${figure}`
          : `${name}, ${figure}, in ${folder}`;
      return { path, name, folder, figure, label };
    });
}

/**
 * Wrote the most since's heading, which follows Grew since's, of the date of the baseline `since`: since then, when the
 * apps' stretch begins with it, rather than the date again, or since the day Pith's history begins, `writersSince`,
 * when that's later.
 */
export function writersHeading(since: string, writersSince?: string): string {
  return writersSince === undefined || writersSince === since
    ? "Wrote the most since then"
    : `Wrote the most since ${writersSince}`;
}
