import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { LargestFiles } from "../src/components/largest-files";
import { TreemapCanvas } from "../src/components/treemap-canvas";
import { retraceFolders } from "../src/lib/folder-trail";
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
import { KindLegend } from "./kind-legend";
import { PathBar } from "./path-bar";
import "./styles.css";

/** What the page tells Pith: the selection, the open folder, and requests for native actions. */
type Message =
  | { action: "ready" }
  | { action: "select"; path: string | null }
  | { action: "location"; path: string }
  | { action: "menu"; path: string | null }
  | { action: "quickLook"; path: string }
  | { action: "trash"; path: string };

/** What grew since the last scan of the same folder: bytes by path, and when that scan was. */
interface Writer {
  name: string;
  bytes: number;
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

/** The writers Pith sent, each with a name and a byte count, or none. */
function parseWriters(value: unknown): Writer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const { name, bytes } = item as Record<string, unknown>;
    return typeof name === "string" &&
      typeof bytes === "number" &&
      Number.isFinite(bytes) &&
      bytes > 0
      ? [{ name, bytes }]
      : [];
  });
}

declare global {
  interface Window {
    pithReceive: (payload: string | null) => void;
    pithReceiveGrowth: (growth: GrowthMessage | null) => void;
    /** Pith's menu commands that act on the map, such as Go, Enclosing Folder. */
    pithCommand: (command: "up") => void;
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

function DiskMap() {
  const [result, setResult] = useState<ResultEvent | null>(null);
  const [trail, setTrail] = useState<readonly DirNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [growth, setGrowth] = useState<Growth | null>(null);
  // The open folders, kept across the empty payload a rescan sends first, so the map
  // stays where it was after Move to Trash.
  const openPaths = useRef<readonly string[]>([]);
  useEffect(() => {
    if (trail.length > 0) {
      openPaths.current = trail.map((folder) => folder.path);
    }
  }, [trail]);

  useEffect(() => {
    window.pithReceive = (payload) => {
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
        // The live map sends a newer map as the disk changes: what's selected or under the pointer stays while it's
        // still there.
        const stillThere = (path: string | null) =>
          path !== null &&
          parsed !== null &&
          (findByPath(parsed.root, path) !== null ||
            parsed.topFiles.some((file) => file.path === path));
        setSelected((path) => (stillThere(path) ? path : null));
        setHovered((path) => (stillThere(path) ? path : null));
        if (!parsed) {
          setTrail([]);
          return;
        }
        if (openPaths.current[0] !== parsed.root.path) setHighlight(null);
        setTrail(retraceFolders(parsed.root, openPaths.current));
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

  /** Show another folder; the selection and hover belonged to the old map. */
  const showFolders = useCallback(
    (next: (folders: readonly DirNode[]) => readonly DirNode[]) => {
      setTrail(next);
      setHovered(null);
      select(null);
    },
    [select],
  );
  const goBack = useCallback(
    (index: number) => showFolders((folders) => folders.slice(0, index + 1)),
    [showFolders],
  );
  const openFolder = useCallback(
    (folder: DirNode) => showFolders((folders) => [...folders, folder]),
    [showFolders],
  );

  // Go, Enclosing Folder (Command–Up Arrow) is Pith's menu command, so it works wherever focus is.
  useEffect(() => {
    window.pithCommand = (command) => {
      if (command === "up" && trail.length > 1) goBack(trail.length - 2);
    };
  }, [trail.length, goBack]);

  const current = trail.at(-1) ?? null;
  useEffect(() => {
    if (current) post({ action: "location", path: current.path });
  }, [current]);

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
  // Before a scan the page stays empty: Pith's bar above says there's no scan yet and holds the scan buttons.
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
        .slice(0, 5)
    : [];

  return (
    <main className="flex h-full min-h-0 flex-col gap-2 px-4 pt-3 pb-4">
      {/* At the scan's own folder, Pith's bar above already shows its path and size. */}
      {trail.length > 1 && <PathBar trail={trail} onOpen={goBack} />}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_17rem] gap-5">
        <section aria-label="Disk space treemap" className="min-h-0">
          <TreemapCanvas
            root={current}
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
          />
        </section>
        <div className="flex min-h-0 flex-col gap-5">
          {kindBytes && (
            <KindLegend
              bytes={kindBytes}
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
                      {growth.writers.map((writer) => (
                        <li
                          key={writer.name}
                          className="flex items-baseline gap-2 py-1"
                        >
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
                {unreadable.slice(0, 6).map((folder) => (
                  <li
                    key={folder.path}
                    title={folder.path}
                    className="text-code-sm truncate text-(--role-text-secondary)"
                  >
                    {folder.name}
                  </li>
                ))}
              </ul>
              {unreadable.length > 6 && (
                <p className="text-label-sm text-(--role-text-tertiary)">
                  And {unreadable.length - 6} more. Pith’s notice above lists
                  them all.
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
