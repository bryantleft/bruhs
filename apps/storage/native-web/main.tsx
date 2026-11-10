import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { LargestFiles } from "../src/components/largest-files";
import { TreemapCanvas } from "../src/components/treemap-canvas";
import { formatBytes } from "../src/lib/format";
import { LARGEST_FILES_SHOWN, largestFilesIn } from "../src/lib/largest-files";
import { parseResultEvent } from "../src/lib/protocol";
import { findByPath } from "../src/lib/tree-utils";
import { type Kind, kindBytesByFolder } from "../src/lib/treemap-layout";
import type {
  DirNode,
  FileEntry,
  ResultEvent,
  TreeNode,
} from "../src/lib/types";
import { GROUP_KEY, itemAt, itemKey } from "./icon-rule";
import { KindLegend } from "./kind-legend";
import { MapIcon, useAnyIcon, usePageIcons } from "./map-icon";
import { type NavigationAction, NO_MAP, navigate } from "./navigation";
import { GREW_SHOWN, UNREADABLE_SHOWN, WRITERS_SHOWN } from "./side-lists";
import "./styles.css";

/**
 * What the page tells Pith: the selection; the open folder, with one gone back or forward to that the map leaves out
 * and whether Back and Forward can go anywhere; and requests for native actions.
 */
type Message =
  | { action: "ready" }
  | { action: "select"; path: string | null }
  | {
      action: "location";
      path: string;
      wanted: string | null;
      canGoBack: boolean;
      canGoForward: boolean;
    }
  | { action: "menu"; path: string | null }
  | { action: "quickLook"; path: string }
  | { action: "trash"; path: string };

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
  /** Why there are no writers to show, when that's worth saying. */
  writersHint?: string;
}

