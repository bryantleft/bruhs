import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { LargestFiles } from "../src/components/largest-files";
import { PathRow } from "../src/components/path-row";
import { TreemapCanvas } from "../src/components/treemap-canvas";
import { splitFolder, splitName } from "../src/lib/display-names";
import { formatBytes } from "../src/lib/format";
import { LARGEST_FILES_SHOWN, largestFilesIn } from "../src/lib/largest-files";
import type { HintStep } from "../src/lib/map-hints";
import { parseResultEvent } from "../src/lib/protocol";
import { findByPath } from "../src/lib/tree-utils";
import {
  type Kind,
  kindBytesByFolder,
  nodeOf,
} from "../src/lib/treemap-layout";
import type {
  DirNode,
  FileEntry,
  ResultEvent,
  TreeNode,
} from "../src/lib/types";
import { grewRows, writersHeading } from "./grew-since";
import { useLearnedHints } from "./hints";
import { GROUP_KEY, itemAt, itemKey } from "./icon-rule";
import { KindLegend } from "./kind-legend";
import { MapIcon, useAnyIcon, useOwners, usePageIcons } from "./map-icon";
import { type NavigationAction, NO_MAP, navigate } from "./navigation";
import { placesIn, unreadableBesides } from "./places";
import { Places, usePlaces } from "./places-section";
import { type SelectMessage, selectMessage, useSelection } from "./selection";
import { UNREADABLE_SHOWN, WRITERS_SHOWN } from "./side-lists";
import { useUsedSpace } from "./used-space";
import "./styles.css";

/**
 * What the page tells Pith: a click or ⌘-click that selects, which Pith answers with the selection; the open folder,
 * with one gone back or forward to that the map leaves out and whether Back and Forward can go anywhere; a click hint
 * the map learned, which Pith keeps in its settings; and requests for native actions: an item's menu, Quick Look and
 * Move to Trash for the items selected, "Where the space is" for the Not measured block, and Full Disk Access in
 * System Settings for a place Pith can't read.
 */
type Message =
  | { action: "ready" }
  | SelectMessage
  | {
      action: "location";
      path: string;
      wanted: string | null;
      canGoBack: boolean;
      canGoForward: boolean;
    }
  | { action: "menu"; path: string | null }
  | { action: "quickLook"; paths: readonly string[] }
  | { action: "trash"; paths: readonly string[] }
  | { action: "learnedHint"; hint: HintStep }
  | { action: "whereTheSpaceIs" }
  | { action: "fullDiskAccess" };

/** What grew since the last scan of the same folder: bytes by path, and when that scan was. */
interface Writer {
  name: string;
  bytes: number;
  /** The app's bundle, whose icon shows beside its name; none for a process without one. */
  bundle?: string;
}

interface Growth {
  since: string;
  changes: ReadonlyMap<string, number>;
  /** The apps that wrote the most to disk over the same stretch, from Pith's kept history. */
  writers: readonly Writer[];
  /** When that history begins, if later than `since`. */
  writersSince?: string;
}

/** What grew, as Pith sends it: with the writers only while Pith keeps a week of Activity's history to find them in. */
interface GrowthMessage {
  since: string;
  changes: Record<string, number>;
  writers?: unknown;
  writersSince?: unknown;
}

/** The writers Pith sent, each with a name and a byte count and maybe its app's bundle, or none, as many as the list shows. */
function parseWriters(value: unknown): Writer[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, WRITERS_SHOWN).flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const { name, bytes, bundle } = item as Record<string, unknown>;
    return typeof name === "string" &&
      typeof bytes === "number" &&
      Number.isFinite(bytes) &&
      bytes > 0
      ? [
          {
            name,
            bytes,
            bundle:
              typeof bundle === "string" && bundle.startsWith("/")
                ? bundle
                : undefined,
          },
        ]
      : [];
  });
}

