/**
 * macOS's own icons on the disk map's page, which Pith draws and serves from its own scheme, as IconPolicy
 * (DiskProtocol.swift) allows: the URL Pith serves each at, and the page's cache of the icons it has loaded, which the
 * lists show and the map's canvas draws. Nothing here needs React, so a canvas can use it as it is.
 */

import { LARGEST_FILES_SHOWN } from "../src/lib/largest-files.ts";
import { GREW_SHOWN, UNREADABLE_SHOWN, WRITERS_SHOWN } from "./side-lists.ts";

/** How many CSS pixels across the side lists and the hover card show icons. */
export const ICON_POINTS = 16;

/** The URL Pith serves `key`'s icon at, `points` CSS pixels across at `scale` pixels each, after the base it sent. */
export const iconURL = (
  base: string,
  points: number,
  scale: number,
  key: string,
) => `${base}${points}@${scale}x/${key}.png`;

/**
 * Pixels per CSS pixel for an icon, from the page's pixel ratio, as a whole 1x, 2x or 3x, the scales Pith draws. Bigger
 * Text zooms the page, which changes its ratio.
 */
export const iconScale = (ratio: number) =>
  Number.isFinite(ratio) ? Math.min(3, Math.max(1, Math.round(ratio))) : 1;

/** Where an icon is: being loaded, loaded, or failed to load, which is remembered. */
export type IconState = "loading" | "loaded" | "failed";

/**
 * The icons the page has loaded, by URL, as images that a list shows and a canvas draws. Each URL loads once: a failed
 * load, a 404 for an icon the route refuses or an image that won't decode, is remembered rather than tried again with
 * each map, until Pith's rule changes. A new base comes with a new generation of URLs, so it starts the cache over, and
 * a load from before it is dropped when it arrives. It keeps at most `cap` loaded icons: past that, the one shown least
 * recently goes, and loads again if something shows it again.
 */
export class IconCache<T> {
  readonly #load: (url: string) => Promise<T>;
  readonly #cap: number;
  #base: string | null = null;
  /** Every icon asked for, the one used least recently first. */
  #icons = new Map<string, { state: IconState; image: T | null }>();
  #loaded = 0;
  readonly #listeners = new Set<() => void>();

  constructor(
    load: (url: string) => Promise<T>,
    cap = Number.POSITIVE_INFINITY,
  ) {
    this.#load = load;
    this.#cap = cap;
  }

  /** Follows the base Pith sent: a new one drops every icon of the last, loaded or failed. */
  setBase(base: string | null): void {
    if (base === this.#base) return;
    this.#base = base;
    this.#icons = new Map();
    this.#loaded = 0;
    this.#changed();
  }

  /** Loads `url`'s icon, unless it's loading, loaded or failed already, or belongs to another base. */
  request(url: string): void {
    if (this.#base === null || !url.startsWith(this.#base)) return;
    if (this.#icons.has(url)) return;
    const icons = this.#icons;
    const icon: { state: IconState; image: T | null } = {
      state: "loading",
      image: null,
    };
    icons.set(url, icon);
    this.#load(url).then(
      (image) => {
        if (icons !== this.#icons) return;
        icon.state = "loaded";
        icon.image = image;
        this.#loaded += 1;
        this.#used(url);
        this.#keepCap();
        this.#changed();
      },
      () => {
        if (icons !== this.#icons) return;
        icon.state = "failed";
        this.#changed();
      },
    );
  }

  /**
   * Lets the failed loads be tried again, as when Pith's rule changes: the route answers by the same rule, so what it
   * refused while macOS was asking it may allow now. Loaded icons stay.
   */
  forgetFailures(): void {
    let forgot = false;
    for (const [url, icon] of this.#icons) {
      if (icon.state !== "failed") continue;
      this.#icons.delete(url);
      forgot = true;
    }
    if (forgot) this.#changed();
  }

  /** Where `url`'s icon is. A list that shows it reads this, which counts as using it. */
  state(url: string): IconState | undefined {
    return this.#used(url)?.state;
  }

  /**
   * Whether any of `urls` has an icon to show or may yet: one has loaded, is loading or hasn't been asked for, rather
   * than failed. Null stands for an item with no icon.
   */
  mayShowAny(urls: readonly (string | null)[]): boolean {
    return urls.some((url) => url !== null && this.state(url) !== "failed");
  }

  /** `url`'s icon once it has loaded, for a canvas to draw, which counts as using it. */
  image(url: string): T | null {
    return this.#used(url)?.image ?? null;
  }

  /** Calls `listener` whenever an icon loads or fails, or the cache starts over; what it returns stops that. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #changed(): void {
    for (const listener of this.#listeners) listener();
  }

  /** `url`'s icon, moved to the end of the order as the one used most recently. */
  #used(url: string) {
    const icon = this.#icons.get(url);
    if (icon !== undefined) {
      this.#icons.delete(url);
      this.#icons.set(url, icon);
    }
    return icon;
  }

  /** Lets the loaded icons used least recently go until no more than the cap are kept. */
  #keepCap(): void {
    for (const [url, icon] of this.#icons) {
      if (this.#loaded <= this.#cap) return;
      if (icon.state !== "loaded") continue;
      this.#icons.delete(url);
      this.#loaded -= 1;
    }
  }
}

/** Loads an icon as an image a canvas can draw: Pith serves it from the page's own origin, so the canvas stays readable. */
async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

/**
 * How many loaded icons the page keeps: as many as the map, the lists and the hover card can show at once.
 * - The map shows an icon only on a header strip or on a block with room for it and a name, so each icon has a patch
 *   of the map to itself of at least 19 by 16 px, the narrowest depth-2 strip: at most 1,562 on the 776 by 612 px map
 *   of Disk's usual window. Real folders show far fewer. Of the 8,474 folders of three real maps (a startup disk, a
 *   repository and a generated fixture), the most icons one showed was 152 at that size, and 271 on a 2,600 by
 *   1,500 px map, a full-screen window on a 6K display.
 * - The side lists show at most Largest files' rows and those of Grew since, Wrote the most since and Couldn't read
 *   (side-lists.ts). The hover card shows one.
 * An icon decoded at 2x takes 2.3 to 4 KiB (12 to 16 pt), and at 3x 5 to 9 KiB, so the cap holds at most about
 * 7 MiB of them at 2x and 16 MiB at 3x.
 */
export const PAGE_ICON_CAP =
  Math.floor((776 * 612) / (19 * 16)) +
  LARGEST_FILES_SHOWN +
  GREW_SHOWN +
  WRITERS_SHOWN +
  UNREADABLE_SHOWN +
  1;

/** The page's icons. */
export const pageIcons = new IconCache(loadImage, PAGE_ICON_CAP);
