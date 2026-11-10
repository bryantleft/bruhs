import { useEffect, useSyncExternalStore } from "react";
import type {
  AggregateNode,
  DirNode,
  FileEntry,
  FileNode,
  TreeNode,
  UnreadableNode,
  VolumeNode,
} from "../src/lib/types.ts";

/**
 * macOS's own icons on the disk map's page, which Pith draws and serves from its own scheme, as IconPolicy
 * (DiskProtocol.swift) allows: the key Pith's icon rule gives each item, the URL Pith serves its icon at, and the
 * page's cache of the icons it has loaded, which the lists show and a canvas can draw.
 */

/** How many CSS pixels across the side lists and the hover card show icons. */
export const ICON_POINTS = 16;

/**
 * Pith's icon rule as the page applies it, from the table native sends with the icons' base (`IconRule` in
 * KnownPlaces.swift). Swift compares paths by canonical equivalence, and the places' paths come from `URL`, decomposed,
 * while the scanner names items as the disk spells them, so the page compares paths composed.
 */
export interface IconRule {
  /** The known places' ids by composed path. A place shows its own icon, read or not. */
  readonly places: ReadonlyMap<string, string>;
  /** The locations macOS guards, composed. A Photos library is guarded wherever it is. */
  readonly guarded: readonly string[];
  /** Whether macOS may be holding some of the map's folders: it's asking about some, or the map is catching up. */
  readonly asking: boolean;
}

/** What the rule reads of an item: its kind and path, and of a folder whether the map has listed it. */
export type IconItem =
  | Pick<
      FileNode | AggregateNode | UnreadableNode | VolumeNode,
      "kind" | "path"
    >
  | Pick<DirNode, "kind" | "path" | "size" | "files" | "children">;

const FOLDER_KEY = "folder";
/** The key of the map's smaller items, which show a group. */
export const GROUP_KEY = "group";

/** Each byte as `IconKey.string` writes it: ASCII letters, digits and `-._~` as they are, any other byte escaped. */
const SPELLED = Array.from({ length: 256 }, (_, byte) => {
  const char = String.fromCharCode(byte);
  return /^[A-Za-z0-9\-._~]$/.test(char)
    ? char
    : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
});
const utf8 = new TextEncoder();

/**
 * `text` as a key's payload, spelled exactly as `IconKey.string` spells it (IconStore.swift): its UTF-8 bytes, escaped
 * but for ASCII letters, digits and `-._~`, an item path's slashes included. The route refuses any other spelling, and
 * `encodeURIComponent` leaves `!'()*` as they are.
 */
function spelled(text: string): string {
  let payload = "";
  for (const byte of utf8.encode(text)) payload += SPELLED[byte];
  return payload;
}

const typeKey = (extension: string) => `type/${spelled(extension)}`;
const placeKey = (id: string) => `place/${spelled(id)}`;
/** The key of an item's own icon, which Pith looks up by its path: a folder, package, app or volume. */
export const itemKey = (path: string) => `item/${spelled(path)}`;

/**
 * A path's extension as `NSString.pathExtension` finds it: what follows the last dot of its last component, unless the
 * name before that dot is empty, `.` or `..`, or the extension holds a space.
 */
function pathExtension(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const name = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  const stem = name.slice(0, dot);
  const extension = name.slice(dot + 1);
  return stem === "" || stem === "." || stem === ".." || extension.includes(" ")
    ? ""
    : extension;
}

/** Lowercased letter by letter, as Swift's `lowercased()` does: no letter changes for its neighbours, as a final sigma would. */
const lowercased = (text: string) =>
  Array.from(text, (char) => char.toLowerCase()).join("");

/** Whether macOS guards `path`, composed: it's a guarded location or inside one, or inside a Photos library. */
function isGuarded(path: string, rule: IconRule): boolean {
  return (
    rule.guarded.some(
      (folder) => path === folder || path.startsWith(`${folder}/`),
    ) || path.split("/").some((name) => name.endsWith(".photoslibrary"))
  );
}

