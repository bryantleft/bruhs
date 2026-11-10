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
 * Pith's icon rule as the disk map's page applies it: the key `KnownPlaces.iconKey(for:asking:)` gives each item, from
 * the table native sends with the icons' base (`IconRule` in KnownPlaces.swift). This copy can drift from Swift's, so
 * tests/icon-keys.json holds both to the same cases, from both test suites.
 */

/**
 * The table, as the page applies it. Swift compares paths by canonical equivalence, and the places' paths come from
 * `URL`, decomposed, while the scanner names items as the disk spells them, so the page compares paths composed.
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
 * for no icon it would refuse. A known place shows its own icon, read or not, and a file its type's. A volume shows
 * its own, and so does a folder, package or app outside the locations macOS guards. Inside one, a folder shows its own
 * only once the map has listed it and while macOS can't be holding it; otherwise, as for a folder the map couldn't
 * read, a plain folder. The map's smaller items show a group.
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

/** The table native sends with the icons' base, as JSON, as the rule: null for anything else. */
export function readIconRule(text: unknown): IconRule | null {
  if (typeof text !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
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

/** No owners: each folder the map couldn't read keeps the rule's key. */
export const NO_OWNERS: ReadonlyMap<string, string> = new Map();

/**
 * The apps that own folders the map couldn't read, by folder, as native sends them with the map (`KnownPlaces.owners`):
 * each folder's owner's key, an app's `item/<bundle>`, which a Couldn't read row shows in place of the rule's plain
 * folder. Native finds them, since only it can ask LaunchServices for a container's app. No owners for anything else.
 */
export function readOwners(text: unknown): ReadonlyMap<string, string> {
  if (typeof text !== "string") return NO_OWNERS;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return NO_OWNERS;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return NO_OWNERS;
  }
  const owners = new Map<string, string>();
  for (const [folder, key] of Object.entries(value)) {
    if (typeof key !== "string") return NO_OWNERS;
    owners.set(folder, key);
  }
  return owners;
}

/**
 * The key a Couldn't read row shows for `folder`, a folder the map couldn't read: the app that owns it when native names
 * one (`readOwners`), and otherwise the rule's, its place's own icon or a plain folder.
 */
export function unreadableKey(
  folder: IconItem,
  owners: ReadonlyMap<string, string>,
  rule: IconRule,
): string {
  return owners.get(folder.path) ?? iconKey(folder, rule);
}

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
