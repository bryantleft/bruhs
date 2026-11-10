/**
 * How many rows each of the page's side lists shows at most, beside Largest files' `LARGEST_FILES_SHOWN`. The page's
 * icon cache keeps room for all of them at once (`PAGE_ICON_CAP` in icons.ts).
 */

/** Places: the well-known places inside the open folder, at the startup disk's root and the home folder. */
export const PLACES_SHOWN = 6;
/** Grew since: what grew most inside the open folder. */
export const GREW_SHOWN = 5;
/** Wrote the most since: the apps that wrote the most, as Pith's history ranks them. */
export const WRITERS_SHOWN = 5;
/** Couldn't read: the open folder's folders the scan couldn't read; Pith's notice lists the rest. */
export const UNREADABLE_SHOWN = 6;