interface GrowthMessage {
  since: string;
  changes: Record<string, number>;
  writers?: unknown;
  writersSince?: unknown;
  writersHint?: unknown;
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

function DiskMap() {
  const [result, setResult] = useState<ResultEvent | null>(null);
  // Whether the map answers the person's own action, which the map shows at once, however still it holds.
  const [atOnce, setAtOnce] = useState(false);
  // The open folders and where Back and Forward go, which Pith's path bar and Go menu move.
  const [nav, dispatch] = useReducer(navigate, NO_MAP);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [growth, setGrowth] = useState<Growth | null>(null);
  // macOS's icons, once Pith has sent where they are and its rule for each item's key.
  const icons = usePageIcons();
  // Taken before the page says it's ready, as the icons are.
  const doubleClickInterval = useDoubleClickInterval();
  const glyphs = useDifferentiateWithoutColor();
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
        // The live map sends a newer map as the disk changes: what's selected or under the pointer stays while it's
        // still there.
        const stillThere = (path: string | null) =>
          path !== null &&
          parsed !== null &&
          (findByPath(parsed.root, path) !== null ||
            parsed.topFiles.some((file) => file.path === path));
        setSelected((path) => (stillThere(path) ? path : null));
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
        writersHint:
          typeof value.writersHint === "string" ? value.writersHint : undefined,
      });
    };
    post({ action: "ready" });
    return () => {
      window.pithReceive = () => {};
      window.pithReceiveGrowth = () => {};
    };
  }, []);

  // Stable handlers, so hovering the map doesn't re-render its long item list.
  const select = useCallback((path: string | null) => {
    setSelected(path);
    post({ action: "select", path });
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
  const showMenu = useCallback(
    (path: string | null) => post({ action: "menu", path }),
    [],
  );
  const preview = useCallback(
    (path: string) => post({ action: "quickLook", path }),
    [],
  );
  const trash = useCallback(
    (path: string) => post({ action: "trash", path }),
    [],
  );
  const selectFile = useCallback(
    (file: FileEntry) => select(file.path),
    [select],
  );

  /** Show another folder; the selection and hover belonged to the old one. */
  const go = useCallback(
    (action: NavigationAction) => {
      dispatch(action);
      setHovered(null);
      select(null);
    },
    [select],
  );
  const current = nav.trail.at(-1) ?? null;
  const here = current?.path;
  // The map opens a folder further down one level at a time, all from here: one step back.
  const openFolder = useCallback(
    (folder: DirNode) => go({ type: "open", path: folder.path, from: here }),
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

  // Copy with an item selected copies its path, as Finder's Copy does with a file's name.
  useEffect(() => {
    const onCopy = (event: ClipboardEvent) => {
      if (!selected || window.getSelection()?.toString()) return;
      event.clipboardData?.setData("text/plain", selected);
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

  // Unreadable folders in the open folder, which the map can't size, so it lists them instead.
  const unreadable = current.children.filter(
    (child) => child.kind === "unreadable",
  );
  // What grew most inside the open folder since the last scan of the scan's folder.
  const prefix = current.path === "/" ? "/" : `${current.path}/`;
  const grew = growth
    ? [...growth.changes]
        .filter(([path, delta]) => delta > 0 && path.startsWith(prefix))
        .sort((a, b) => b[1] - a[1])
        .slice(0, GREW_SHOWN)
    : [];

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
            selectedPath={selected}
            onSelect={selectNode}
            onEnterDir={openFolder}
            onMenu={showMenu}
            onPreview={preview}
            onTrash={trash}
            growth={growth?.changes}
            growthSince={growth?.since}
            mapIcons={icons?.map}
            kindGlyphs={glyphs}
            icon={
              icons
                ? (tile) => (
                    <MapIcon
                      url={
                        tile.kind === "group"
                          ? icons.key(GROUP_KEY)
                          : icons.item(tile.node)
                      }
                      fallback={null}
                    />
                  )
                : undefined
            }
          />
        </section>
        <div className="flex min-h-0 flex-col gap-5">
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
                {grew.map(([path, delta]) => (
                  <li key={path}>
                    <button
                      type="button"
                      title={path}
                      onClick={() => select(path)}
                      onMouseEnter={() => setHovered(path)}
                      onMouseLeave={() => setHovered(null)}
                      aria-pressed={path === selected}
                      className="menu-item gap-2 px-2 py-1 aria-pressed:bg-(--role-selection)"
                    >
                      {icons && (
                        <MapIcon
                          url={icons.item(
                            itemAt(current, path, result.topFiles),
                          )}
                        />
                      )}
                      <span className="text-code-sm min-w-0 flex-1 truncate text-(--role-text)">
                        {path.slice(prefix.length)}
                      </span>
                      <span className="text-code-sm shrink-0 text-(--role-text-secondary) tabular-nums">
                        +{formatBytes(delta)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {grew.length > 0 &&
            growth &&
            (growth.writers.length > 0 || growth.writersHint) && (
              <section
                aria-labelledby="writers-heading"
                className="flex shrink-0 flex-col gap-1.5"
              >
                <h2
                  id="writers-heading"
                  className="text-eyebrow text-(--role-text-tertiary)"
                >
                  Wrote the most since {growth.writersSince ?? growth.since}
                </h2>
                {growth.writers.length > 0 ? (
                  <>
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
                      Apps writing to disk while it grew. macOS doesn’t say
                      which folders they wrote to.
                    </p>
                  </>
                ) : (
                  <p className="text-body-sm text-(--role-text-tertiary)">
                    {growth.writersHint}
                  </p>
                )}
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
                    {icons && <MapIcon url={icons.item(folder)} />}
                    <span className="min-w-0 truncate">{folder.name}</span>
                  </li>
                ))}
              </ul>
              {unreadable.length > UNREADABLE_SHOWN && (
                <p className="text-label-sm text-(--role-text-tertiary)">
                  And {unreadable.length - UNREADABLE_SHOWN} more. Pith’s notice
                  above lists them all.
                </p>
              )}
            </section>
          )}
          <aside
            aria-label="Largest files"
            className="flex min-h-0 flex-1 flex-col"
          >
            {files.length > 0 ? (
              <LargestFiles
                files={files}
                base={current.path}
                selectedPath={selected}
                hoveredPath={hovered}
                onHoverPath={setHovered}
                onSelect={selectFile}
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
