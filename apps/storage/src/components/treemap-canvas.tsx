import {
  type HierarchyRectangularNode,
  hierarchy,
  treemap,
  treemapSquarify,
} from "d3-hierarchy";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_VAR, type Category, formatBytes } from "~/lib/format";
import { categoryForNode } from "~/lib/tree-utils";
import type { DirNode, TreeNode } from "~/lib/types";

interface Props {
  /** The directory currently shown as the treemap root. */
  root: DirNode;
  /** Zoom into a directory (its depth-1 child in the current view). */
  onEnterDir: (node: DirNode) => void;
  /** Selection changed (for the details/delete panel). null clears. */
  onSelect: (node: TreeNode | null) => void;
  selectedPath: string | null;
}

type RNode = HierarchyRectangularNode<TreeNode>;

/** Corner radius of leaf blocks; matches `rounded-seed` (4px) on the hover outline. */
const LEAF_RADIUS = 4;

const CATEGORIES: Category[] = [
  "code",
  "image",
  "video",
  "audio",
  "document",
  "archive",
  "binary",
  "other",
];

/** Resolve the fruit-palette CSS variables to concrete color strings for canvas use. */
function resolvePalette(): Record<Category, string> {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as Record<Category, string>;
  for (const c of CATEGORIES) {
    const v = cs.getPropertyValue(CATEGORY_VAR[c]).trim();
    out[c] = v || "#888";
  }
  return out;
}

function colorFor(node: TreeNode, palette: Record<Category, string>): string {
  return palette[categoryForNode(node)];
}

const childrenOf = (d: TreeNode): readonly TreeNode[] | undefined =>
  d.kind === "dir" ? d.children : undefined;

/** A folder the user can zoom into. */
function isOpenable(node: TreeNode, root: DirNode): node is DirNode {
  return (
    node.kind === "dir" && node.children.length > 0 && node.path !== root.path
  );
}

