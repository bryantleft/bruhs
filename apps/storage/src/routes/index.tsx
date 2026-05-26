import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronRight,
  HardDrive,
  Info,
  RotateCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DeleteDialog } from "~/components/delete-dialog";
import { LargestFiles } from "~/components/largest-files";
import { ScanControls } from "~/components/scan-controls";
import { TreemapCanvas } from "~/components/treemap-canvas";
import { TypeBreakdown } from "~/components/type-breakdown";
import { useScan } from "~/hooks/useScan";
import { formatBytes } from "~/lib/format";
import { findByPath, removeByPath } from "~/lib/tree-utils";
import type { FileEntry, ScanSummary, TreeNode } from "~/lib/types";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { status, progress, result, error, scan, loadSnapshot, cancel } =
    useScan();
  const [homeDir, setHomeDir] = useState("/");
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [topFiles, setTopFiles] = useState<FileEntry[]>([]);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [stack, setStack] = useState<string[]>([]);
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TreeNode | null>(null);
  const [lastRoot, setLastRoot] = useState<string>("/");

  // Initial load: home dir + cached snapshot.
  useEffect(() => {
    fetch("/api/home")
      .then((r) => r.json())
      .then((d: { home: string }) => setHomeDir(d.home))
      .catch(() => {});
    loadSnapshot();
  }, [loadSnapshot]);

  // Sync local state when a new result arrives.
  useEffect(() => {
    if (!result) return;
    setTree(result.root);
    setTopFiles(result.topFiles);
    setSummary(result.summary);
    setStack([result.root.path]);
    setSelected(null);
  }, [result]);

  const current = useMemo(() => {
    if (!tree) return null;
    return findByPath(tree, stack[stack.length - 1] ?? tree.path) ?? tree;
  }, [tree, stack]);

  const runScan = (root: string) => {
    setLastRoot(root);
    scan(root, "bulk");
  };

  const enterDir = (node: TreeNode) => setStack((s) => [...s, node.path]);
  const breadcrumbTo = (i: number) => setStack((s) => s.slice(0, i + 1));

  const onTrashed = (path: string) => {
    if (!tree) return;
    setTree(removeByPath(tree, path).node);
    setTopFiles((f) => f.filter((x) => x.path !== path));
    setSelected(null);
    // If we were zoomed into the trashed dir, pop back to its parent.
    setStack((s) => (s.includes(path) ? s.slice(0, s.indexOf(path)) : s));
  };

  // Heuristic: a whole-disk scan that hit mostly permission errors => Full Disk Access needed.
  const needsFda =
    !!summary &&
    lastRoot === "/" &&
    summary.errors > 20 &&
    summary.errors > summary.dirs * 0.15;

  return (
    <div className="flex h-screen flex-col bg-longan-950">
      <header className="border-longan-800 border-b px-5 py-3">
        <div className="mb-3 flex items-center gap-2">
          <HardDrive size={20} className="text-blueberry-400" />
          <h1 className="font-bold text-lg text-lychee-100">Storage</h1>
          <span className="text-lychee-600 text-xs">disk profiler</span>
          {summary && (
            <span className="ml-auto flex items-center gap-3 text-lychee-400 text-xs">
              <span className="font-mono text-persimmon-300 text-sm">
                {formatBytes(summary.bytes)}
              </span>
              <span>{summary.files.toLocaleString()} files</span>
              <span>{summary.dirs.toLocaleString()} dirs</span>
              <span className="rounded-seed bg-longan-800 px-1.5 py-0.5">
                {summary.engine} · {summary.elapsedMs}ms
              </span>
            </span>
          )}
        </div>
        <ScanControls
          scanning={status === "scanning"}
          progress={progress}
          onScan={runScan}
          onCancel={cancel}
          homeDir={homeDir}
        />
      </header>

      {error && (
        <div className="bg-lychee-900/40 px-5 py-2 text-lychee-200 text-sm">
          ⚠️ {error}
        </div>
      )}
      {needsFda && (
        <div className="flex items-start gap-2 bg-durian-900/30 px-5 py-2 text-durian-100 text-sm">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-durian-400" />
          <span>
            {summary?.errors.toLocaleString()} folders were skipped (permission
            denied). To scan the whole disk, grant{" "}
            <strong>Full Disk Access</strong> to your terminal in System
            Settings → Privacy &amp; Security → Full Disk Access, then rescan.
          </span>
        </div>
      )}

      <main className="flex min-h-0 flex-1">
        {/* Treemap */}
        <section className="flex min-w-0 flex-1 flex-col p-4">
          {current ? (
            <>
              <div className="mb-2 flex items-center gap-1 overflow-x-auto text-sm">
                {stack.map((p, i) => {
                  const node = tree ? findByPath(tree, p) : null;
                  const label =
                    i === 0
                      ? node?.path || "/"
                      : node?.name || p.split("/").pop();
                  return (
                    <span key={p} className="flex items-center gap-1">
                      {i > 0 && (
                        <ChevronRight size={13} className="text-lychee-600" />
                      )}
                      <button
                        type="button"
                        onClick={() => breadcrumbTo(i)}
                        className={`max-w-[200px] truncate rounded-seed px-1.5 py-0.5 font-mono ${
                          i === stack.length - 1
                            ? "bg-blueberry-900/40 text-blueberry-200"
                            : "text-lychee-400 hover:bg-longan-800 hover:text-lychee-200"
                        }`}
                      >
                        {label}
                      </button>
                    </span>
                  );
                })}
                {current && (
                  <span className="ml-2 font-mono text-lychee-500 text-xs">
                    {formatBytes(current.size)}
                  </span>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-hidden rounded-lychee border border-longan-800 bg-longan-900/40">
                <TreemapCanvas
                  root={current}
                  onEnterDir={enterDir}
                  onSelect={setSelected}
                  selectedPath={selected?.path ?? null}
                />
              </div>
            </>
          ) : (
            <EmptyState scanning={status === "scanning"} />
          )}
        </section>

        {/* Sidebar */}
        {current && (
          <aside className="w-80 shrink-0 space-y-5 overflow-y-auto border-longan-800 border-l p-4">
            {selected ? (
              <div className="space-y-2 rounded-lychee border border-longan-700 bg-longan-900 p-3">
                <h3 className="font-semibold text-lychee-300 text-xs uppercase tracking-wide">
                  Selected
                </h3>
                <p
                  className="truncate font-mono text-lychee-100 text-sm"
                  title={selected.name}
                >
                  {selected.name}
                </p>
                <p className="break-all text-lychee-500 text-xs">
                  {selected.path}
                </p>
                <p className="font-mono text-persimmon-300 text-sm">
                  {formatBytes(selected.size)}
                </p>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(selected)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-grape bg-lychee-700 px-3 py-2 font-medium text-sm text-white transition hover:bg-lychee-600"
                >
                  <Trash2 size={14} /> Move to Trash
                </button>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-lychee-500 text-xs">
                <Info size={13} /> Click a block to inspect or delete it.
              </p>
            )}

            <TypeBreakdown node={current} />
            <LargestFiles
              files={topFiles}
              onSelect={(f) =>
                setSelected({
                  name: f.name,
                  path: f.path,
                  size: f.size,
                  isDir: false,
                })
              }
            />

            {stack.length > 1 && (
              <button
                type="button"
                onClick={() => breadcrumbTo(0)}
                className="flex items-center gap-1.5 text-lychee-400 text-xs transition hover:text-lychee-200"
              >
                <RotateCw size={12} /> Back to root
              </button>
            )}
          </aside>
        )}
      </main>

      {deleteTarget && (
        <DeleteDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onTrashed={onTrashed}
        />
      )}
    </div>
  );
}

function EmptyState({ scanning }: { scanning: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <HardDrive size={48} className="mb-4 text-longan-700" />
      <h2 className="font-semibold text-lychee-200 text-xl">
        {scanning ? "Scanning…" : "Profile your disk"}
      </h2>
      <p className="mt-2 max-w-sm text-lychee-500 text-sm">
        {scanning
          ? "Reading the filesystem — the treemap will appear when it's done."
          : "Pick a target above and hit Scan. The treemap shows what's eating your space; click to drill in, and move space-hogs to the Trash."}
      </p>
    </div>
  );
}
