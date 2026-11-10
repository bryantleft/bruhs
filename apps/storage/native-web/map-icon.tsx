import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { MapIcons } from "../src/components/map-marks";
import { useDevicePixelRatio } from "../src/components/treemap-canvas";
import {
  type IconItem,
  type IconRule,
  iconKey,
  NO_OWNERS,
  readIconRule,
  readOwners,
} from "./icon-rule";
import {
  ICON_POINTS,
  type IconState,
  iconScale,
  iconURL,
  pageIcons,
} from "./icons";

declare global {
  interface Window {
    /**
     * Where Pith serves macOS's icons for the map, `pith://app/icon/<generation>/<appearance>/`, which an icon's
     * `<points>@<scale>x/<key>.png` follows, and Pith's rule for each item's key, as JSON (`IconRule` in
     * KnownPlaces.swift). Pith sends both once the page is ready, and again when either changes: the base with a new
     * generation when the appearance changes, since WebKit keeps an image from Pith's scheme for as long as its URL
     * stays the same, and the rule when macOS starts or stops asking.
     */
    pithReceiveIconBase: (base: string | null, rule?: string | null) => void;
    /** The icons' base as Pith last sent it. */
    pithIconBase?: string;
    /**
     * The apps that own the folders the map couldn't read, by folder, as JSON (`KnownPlaces.owners`). Pith sends them
     * with a map, once the page is ready and whenever they change.
     */
    pithReceiveOwners: (owners: string | null) => void;
  }
}

/**
 * Where `url`'s icon is in the page's cache, which loads it while something shows it and the cache hasn't got it, as
 * when a failure it remembered is forgotten. Nothing without a URL.
 */
function useIcon(url: string | null): IconState | undefined {
  const state = useSyncExternalStore(pageIcons.subscribe, () =>
    url === null ? undefined : pageIcons.state(url),
  );
  useEffect(() => {
    if (url !== null && state === undefined) pageIcons.request(url);
  }, [url, state]);
  return state;
}

/**
 * Whether any of `urls` has an icon to show or may yet (`IconCache.mayShowAny`), so a list whose every icon failed
 * shows none, rather than a column of empty slots.
 */
export function useAnyIcon(urls: readonly (string | null)[]): boolean {
  return useSyncExternalStore(pageIcons.subscribe, () =>
    pageIcons.mayShowAny(urls),
  );
}

/**
 * A 16 px icon from Pith, as macOS draws it. It's decorative, since the name beside it says what it is. Its room stays
 * empty while it loads and when there's none to show, unless `fallback` is given to show instead.
 */
export function MapIcon({
  url,
  fallback,
  className = "",
}: {
  url: string | null;
  fallback?: ReactNode;
  className?: string;
}) {
  const state = useIcon(url);
  const box = `size-4 shrink-0 ${className}`.trim();
  const room = <span aria-hidden="true" className={box} />;
  if (url === null || state === "failed") {
    return fallback === undefined ? room : fallback;
  }
  if (state !== "loaded") return room;
  return <img src={url} alt="" draggable={false} className={box} />;
}

/**
 * The apps that own the folders the map couldn't read, by folder, as Pith last sent them: a Couldn't read row shows its
 * owner's icon in place of the rule's plain folder. None until Pith sends them.
 */
export function useOwners(): ReadonlyMap<string, string> {
  const [owners, setOwners] = useState(NO_OWNERS);
  useEffect(() => {
    window.pithReceiveOwners = (text) => setOwners(readOwners(text));
    return () => {
      window.pithReceiveOwners = () => {};
    };
  }, []);
  return owners;
}

/** The URLs of macOS's icons for the page, at its own pixel ratio, and the map's own icons. */
export interface PageIcons {
  /** The URL of `item`'s icon, by Pith's rule. */
  item(item: IconItem): string;
  /** The URL of the icon `key` names, such as an app's or the smaller items'. */
  key(key: string): string;
  /**
   * The icons the map's canvas draws on its strips and blocks, from the page's cache: each block's by Pith's rule, at
   * the size and pixel ratio the canvas asks for. The smaller items have none on the map.
   */
  map: MapIcons;
}

/**
 * macOS's icons for the page, once Pith has sent where they are and its rule for their keys: null until both have
 * come. It takes them as Pith sends them, keeps the page's cache on the current base, and lets icons refused under an
 * earlier rule be tried again.
 */
export function usePageIcons(): PageIcons | null {
  const [sent, setSent] = useState<{
    base: string;
    text: string;
    rule: IconRule;
  } | null>(null);
  // Icons are drawn at the page's own pixel ratio, which Bigger Text and the display change.
  const scale = iconScale(useDevicePixelRatio());
  useEffect(() => {
    // The rule as Pith last sent it.
    let lastRule: unknown = null;
    window.pithReceiveIconBase = (base, rule) => {
      const shown = typeof base === "string" ? base : undefined;
      window.pithIconBase = shown;
      // A new base is a new generation of URLs, so the icons of the last one go.
      pageIcons.setBase(shown ?? null);
      // The route answers by the rule, so what it refused under the last one, as while macOS was asking, it may allow now.
      if (rule !== lastRule) pageIcons.forgetFailures();
      lastRule = rule;
      setSent((current) => {
        if (shown === undefined || typeof rule !== "string") return null;
        // Sent again as they were, they change nothing.
        if (current?.base === shown && current.text === rule) return current;
        const parsed = readIconRule(rule);
        return parsed && { base: shown, text: rule, rule: parsed };
      });
    };
    return () => {
      window.pithReceiveIconBase = () => {};
    };
  }, []);
  return useMemo(
    () =>
      sent && {
        item: (item: IconItem) =>
          iconURL(sent.base, ICON_POINTS, scale, iconKey(item, sent.rule)),
        key: (key: string) => iconURL(sent.base, ICON_POINTS, scale, key),
        map: {
          url: (tile, points, ratio) =>
            tile.kind === "group"
              ? null
              : iconURL(
                  sent.base,
                  points,
                  iconScale(ratio),
                  iconKey(tile.node, sent.rule),
                ),
          image: (url) => pageIcons.image(url),
          failed: (url) => pageIcons.state(url) === "failed",
          request: (url) => pageIcons.request(url),
          subscribe: pageIcons.subscribe,
        },
      },
    [sent, scale],
  );
}