export function TreemapCanvas({
  root,
  onEnterDir,
  onSelect,
  selectedPath,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    node: RNode;
  } | null>(null);
  const paletteRef = useRef<Record<Category, string> | null>(null);

  // Track container size.
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Compute the squarified treemap layout for the current root.
  const layout = useMemo<RNode | null>(() => {
    if (size.w < 2 || size.h < 2) return null;
    const h = hierarchy<TreeNode>(root, childrenOf)
      .sum((d) => (d.kind === "dir" && d.children.length > 0 ? 0 : d.size))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return treemap<TreeNode>()
      .tile(treemapSquarify)
      .size([size.w, size.h])
      .paddingInner(1)
      .paddingTop((d) => (d.depth === 0 ? 0 : d.children ? 14 : 0))
      .round(true)(h);
  }, [root, size]);

  const leaves = useMemo(() => layout?.leaves() ?? [], [layout]);

  // Draw to canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout || size.w < 2) return;
    if (!paletteRef.current) paletteRef.current = resolvePalette();
    const palette = paletteRef.current;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    // Leaf rectangles with softly rounded corners and cushion shading.
    for (const leaf of leaves) {
      const w = leaf.x1 - leaf.x0;
      const h = leaf.y1 - leaf.y0;
      if (w < 1 || h < 1) continue;
      const r = w > 7 && h > 7 ? Math.min(LEAF_RADIUS, w / 2, h / 2) : 0;
      ctx.beginPath();
      ctx.roundRect(leaf.x0, leaf.y0, w, h, r);
      ctx.fillStyle = colorFor(leaf.data, palette);
      ctx.fill();
      // Cushion: light top-left, dark bottom-right.
      if (w > 3 && h > 3) {
        const g = ctx.createLinearGradient(leaf.x0, leaf.y0, leaf.x1, leaf.y1);
        g.addColorStop(0, "rgba(255,255,255,0.22)");
        g.addColorStop(0.5, "rgba(255,255,255,0.0)");
        g.addColorStop(1, "rgba(0,0,0,0.3)");
        ctx.fillStyle = g;
        ctx.fill();
      }
    }

    // Directory frames + labels for the top two levels.
    ctx.textBaseline = "middle";
    ctx.font = "600 11px ui-monospace, monospace";
    for (const d of layout.descendants() as RNode[]) {
      if (d.depth === 0 || !d.children) continue;
      const w = d.x1 - d.x0;
      const h = d.y1 - d.y0;
      if (w < 6 || h < 6) continue;
      ctx.strokeStyle = d.depth === 1 ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.25)";
      ctx.lineWidth = d.depth === 1 ? 1.5 : 0.75;
      ctx.beginPath();
      ctx.roundRect(d.x0 + 0.5, d.y0 + 0.5, w - 1, h - 1, LEAF_RADIUS);
      ctx.stroke();
      if (d.depth <= 2 && w > 42 && h > 14) {
        const label = d.data.name;
        ctx.save();
        ctx.beginPath();
        ctx.rect(d.x0 + 3, d.y0, w - 6, 14);
        ctx.clip();
        // Subtle dark halo keeps labels legible over any color.
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 2;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillText(label, d.x0 + 4, d.y0 + 7.5);
        ctx.restore();
      }
    }

    // Selection outline.
    if (selectedPath) {
      const sel =
        leaves.find((l) => l.data.path === selectedPath) ??
        (layout.descendants() as RNode[]).find(
          (d) => d.data.path === selectedPath,
        );
      // Never outline the root (depth 0) — that would frame the whole map.
      if (sel && sel.depth > 0) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          sel.x0 + 1,
          sel.y0 + 1,
          sel.x1 - sel.x0 - 2,
          sel.y1 - sel.y0 - 2,
        );
      }
    }
  }, [layout, leaves, size, selectedPath]);

  // Hit-test: smallest rect under the cursor among descendants.
  const nodeAt = useCallback(
    (px: number, py: number): RNode | null => {
      if (!layout) return null;
      let best: RNode | null = null;
      for (const d of layout.descendants() as RNode[]) {
        if (d.depth === 0) continue;
        if (px >= d.x0 && px <= d.x1 && py >= d.y0 && py <= d.y1) {
          if (!best || d.depth > best.depth) best = d;
        }
      }
      return best;
    },
    [layout],
  );

  const onMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const n = nodeAt(x, y);
    setHover(n ? { x, y, node: n } : null);
  };

  // Single click selects (for inspect/delete). Double click on a folder zooms in.
  // Keeping these separate means nothing is ever left "selected" just by navigating.
  const onClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const n = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
    onSelect(n ? n.data : null);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const n = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
    if (n && isOpenable(n.data, root)) onEnterDir(n.data);
  };

  const summary = `Treemap of ${root.path}, ${formatBytes(root.size)} in ${
    root.children.length
  } items. Use the list after it to select or open them.`;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={summary}
        style={{
          width: size.w,
          height: size.h,
          display: "block",
          cursor: "pointer",
        }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
      {hover && (
        <>
          <div
            aria-hidden="true"
            className="rounded-seed pointer-events-none absolute z-0 ring-2 ring-white/70 ring-inset"
            style={{
              left: hover.node.x0,
              top: hover.node.y0,
              width: hover.node.x1 - hover.node.x0,
              height: hover.node.y1 - hover.node.y0,
            }}
          />
          <div
            className="rounded-grape bg-longan-700/95 pointer-events-none absolute z-10 max-w-xs px-2.5 py-2 inset-ring inset-ring-white/15 backdrop-blur-sm"
            style={{
              left: Math.min(hover.x + 14, size.w - 224),
              top: Math.min(hover.y + 14, size.h - 60),
            }}
          >
            <div className="text-rambutan-50 truncate font-mono text-sm font-medium">
              {hover.node.data.name}
            </div>
            <div className="text-persimmon-300 font-mono text-xs tabular-nums">
              {formatBytes(hover.node.value ?? hover.node.data.size)}
            </div>
            <div className="text-rambutan-400 mt-0.5 max-w-56 truncate text-[0.625rem]">
              {hover.node.data.path}
            </div>
          </div>
        </>
      )}
      <TreemapItems
        root={root}
        selectedPath={selectedPath}
        onSelect={onSelect}
        onEnterDir={onEnterDir}
      />
    </div>
  );
}

/**
 * The canvas can't be reached by keyboard or read by a screen reader, so the current
 * folder's items are also listed as buttons. The list is visually hidden until it holds
 * focus, then it appears over the treemap.
 */
function TreemapItems({ root, selectedPath, onSelect, onEnterDir }: Props) {
  return (
    <ul
      aria-label={`Items in ${root.name || root.path}`}
      className="rounded-lychee bg-longan-700 sr-only max-h-[calc(100%-1rem)] overflow-y-auto p-2 inset-ring inset-ring-white/15 focus-within:not-sr-only focus-within:absolute focus-within:top-2 focus-within:left-2 focus-within:z-20 focus-within:w-80"
    >
      {root.children.map((child) => (
        <li key={child.path} className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={child.path === selectedPath}
            onClick={() => onSelect(child)}
            className="rounded-grape text-rambutan-100 hover:bg-longan-600 focus-visible:outline-persimmon-400 aria-pressed:bg-blueberry-500/15 min-w-0 flex-1 truncate px-2 py-1 text-left text-sm focus-visible:outline-2"
          >
            {child.name}{" "}
            <span className="text-rambutan-400 font-mono text-xs tabular-nums">
              {formatBytes(child.size)}
            </span>
          </button>
          {isOpenable(child, root) && (
            <button
              type="button"
              onClick={() => onEnterDir(child)}
              aria-label={`Open ${child.name}`}
              className="rounded-grape text-rambutan-300 hover:bg-longan-600 focus-visible:outline-persimmon-400 shrink-0 px-2 py-1 text-sm focus-visible:outline-2"
            >
              Open
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
