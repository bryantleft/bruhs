import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { LargestFiles } from "../src/components/largest-files";
import { TreemapCanvas } from "../src/components/treemap-canvas";
import { retraceFolders } from "../src/lib/folder-trail";
import { LARGEST_FILES_SHOWN, largestFilesIn } from "../src/lib/largest-files";
import { parseResultEvent } from "../src/lib/protocol";
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

type Selection = { action: "select"; path: string | null };
declare global {
  interface Window {
    pithReceive: (payload: string | null) => void;
    webkit?: {
      messageHandlers?: {
        pith?: {
          postMessage: (message: Selection | { action: "ready" }) => void;
        };
      };
    };
  }
}

function post(message: Selection | { action: "ready" }): void {
  window.webkit?.messageHandlers?.pith?.postMessage(message);
}

function DiskMap() {
  const [result, setResult] = useState<ResultEvent | null>(null);
  const [trail, setTrail] = useState<readonly DirNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        setSelected(null);
        setHovered(null);
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
    post({ action: "ready" });
    return () => {
      window.pithReceive = () => {};
    };
  }, []);

  // Stable handlers, so hovering the map doesn't re-render its long item list.
  const select = useCallback((path: string | null) => {
    setSelected(path);
    post({ action: "select", path });
  }, []);
  const selectNode = useCallback(
    (node: TreeNode | null) =>
      select(node && node.kind !== "aggregate" ? node.path : null),
    [select],
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

  // Command–Up Arrow opens the enclosing folder, as in Finder.
  useEffect(() => {
    if (trail.length < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (!event.metaKey || event.key !== "ArrowUp") return;
      event.preventDefault();
      goBack(trail.length - 2);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trail.length, goBack]);

  const current = trail.at(-1) ?? null;
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

  return (
    <main className="flex h-full min-h-0 flex-col gap-2 px-4 pt-1 pb-4">
      <PathBar trail={trail} onOpen={goBack} />
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

// The map is app content, not a web page: WebKit's own menu would offer Reload, which empties it.
document.addEventListener("contextmenu", (event) => event.preventDefault());

const container = document.getElementById("root");
if (container) createRoot(container).render(<DiskMap />);
