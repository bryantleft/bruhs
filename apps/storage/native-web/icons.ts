/**
 * macOS's own icons on the disk map's page, which Pith draws and serves from its own scheme, as IconPolicy
 * (DiskProtocol.swift) allows: the URL Pith serves each at, and the page's cache of the icons it has loaded, which the
 * lists show and a canvas can draw. Nothing here needs React, so a canvas can use it as it is.
 */

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
 * a load from before it is dropped when it arrives.
 */
export class IconCache<T> {
  readonly #load: (url: string) => Promise<T>;
  #base: string | null = null;
  #icons = new Map<string, { state: IconState; image: T | null }>();
  readonly #listeners = new Set<() => void>();

  constructor(load: (url: string) => Promise<T>) {
    this.#load = load;
  }

  /** Follows the base Pith sent: a new one drops every icon of the last, loaded or failed. */
  setBase(base: string | null): void {
    if (base === this.#base) return;
    this.#base = base;
    this.#icons = new Map();
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

  state(url: string): IconState | undefined {
    return this.#icons.get(url)?.state;
  }

  /**
   * Whether any of `urls` has an icon to show or may yet: one has loaded, is loading or hasn't been asked for, rather
   * than failed. Null stands for an item with no icon.
   */
  mayShowAny(urls: readonly (string | null)[]): boolean {
    return urls.some((url) => url !== null && this.state(url) !== "failed");
  }

  /** `url`'s icon once it has loaded, for a canvas to draw. */
  image(url: string): T | null {
    return this.#icons.get(url)?.image ?? null;
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
}

/** Loads an icon as an image a canvas can draw: Pith serves it from the page's own origin, so the canvas stays readable. */
async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

/** The page's icons. */
export const pageIcons = new IconCache(loadImage);
