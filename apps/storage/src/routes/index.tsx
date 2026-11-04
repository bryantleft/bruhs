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
import { type ReactNode, useMemo, useState } from "react";
import { DeleteDialog } from "~/components/delete-dialog";
import { LargestFiles } from "~/components/largest-files";
import { ScanControls } from "~/components/scan-controls";
import { TreemapCanvas } from "~/components/treemap-canvas";
import { TypeBreakdown } from "~/components/type-breakdown";
import { useScan } from "~/hooks/useScan";
import { CATEGORY_VAR, formatBytes } from "~/lib/format";
import {
  categoryForNode,
  findByPath,
  isAggregate,
  removePaths,
} from "~/lib/tree-utils";
import type { DirNode, ResultEvent, ScanSummary, TreeNode } from "~/lib/types";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { state, scan, cancel } = useScan();
  const runScan = () => scan("/", "bulk");

  return (
    <div className="bg-longan-950 isolate flex h-dvh flex-col">
      <header className="border-longan-800/70 flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-b px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="rounded-grape bg-blueberry-500/15 text-blueberry-300 flex size-7 items-center justify-center">
            <HardDrive className="size-4 shrink-0" />
          </span>
          <div className="leading-none">
            <h1 className="text-rambutan-50 text-base font-semibold tracking-tight">
              Storage
            </h1>
            <p className="text-rambutan-500 mt-1 text-[0.6875rem] tracking-wide uppercase">
              Disk profiler
            </p>
          </div>
        </div>
        <div className="ml-auto">
          <ScanControls
            scanning={state.status === "scanning"}
            progress={state.status === "scanning" ? state.progress : null}
            onScan={runScan}
            onCancel={cancel}
          />
        </div>
      </header>

      {state.status === "error" && (
        <Banner
          tone="danger"
          icon={<TriangleAlert className="size-4 shrink-0" />}
        >
          {state.message}
        </Banner>
      )}

      {state.status === "done" ? (
        // A new result remounts the view, resetting zoom, selection and trashed items.
        <ScanView key={state.id} result={state.result} />
      ) : (
        <main className="flex min-h-0 flex-1 p-6">
          <EmptyState scanning={state.status === "scanning"} onScan={runScan} />
        </main>
      )}
    </div>
  );
}