declare global {
  interface Window {
    /** A map, true for `atOnce` when it answers the person's own action, as moving an item to the Trash does. */
    pithReceive: (payload: string | null, atOnce?: boolean) => void;
    pithReceiveGrowth: (growth: GrowthMessage | null) => void;
    /** How long macOS waits for a second click to make a double-click, in seconds. */
    pithReceiveDoubleClickInterval: (seconds: number) => void;
    /** Whether macOS's Differentiate Without Color is on. */
    pithReceiveDifferentiateWithoutColor: (on: boolean) => void;
    /** Whether a scan is running, which Pith shows over the earlier map, dimmed, taking no clicks on it meanwhile. */
    pithReceiveScanning: (on: boolean) => void;
    /**
     * Pith's path bar and Go menu: open a folder of the map, go back or forward through the folders opened, or up
     * to the open folder's enclosing folder.
     */
    pithCommand: (
      command: "open" | "back" | "forward" | "up",
      path?: string | null,
    ) => void;
    webkit?: {
      messageHandlers?: {
        pith?: {
          postMessage: (message: Message) => void;
        };
      };
    };
  }
}

function post(message: Message): void {
  window.webkit?.messageHandlers?.pith?.postMessage(message);
}

/**
 * How long macOS waits for a second click to make a double-click, in milliseconds, which the map holds still for
 * after a click. Pith sends it once the page is ready and again when the setting changes; until then, macOS's default.
 */
function useDoubleClickInterval(): number {
  const [doubleClick, setDoubleClick] = useState(500);
  useEffect(() => {
    window.pithReceiveDoubleClickInterval = (seconds) => {
      if (Number.isFinite(seconds) && seconds > 0) {
        setDoubleClick(seconds * 1000);
      }
    };
    return () => {
      window.pithReceiveDoubleClickInterval = () => {};
    };
  }, []);
  return doubleClick;
}

/**
 * Whether macOS's Differentiate Without Color is on: then the map's file blocks and By kind show each kind's glyph,
 * the cue that doesn't need colour. A web page can't read the setting, so Pith sends it once the page is ready and
 * again whenever it changes; until then, off.
 */
function useDifferentiateWithoutColor(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    window.pithReceiveDifferentiateWithoutColor = (value) =>
      setOn(value === true);
    return () => {
      window.pithReceiveDifferentiateWithoutColor = () => {};
    };
  }, []);
  return on;
}

/**
 * Whether a scan is running. Pith shows the earlier map meanwhile, dimmed, and takes no clicks on it, so its hover cards
 * offer none. A web page can't tell, so Pith sends it once the page is ready and again whenever it changes; until then,
 * none is.
 */
function useScanning(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    window.pithReceiveScanning = (value) => setOn(value === true);
    return () => {
      window.pithReceiveScanning = () => {};
    };
  }, []);
  return on;
}

