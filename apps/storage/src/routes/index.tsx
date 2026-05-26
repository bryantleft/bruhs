import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronRight,
  CornerLeftUp,
  HardDrive,
  Info,
  ShieldAlert,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DeleteDialog } from "~/components/delete-dialog";
import { LargestFiles } from "~/components/largest-files";
import { ScanControls } from "~/components/scan-controls";
import { TreemapCanvas } from "~/components/treemap-canvas";
import { TypeBreakdown } from "~/components/type-breakdown";
import { useScan } from "~/hooks/useScan";
import { CATEGORY_VAR, categoryForName, formatBytes } from "~/lib/format";
import { findByPath, removeByPath } from "~/lib/tree-utils";
import type { FileEntry, ScanSummary, TreeNode } from "~/lib/types";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { status, progress, result, error, scan, loadSnapshot, cancel } =
    useScan();
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [topFiles, setTopFiles] = useState<FileEntry[]>([]);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [stack, setStack] = useState<string[]>([]);
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TreeNode | null>(null);

  // Initial load: show the last cached scan if there is one.
  useEffect(() => {
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

  const runScan = () => scan("/", "bulk");

  const enterDir = (node: TreeNode) => {
    setStack((s) => [...s, node.path]);
    setSelected(null); // navigating shouldn't leave the entered folder selected
  };
  const breadcrumbTo = (i: number) => {
    setStack((s) => s.slice(0, i + 1));
    setSelected(null);
  };

  const onTrashed = (path: string) => {
    if (!tree) return;
    setTree(removeByPath(tree, path).node);
    setTopFiles((f) => f.filter((x) => x.path !== path));
    setSelected(null);
    // If we were zoomed into the trashed dir, pop back to its parent.
    setStack((s) => (s.includes(path) ? s.slice(0, s.indexOf(path)) : s));
  };

  // Heuristic: a scan that hit mostly permission errors => Full Disk Access needed.
  const needsFda =
    !!summary && summary.errors > 20 && summary.errors > summary.dirs * 0.15;

  return (
    <div className="isolate flex h-dvh flex-col bg-longan-950">
      <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-longan-800/70 border-b px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-grape bg-blueberry-500/15 text-blueberry-300">
            <HardDrive className="size-4 shrink-0" />
          </span>
          <div className="leading-none">
            <h1 className="font-semibold text-base text-lychee-50 tracking-tight">
              Storage
            </h1>
            <p className="mt-1 text-[0.6875rem] text-lychee-500 uppercase tracking-wide">
              Disk profiler
            </p>
          </div>
        </div>
        <div className="ml-auto">
          <ScanControls
            scanning={status === "scanning"}
            progress={progress}
            onScan={runScan}
            onCancel={cancel}
          />
        </div>
      </header>

      {summary && <StatStrip summary={summary} />}

      {error && (
        <Banner
          tone="danger"
          icon={<TriangleAlert className="size-4 shrink-0" />}
        >
          {error}
        </Banner>
      )}
      {needsFda && (
        <Banner
          tone="warning"
          icon={<ShieldAlert className="size-4 shrink-0" />}
        >
          <span className="tabular-nums">
            {summary?.errors.toLocaleString()}
          </span>{" "}
          folders were skipped (permission denied). To scan everything, grant{" "}
          <strong className="font-medium text-durian-50">
            Full Disk Access
          </strong>{" "}
          to your terminal in System Settings → Privacy &amp; Security, then
          rescan.
        </Banner>
      )}

      <main className="flex min-h-0 flex-1">
        {/* Treemap */}
        <section className="flex min-w-0 flex-1 flex-col gap-3 p-6">
          {current && tree ? (
            <>
              <div className="flex items-center gap-2">
                {stack.length > 1 && (
                  <button
                    type="button"
                    onClick={() => breadcrumbTo(stack.length - 2)}
                    title="Go up one level"
                    className="flex size-7 shrink-0 items-center justify-center rounded-grape text-lychee-400 hover:bg-longan-800 hover:text-lychee-100"
                  >
                    <CornerLeftUp className="size-4 shrink-0" />
                  </button>
                )}
                <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-sm">
                  {stack.map((p, i) => {
                    const node = findByPath(tree, p);
                    const label =
                      i === 0
                        ? node?.path || "/"
                        : node?.name || p.split("/").pop();
                    const isLast = i === stack.length - 1;
                    return (
                      <span
                        key={p}
                        className="flex shrink-0 items-center gap-0.5"
                      >
                        {i > 0 && (
                          <ChevronRight className="size-3.5 shrink-0 text-lychee-700" />
                        )}
                        <button
                          type="button"
                          onClick={() => breadcrumbTo(i)}
                          className={`max-w-[15rem] truncate rounded-seed px-1.5 py-1 font-mono ${
                            isLast
                              ? "bg-blueberry-500/15 text-blueberry-200"
                              : "text-lychee-400 hover:bg-longan-800 hover:text-lychee-100"
                          }`}
                        >
                          {label}
                        </button>
                      </span>
                    );
                  })}
                </nav>
                <span className="shrink-0 font-mono text-lychee-400 text-sm tabular-nums">
                  {formatBytes(current.size)}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden rounded-lychee bg-longan-900/40 ring-1 ring-white/5">
                <TreemapCanvas
                  root={current}
                  onEnterDir={enterDir}
                  onSelect={setSelected}
                  selectedPath={selected?.path ?? null}
                />
              </div>
            </>
          ) : (
            <EmptyState scanning={status === "scanning"} onScan={runScan} />
          )}
        </section>

        {/* Sidebar */}
        {current && (
          <aside className="flex w-84 shrink-0 flex-col gap-6 overflow-y-auto border-longan-800/70 border-l p-6">
            {selected ? (
              <SelectedCard
                node={selected}
                onTrash={() => setDeleteTarget(selected)}
              />
            ) : (
              <div className="flex items-start gap-2 rounded-lychee bg-longan-900/50 p-3 text-lychee-400 text-sm ring-1 ring-white/5">
                <Info className="mt-0.5 size-4 shrink-0 text-lychee-500" />
                <p className="text-pretty">
                  Click a block to inspect or delete it. Double-click a folder
                  to zoom in.
                </p>
              </div>
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

/** A KPI under the header: divider-separated, no icons, tabular figures. */
function StatStrip({ summary }: { summary: ScanSummary }) {
  return (
    <div className="grid shrink-0 grid-cols-2 divide-x divide-white/5 border-longan-800/70 border-b sm:grid-cols-4">
      <Stat label="Total size" value={formatBytes(summary.bytes)} accent />
      <Stat label="Files" value={summary.files.toLocaleString()} />
      <Stat label="Folders" value={summary.dirs.toLocaleString()} />
      <Stat
        label="Scan time"
        value={`${summary.elapsedMs.toLocaleString()} ms`}
        badge={summary.engine}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  badge,
}: {
  label: string;
  value: string;
  accent?: boolean;
  badge?: string;
}) {
  return (
    <div className="px-6 py-3.5 first:pl-6 sm:px-6">
      <div className="flex items-center gap-2">
        <p className="truncate text-[0.6875rem] text-lychee-500 uppercase tracking-wide">
          {label}
        </p>
        {badge && (
          <span className="rounded-seed bg-longan-800 px-1.5 py-0.5 font-mono text-[0.625rem] text-lychee-400 uppercase tracking-wide">
            {badge}
          </span>
        )}
      </div>
      <p
        className={`mt-1 font-mono text-2xl tabular-nums tracking-tight ${
          accent ? "text-persimmon-300" : "text-lychee-50"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "danger" | "warning";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles =
    tone === "danger"
      ? "bg-lychee-500/10 text-lychee-100 ring-lychee-500/20 [&_svg]:text-lychee-400"
      : "bg-durian-500/10 text-durian-100 ring-durian-500/20 [&_svg]:text-durian-400";
  return (
    <div
      className={`flex shrink-0 items-start gap-2.5 px-6 py-2.5 text-sm ring-1 ring-inset ${styles}`}
    >
      <span className="mt-0.5">{icon}</span>
      <p className="text-pretty">{children}</p>
    </div>
  );
}

function SelectedCard({
  node,
  onTrash,
}: {
  node: TreeNode;
  onTrash: () => void;
}) {
  const color = node.isDir
    ? "var(--color-lychee-500)"
    : `var(${CATEGORY_VAR[categoryForName(node.name)]})`;
  const aggregate = node.name.startsWith("(");
  return (
    <div className="rounded-lychee bg-longan-900 p-4 ring-1 ring-white/5">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="mt-1 size-2.5 shrink-0 rounded-seed"
          style={{ background: color }}
        />
        <div className="min-w-0 flex-1">
          <p
            className="truncate font-medium font-mono text-lychee-50 text-sm"
            title={node.name}
          >
            {node.name}
          </p>
          <p className="mt-0.5 break-all text-[0.6875rem] text-lychee-500 leading-4">
            {node.path}
          </p>
        </div>
      </div>
      <p className="mt-3 font-mono text-2xl text-persimmon-300 tabular-nums tracking-tight">
        {formatBytes(node.size)}
      </p>
      {!aggregate && (
        <button
          type="button"
          onClick={onTrash}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-grape bg-lychee-500/10 py-2 font-medium text-lychee-200 text-sm ring-1 ring-lychee-500/25 ring-inset hover:bg-lychee-500/20 focus-visible:outline-2 focus-visible:outline-lychee-400 focus-visible:outline-offset-2"
        >
          <Trash2 className="size-4 shrink-0" /> Move to Trash
        </button>
      )}
    </div>
  );
}

function EmptyState({
  scanning,
  onScan,
}: {
  scanning: boolean;
  onScan: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-mango bg-blueberry-500/10 text-blueberry-300 ring-1 ring-blueberry-500/20">
        <HardDrive className="size-6 shrink-0" />
      </span>
      <h2 className="mt-5 text-balance font-semibold text-lychee-100 text-xl tracking-tight">
        {scanning ? "Scanning your disk…" : "Profile your disk"}
      </h2>
      <p className="mt-2 max-w-sm text-pretty text-lychee-400 text-sm">
        {scanning
          ? "Reading the filesystem — the treemap will appear the moment it's done."
          : "See exactly what's eating your space as a treemap. Double-click a folder to drill in, and move space-hogs to the Trash."}
      </p>
      {!scanning && (
        <button
          type="button"
          onClick={onScan}
          className="mt-6 flex items-center gap-1.5 rounded-grape bg-longan-800/80 py-2 pr-4 pl-3 font-medium text-lychee-100 text-sm ring-1 ring-longan-700 ring-inset hover:bg-longan-800 focus-visible:outline-2 focus-visible:outline-guava-400 focus-visible:outline-offset-2"
        >
          <HardDrive className="size-4 shrink-0" /> Scan whole disk
        </button>
      )}
    </div>
  );
}