/** Whether the map has listed `folder`: it has a size, files or contents. */
const isListed = (folder: Pick<DirNode, "size" | "files" | "children">) =>
  folder.size > 0 || folder.files > 0 || folder.children.length > 0;

/**
 * `item`'s icon key by Pith's icon rule, as `KnownPlaces.iconKey(for:asking:)` gives it, so the page asks the route
 * for no icon it would refuse; tests/icon-keys.json holds both to the same cases. A known place shows its own icon,
 * read or not, and a file its type's. A volume shows its own, and so does a folder, package or app outside the
 * locations macOS guards. Inside one, a folder shows its own only once the map has listed it and while macOS can't be
 * holding it; otherwise, as for a folder the map couldn't read, a plain folder. The map's smaller items show a group.
 */
export function iconKey(item: IconItem, rule: IconRule): string {
  const path = item.path.normalize("NFC");
  const place = rule.places.get(path);
  if (place !== undefined) return placeKey(place);
  switch (item.kind) {
    case "file":
      return typeKey(lowercased(pathExtension(item.path)));
    case "unreadable":
      return FOLDER_KEY;
    case "aggregate":
      return GROUP_KEY;
    case "volume":
      return itemKey(item.path);
    case "dir":
      return isGuarded(path, rule) && (rule.asking || !isListed(item))
        ? FOLDER_KEY
        : itemKey(item.path);
  }
}

/** The table native sends as the rule, or null for anything else. */
export function parseIconRule(value: unknown): IconRule | null {
  if (typeof value !== "object" || value === null) return null;
  const { places, guarded, asking } = value as Record<string, unknown>;
  if (
    !Array.isArray(places) ||
    !Array.isArray(guarded) ||
    typeof asking !== "boolean"
  ) {
    return null;
  }
  const byPath = new Map<string, string>();
  for (const place of places) {
    if (typeof place !== "object" || place === null) return null;
    const { id, path } = place as Record<string, unknown>;
    if (typeof id !== "string" || typeof path !== "string") return null;
    // Of two places at one path, the first is the one Pith's rule finds.
    const composed = path.normalize("NFC");
    if (!byPath.has(composed)) byPath.set(composed, id);
  }
  const folders: string[] = [];
  for (const folder of guarded) {
    if (typeof folder !== "string") return null;
    folders.push(folder.normalize("NFC"));
  }
  return { places: byPath, guarded: folders, asking };
}

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

/**
 * The item a list names by its path alone, as Grew since does, for its icon: the map's node at `path`, found by
 * following the path down from `folder`, or else a file the map lists among the largest. Anything else is a path the
 * map doesn't show, which the rule can only take for a folder it hasn't listed.
 */
export function itemAt(
  folder: DirNode,
  path: string,
  files: readonly FileEntry[],
): IconItem {
  let node: TreeNode = folder;
  while (node.path !== path) {
    const next: TreeNode | undefined =
      node.kind === "dir"
        ? node.children.find(
            (child) =>
              child.path === path ||
              (child.kind === "dir" && path.startsWith(`${child.path}/`)),
          )
        : undefined;
    if (!next) {
      return files.some((file) => file.path === path)
        ? { kind: "file", path }
        : { kind: "dir", path, size: 0, files: 0, children: [] };
    }
    node = next;
  }
  return node;
}

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

/**
 * Where `url`'s icon is in the page's cache, which loads it while something shows it and the cache hasn't got it, as
 * when a failure it remembered is forgotten. Nothing without a URL.
 */
export function useIcon(url: string | null): IconState | undefined {
  const state = useSyncExternalStore(pageIcons.subscribe, () =>
    url === null ? undefined : pageIcons.state(url),
  );
  useEffect(() => {
    if (url !== null && state === undefined) pageIcons.request(url);
  }, [url, state]);
  return state;
}