function DiskMap() {
  const [result, setResult] = useState<ResultEvent | null>(null);
  // Whether the map answers the person's own action, which the map shows at once, however still it holds.
  const [atOnce, setAtOnce] = useState(false);
  // The open folders and where Back and Forward go, which Pith's path bar and Go menu move.
  const [nav, dispatch] = useReducer(navigate, NO_MAP);
  // The items selected, as Pith keeps them: it drops what a newer map or the open folder no longer shows.
  const selected = useSelection();
  const [hovered, setHovered] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [growth, setGrowth] = useState<Growth | null>(null);
  // macOS's icons, once Pith has sent where they are and its rule for each item's key.
  const icons = usePageIcons();
  // Taken before the page says it's ready too, since they come with the first map: the Places section's table, and
  // the apps that own the folders the map couldn't read.
  const places = usePlaces();
  const owners = useOwners();
  // Taken before the page says it's ready, as the icons are.
  const doubleClickInterval = useDoubleClickInterval();
  const glyphs = useDifferentiateWithoutColor();
  const scanning = useScanning();
  const accounted = useUsedSpace();
  // The click hints the map has learned, which Pith keeps in its settings so they stay learned in every window.
  const tellHint = useCallback(
    (hint: HintStep) => post({ action: "learnedHint", hint }),
    [],
  );
  const hints = useLearnedHints(tellHint);
  // The folder of the last map, kept across an empty payload: a map of another folder stops highlighting.
  const mapRoot = useRef<string | null>(null);

  useEffect(() => {
    window.pithReceive = (payload, answers) => {
      try {
        const value: unknown = payload === null ? null : JSON.parse(payload);
        const parsed = value === null ? null : parseResultEvent(value);
        if (value !== null && parsed === null) {
          setError(
            "The scanner result is unsupported. Rebuild Pith and scan again.",
          );
          return;
        }
        setError(null);
        setResult(parsed);
        setAtOnce(answers === true);
        // The live map sends a newer map as the disk changes: what's under the pointer stays while it's still there,
        // and so does what's selected, which Pith keeps.
        const stillThere = (path: string | null) =>
          path !== null &&
          parsed !== null &&
          (findByPath(parsed.root, path) !== null ||
            parsed.topFiles.some((file) => file.path === path));
        setHovered((path) => (stillThere(path) ? path : null));
        if (parsed) {
          if (mapRoot.current !== parsed.root.path) setHighlight(null);
          mapRoot.current = parsed.root.path;
        }
        dispatch({ type: "received", root: parsed?.root ?? null });
      } catch {
        setError("The disk map could not read this scan. Try scanning again.");
      }
    };
    window.pithReceiveGrowth = (value) => {
      if (!value || typeof value.since !== "string") {
        setGrowth(null);
        return;
      }
      const changes = new Map<string, number>();
      for (const [path, delta] of Object.entries(value.changes ?? {})) {
        if (typeof delta === "number" && Number.isFinite(delta))
          changes.set(path, delta);
      }
      setGrowth({
        since: value.since,
        changes,
        writers: parseWriters(value.writers),
        writersSince:
          typeof value.writersSince === "string"
            ? value.writersSince
            : undefined,
      });
    };
    post({ action: "ready" });
    return () => {
      window.pithReceive = () => {};
      window.pithReceiveGrowth = () => {};
    };
  }, []);

  // Stable handlers, so hovering the map doesn't re-render its long item list. A click selects just the item clicked,
  // or nothing; a ⌘-click adds it or takes it out; Shift and an arrow add the next. Pith answers with the selection,
  // which the page then shows.
  const select = useCallback(
    (path: string | null) => post(selectMessage(path)),
    [],
  );
  const toggle = useCallback(
    (path: string) => post(selectMessage(path, "toggle")),
    [],
  );
  const addNode = useCallback((node: TreeNode) => {
    if (node.kind === "dir" || node.kind === "file") {
      post(selectMessage(node.path, "add"));
    }
  }, []);
  const selectNode = useCallback(
    (node: TreeNode | null) =>
      select(
        node && (node.kind === "dir" || node.kind === "file")
          ? node.path
          : null,
      ),
    [select],
  );
  const toggleNode = useCallback(
    (node: TreeNode) => {
      if (node.kind === "dir" || node.kind === "file") toggle(node.path);
    },
    [toggle],
  );
  const showMenu = useCallback(
    (path: string | null) => post({ action: "menu", path }),
    [],
  );
  const preview = useCallback(
    (paths: readonly string[]) => post({ action: "quickLook", paths }),
    [],
  );
  const trash = useCallback(
    (paths: readonly string[]) => post({ action: "trash", paths }),
    [],
  );
  const explainNotMeasured = useCallback(
    () => post({ action: "whereTheSpaceIs" }),
    [],
  );
  const askForAccess = useCallback(
    () => post({ action: "fullDiskAccess" }),
    [],
  );
  const selectFile = useCallback(
    (file: FileEntry) => select(file.path),
    [select],
  );
  // A ⌘-click in the side lists adds an item as one on the map does, and the map's card stops saying how.
  const toggleClicked = useCallback(
    (path: string) => {
      if (!hints.learned.several) hints.learn("several");
      toggle(path);
    },
    [hints, toggle],
  );
  const toggleFile = useCallback(
    (file: FileEntry) => toggleClicked(file.path),
    [toggleClicked],
  );

  /**
   * Show another folder; the hover belonged to the old one. Pith keeps the items selected that are still on the map,
   * those inside the folder shown, once the page says where it is.
   */
  const go = useCallback((action: NavigationAction) => {
    dispatch(action);
    setHovered(null);
  }, []);
  const current = nav.trail.at(-1) ?? null;
  const here = current?.path;
  // The column beside the map starts at its top in each folder opened, Back and Forward included, as a page of its own
  // would. A newer map of the same folder, as the live map sends every two seconds while the disk changes, keeps its
  // place: this runs as the folder changes, not with each map, and before the browser paints the new folder.
  const column = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (here !== undefined) column.current?.scrollTo({ top: 0 });
  }, [here]);
  // The map opens a folder further down one level at a time, all from here: one step back.
  const openFolder = useCallback(
    (folder: DirNode) => go({ type: "open", path: folder.path, from: here }),
    [go, here],
  );
  // A place opens straight from here, however far down it is.
  const openPlace = useCallback(
    (path: string) => go({ type: "open", path, from: here }),
    [go, here],
  );

  // Pith's path bar and Go menu (Back, Forward and Enclosing Folder) move the map, wherever focus is.
  useEffect(() => {
    window.pithCommand = (command, path) => {
      if (command === "open") {
        if (typeof path === "string") go({ type: "open", path });
      } else if (
        command === "back" ||
        command === "forward" ||
        command === "up"
      ) {
        go({ type: command });
      }
    };
  }, [go]);

  // Pith's path bar and bar under the map show the open folder, its live map shows a folder still wanted in detail
  // so the next map holds it, and its Go menu offers Back and Forward when they can go somewhere.
  const wanted = nav.wanted?.at(-1) ?? null;
  useEffect(() => {
    if (current) {
      post({
        action: "location",
        path: current.path,
        wanted,
        canGoBack: nav.back.length > 0,
        canGoForward: nav.forward.length > 0,
      });
    }
  }, [current, wanted, nav.back, nav.forward]);

  // Copy with items selected copies their paths, each on a line of its own, as Finder's Copy does with files' names.
  useEffect(() => {
    const onCopy = (event: ClipboardEvent) => {
      if (selected.length === 0 || window.getSelection()?.toString()) return;
      event.clipboardData?.setData("text/plain", selected.join("\n"));
      event.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [selected]);
  const kindBytes = useMemo(
    () => (current ? (kindBytesByFolder(current).get(current) ?? null) : null),
    [current],
  );
  const files = useMemo(
    () =>
      current && result
        ? largestFilesIn(current, result.topFiles, LARGEST_FILES_SHOWN)
        : [],
    [current, result],
  );
  // A kind the open folder doesn't hold would dim everything, so it stops highlighting.
  const shownKind =
    highlight !== null && kindBytes !== null && kindBytes[highlight] > 0
      ? highlight
      : null;
  // The apps under Wrote the most since show their own icons, by their bundles. A list where none can, because none
  // has a bundle or every one's icon failed, keeps no room for them.
  const writerIcons = (growth?.writers ?? []).map((writer) =>
    icons && writer.bundle ? icons.key(itemKey(writer.bundle)) : null,
  );
  const showsWriterIcons = useAnyIcon(writerIcons);

  if (error) {
    return (
      <p
        role="alert"
        className="text-body-sm p-4 text-(--role-status-critical)"
      >
        {error}
      </p>
    );
  }
  // Before a map the page stays empty: Pith's bar above says there's no map yet and holds the disk menu.
  if (!result || !current) return null;

  // At the root of a map of a whole volume, the used space the scan couldn't measure takes a block of its own, and the
  // root's shares are of the volume's used space.
  const usedSpace =
    accounted !== null &&
    accounted.root === result.root.path &&
    current.path === result.root.path
      ? accounted.usedSpace
      : undefined;
  // The well-known places in the open folder, at the startup disk's root and the home folder of its live map.
  const shownPlaces = placesIn(places, current.path);
  // Unreadable folders in the open folder, which the map can't size, so it lists them instead: all but the places
  // Places names already.
  const unreadable = unreadableBesides(current.children, shownPlaces);
  // What grew most inside the open folder since the last scan of the scan's folder.
  const grew = growth ? grewRows(growth.changes, current.path) : [];

  return (
    <main className="flex h-full min-h-0 flex-col gap-2 px-4 pt-3 pb-4">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_17rem] gap-5">
        <section aria-label="Disk space treemap" className="min-h-0">
          <TreemapCanvas
            root={current}
            // The live map comes again every two seconds while the disk changes.
            steady
            doubleClickInterval={doubleClickInterval}
            atOnce={atOnce}
            followSystemAppearance
            highlightKind={shownKind}
            linkedPath={hovered}
            onHoverPath={setHovered}
            selectedPaths={selected}
            onSelect={selectNode}
            onToggle={toggleNode}
            onAdd={addNode}
            onEnterDir={openFolder}
            onMenu={showMenu}
            onPreview={preview}
            onTrash={trash}
            growth={growth?.changes}
            growthSince={growth?.since}
            mapIcons={icons?.map}
            kindGlyphs={glyphs}
            padlocks
            hints={hints}
            scanning={scanning}
            usedSpace={usedSpace}
            onUnmeasured={explainNotMeasured}
            icon={
              icons
                ? (tile) => {
                    // The smaller items show the group's icon; the Not measured block is no item, so it has none.
                    const node = nodeOf(tile);
                    const url =
                      tile.kind === "group"
                        ? icons.key(GROUP_KEY)
                        : node && icons.item(node);
                    return url ? <MapIcon url={url} fallback={null} /> : null;
                  }
                : undefined
            }
          />
        </section>
        {/* One scroll area, the theme's scroll bars, in which every section takes its natural height, Largest files
            included, so each row of each is reachable by scrolling, by keyboard, as focus scrolls a row into view,
            and by VoiceOver. It reaches the rows' hover edges, which stand out half a rem either side. Its scroll bar's
            room is kept whether the column overflows or not, so its rows never take another width, and other cuts, as
            a newer map tips it over: the theme's 10 px bar, which WebKit reserves for a scroll area that scrolls
            always, and draws nothing in while it fits, where `scrollbar-gutter` reserves its own, wider bar's room. */}
        <div
          ref={column}
          className="-mx-2 min-h-0 scroll-py-1 overflow-y-scroll px-2"
        >
          <div className="flex flex-col gap-5">
            {shownPlaces.length > 0 && (
              <Places
                places={shownPlaces}
                icons={icons}
                onOpen={openPlace}
                onNeedsAccess={askForAccess}
              />
            )}
            {kindBytes && (
              <KindLegend
                bytes={kindBytes}
                glyphs={glyphs}
                active={shownKind}
                onToggle={(kind) =>
                  setHighlight(kind === shownKind ? null : kind)
                }
              />
            )}
            {grew.length > 0 && growth && (
              <section
                aria-labelledby="grew-heading"
                className="flex shrink-0 flex-col gap-1.5"
              >
                <h2
                  id="grew-heading"
                  className="text-eyebrow text-(--role-text-tertiary)"
                >
                  Grew since {growth.since}
                </h2>
                <ul className="-mx-2 space-y-px">
                  {grew.map((row) => (
                    <li key={row.path}>
                      <PathRow
                        name={splitName(row.name)}
                        folder={
                          row.folder === null ? null : splitFolder(row.folder)
                        }
                        figure={row.figure}
                        label={row.label}
                        title={row.path}
                        selected={selected.includes(row.path)}
                        lead={
                          icons && (
                            <span
                              aria-hidden="true"
                              className="mt-px flex size-4 shrink-0 items-center justify-center"
                            >
                              <MapIcon
                                url={icons.item(
                                  itemAt(current, row.path, result.topFiles),
                                )}
                              />
                            </span>
                          )
                        }
                        onClick={(event) =>
                          event.metaKey
                            ? toggleClicked(row.path)
                            : select(row.path)
                        }
                        onHover={(on) => setHovered(on ? row.path : null)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {grew.length > 0 && growth && growth.writers.length > 0 && (
              <section
                aria-labelledby="writers-heading"
                className="flex shrink-0 flex-col gap-1.5"
              >
                <h2
                  id="writers-heading"
                  className="text-eyebrow text-(--role-text-tertiary)"
                >
                  {writersHeading(growth.since, growth.writersSince)}
                </h2>
                <ul className="space-y-px">
                  {growth.writers.map((writer, index) => (
                    <li
                      key={writer.name}
                      className="flex items-baseline gap-2 py-1"
                    >
                      {showsWriterIcons && (
                        <MapIcon
                          url={writerIcons[index]}
                          className="self-center"
                        />
                      )}
                      <span className="text-body-sm min-w-0 flex-1 truncate text-(--role-text)">
                        {writer.name}
                      </span>
                      <span className="text-code-sm shrink-0 text-(--role-text-secondary) tabular-nums">
                        {formatBytes(writer.bytes)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-body-sm text-(--role-text-tertiary)">
                  macOS doesn’t say which folders they wrote to.
                </p>
              </section>
            )}
            {unreadable.length > 0 && (
              <section
                aria-labelledby="unreadable-heading"
                className="flex shrink-0 flex-col gap-1.5"
              >
                <h2
                  id="unreadable-heading"
                  className="text-eyebrow text-(--role-text-tertiary)"
                >
                  Couldn’t read
                </h2>
                <ul className="space-y-0.5">
                  {unreadable.slice(0, UNREADABLE_SHOWN).map((folder) => (
                    <li
                      key={folder.path}
                      title={folder.path}
                      className="text-code-sm flex items-center gap-2 text-(--role-text-secondary)"
                    >
                      {/* The app the folder belongs to, when Pith can tell; else its place's icon or a plain folder. */}
                      {icons && (
                        <MapIcon url={icons.unreadable(folder, owners)} />
                      )}
                      <span className="min-w-0 truncate">{folder.name}</span>
                    </li>
                  ))}
                </ul>
                {unreadable.length > UNREADABLE_SHOWN && (
                  <p className="text-label-sm text-(--role-text-tertiary)">
                    And {unreadable.length - UNREADABLE_SHOWN} more.
                  </p>
                )}
              </section>
            )}
            <aside aria-label="Largest files">
              {files.length > 0 ? (
                <LargestFiles
                  files={files}
                  base={current.path}
                  selectedPaths={selected}
                  hoveredPath={hovered}
                  onHoverPath={setHovered}
                  onSelect={selectFile}
                  onToggle={toggleFile}
                  onMenu={(file) => showMenu(file.path)}
                  icon={
                    icons
                      ? (file, swatch) => (
                          <MapIcon
                            url={icons.item({ kind: "file", path: file.path })}
                            fallback={swatch}
                          />
                        )
                      : undefined
                  }
                />
              ) : (
                <p className="text-body-sm text-pretty text-(--role-text-secondary)">
                  No file here is big enough to list on its own.
                </p>
              )}
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}

// The map is app content, not a web page: WebKit's own menu would offer Reload, which empties it. The map and the
// file list ask Pith for its native menu instead; anywhere else gets the open folder's menu.
document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("canvas, button")) return;
  post({ action: "menu", path: null });
});

const container = document.getElementById("root");
if (container) createRoot(container).render(<DiskMap />);