/** The result of one scan: treemap, sidebar and the delete flow. */
function ScanView({ result }: { result: ResultEvent }) {
  const [trashed, setTrashed] = useState<ReadonlySet<string>>(new Set());
  const [stack, setStack] = useState<readonly string[]>([result.root.path]);
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TreeNode | null>(null);

  const tree = useMemo(
    () => removePaths(result.root, trashed),
    [result.root, trashed],
  );
  const topFiles = useMemo(
    () => result.topFiles.filter((f) => !trashed.has(f.path)),
    [result.topFiles, trashed],
  );
  const current = useMemo((): DirNode => {
    const node = findByPath(tree, stack[stack.length - 1] ?? tree.path);
    return node?.kind === "dir" ? node : tree;
  }, [tree, stack]);

  const enterDir = (node: DirNode) => {
    setStack((s) => [...s, node.path]);
    setSelected(null); // navigating shouldn't leave the entered folder selected
  };
  const breadcrumbTo = (i: number) => {
    setStack((s) => s.slice(0, i + 1));
    setSelected(null);
  };

  const onTrashed = (path: string) => {
    setTrashed((t) => new Set(t).add(path));
    setSelected(null);
    // If we were zoomed into the trashed dir, pop back to its parent.
    setStack((s) => (s.includes(path) ? s.slice(0, s.indexOf(path)) : s));
  };

  const { summary } = result;
  // Heuristic: a scan that hit mostly permission errors => Full Disk Access needed.
  const needsFda = summary.errors > 20 && summary.errors > summary.dirs * 0.15;

  return (
    <>
      <StatStrip summary={summary} />
      {needsFda && (
        <Banner
          tone="warning"
          icon={<ShieldAlert className="size-4 shrink-0" />}
        >
          <span className="tabular-nums">
            {summary.errors.toLocaleString()}
          </span>{" "}
          folders were skipped (permission denied). To scan everything, grant{" "}
          <strong className="text-durian-50 font-medium">
            Full Disk Access
          </strong>{" "}
          to your terminal in System Settings → Privacy &amp; Security, then
          rescan.
        </Banner>
      )}

      <main className="flex min-h-0 flex-1">
        {/* Treemap */}
        <section className="flex min-w-0 flex-1 flex-col gap-3 p-6">
          <div className="flex items-center gap-2">
            {stack.length > 1 && (
              <button
                type="button"
                onClick={() => breadcrumbTo(stack.length - 2)}
                aria-label="Go up one level"
                title="Go up one level"
                className="rounded-grape text-rambutan-400 hover:bg-longan-800 hover:text-rambutan-100 focus-visible:outline-persimmon-400 flex size-7 shrink-0 items-center justify-center focus-visible:outline-2"
              >
                <CornerLeftUp className="size-4 shrink-0" />
              </button>
            )}
            <nav
              aria-label="Folder path"
              className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-sm"
            >
              {stack.map((p, i) => {
                const node = findByPath(tree, p);
                const label =
                  i === 0
                    ? node?.path || "/"
                    : node?.name || p.split("/").pop();
                const isLast = i === stack.length - 1;
                return (
                  <span key={p} className="flex shrink-0 items-center gap-0.5">
                    {i > 0 && (
                      <ChevronRight className="text-rambutan-700 size-3.5 shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => breadcrumbTo(i)}
                      aria-current={isLast ? "location" : undefined}
                      className={`rounded-seed focus-visible:outline-persimmon-400 max-w-[15rem] truncate px-1.5 py-1 font-mono focus-visible:outline-2 ${
                        isLast
                          ? "bg-blueberry-500/15 text-blueberry-200"
                          : "text-rambutan-400 hover:bg-longan-800 hover:text-rambutan-100"
                      }`}
                    >
                      {label}
                    </button>
                  </span>
                );
              })}
            </nav>
            <span className="text-rambutan-400 shrink-0 font-mono text-sm tabular-nums">
              {formatBytes(current.size)}
            </span>
          </div>
          <div className="rounded-lychee bg-longan-900/40 relative min-h-0 flex-1 overflow-hidden ring-1 ring-white/5">
            <TreemapCanvas
              root={current}
              onEnterDir={enterDir}
              onSelect={setSelected}
              selectedPath={selected?.path ?? null}
            />
          </div>
        </section>

        {/* Sidebar */}
        <aside className="border-longan-800/70 flex w-84 shrink-0 flex-col gap-6 overflow-hidden border-l p-6">
          {selected ? (
            <SelectedCard
              node={selected}
              onTrash={() => setDeleteTarget(selected)}
            />
          ) : (
            <div className="rounded-lychee bg-longan-900/50 text-rambutan-400 flex shrink-0 items-start gap-2 p-3 text-sm ring-1 ring-white/5">
              <Info className="text-rambutan-500 mt-0.5 size-4 shrink-0" />
              <p className="text-pretty">
                Click a block to inspect or delete it. Double-click a folder to
                zoom in.
              </p>
            </div>
          )}

          <TypeBreakdown node={current} />
          <LargestFiles
            files={topFiles}
            onSelect={(f) => setSelected({ ...f, kind: "file" })}
          />
        </aside>
      </main>

      {deleteTarget && (
        <DeleteDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onTrashed={onTrashed}
        />
      )}
    </>
  );
}

/** A KPI under the header: divider-separated, no icons, tabular figures. */
function StatStrip({ summary }: { summary: ScanSummary }) {
  return (
    <div className="border-longan-800/70 grid shrink-0 grid-cols-2 divide-x divide-white/5 border-b sm:grid-cols-4">
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
        <p className="text-rambutan-500 truncate text-[0.6875rem] tracking-wide uppercase">
          {label}
        </p>
        {badge && (
          <span className="rounded-seed bg-longan-800 text-rambutan-400 px-1.5 py-0.5 font-mono text-[0.625rem] tracking-wide uppercase">
            {badge}
          </span>
        )}
      </div>
      <p
        className={`mt-1 font-mono text-2xl tracking-tight tabular-nums ${
          accent ? "text-persimmon-300" : "text-rambutan-50"
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
  icon: ReactNode;
  children: ReactNode;
}) {
  const styles =
    tone === "danger"
      ? "bg-lychee-500/10 text-lychee-100 ring-lychee-500/20 [&_svg]:text-lychee-400"
      : "bg-durian-500/10 text-durian-100 ring-durian-500/20 [&_svg]:text-durian-400";
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
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
  const color =
    node.kind === "dir"
      ? "var(--color-rambutan-500)"
      : `var(${CATEGORY_VAR[categoryForNode(node)]})`;
  return (
    <div className="rounded-lychee bg-longan-900 shrink-0 p-4 ring-1 ring-white/5">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="rounded-seed mt-1 size-2.5 shrink-0"
          style={{ background: color }}
        />
        <div className="min-w-0 flex-1">
          <p
            className="text-rambutan-50 truncate font-mono text-sm font-medium"
            title={node.name}
          >
            {node.name}
          </p>
          {!isAggregate(node) && (
            <p className="text-rambutan-500 mt-0.5 text-[0.6875rem] leading-4 break-all">
              {node.path}
            </p>
          )}
        </div>
      </div>
      <p className="text-persimmon-300 mt-3 font-mono text-2xl tracking-tight tabular-nums">
        {formatBytes(node.size)}
      </p>
      {isAggregate(node) ? (
        <p className="text-rambutan-400 mt-3 text-sm text-pretty">
          Many small items folded together. Zoom in to pick a real file or
          folder.
        </p>
      ) : (
        <button
          type="button"
          onClick={onTrash}
          className="rounded-grape bg-lychee-500/10 text-lychee-200 ring-lychee-500/25 hover:bg-lychee-500/20 focus-visible:outline-lychee-400 mt-3 flex w-full items-center justify-center gap-1.5 py-2 text-sm font-medium ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-offset-2"
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
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <span className="rounded-mango bg-blueberry-500/10 text-blueberry-300 ring-blueberry-500/20 flex size-14 items-center justify-center ring-1">
        <HardDrive className="size-6 shrink-0" />
      </span>
      <h2 className="text-rambutan-100 mt-5 text-xl font-semibold tracking-tight text-balance">
        {scanning ? "Scanning your disk…" : "Profile your disk"}
      </h2>
      <p className="text-rambutan-400 mt-2 max-w-sm text-sm text-pretty">
        {scanning
          ? "Reading the filesystem — the treemap will appear the moment it's done."
          : "See exactly what's eating your space as a treemap. Double-click a folder to drill in, and move space-hogs to the Trash."}
      </p>
      {!scanning && (
        <button
          type="button"
          onClick={onScan}
          className="rounded-grape bg-longan-800/80 text-rambutan-100 ring-longan-700 hover:bg-longan-800 focus-visible:outline-persimmon-400 mt-6 flex items-center gap-1.5 py-2 pr-4 pl-3 text-sm font-medium ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <HardDrive className="size-4 shrink-0" /> Scan whole disk
        </button>
      )}
    </div>
  );
}
