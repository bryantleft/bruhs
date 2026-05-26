import {
  type HierarchyRectangularNode,
  hierarchy,
  treemap,
  treemapSquarify,
} from "d3-hierarchy";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_VAR,
  type Category,
  categoryForName,
  formatBytes,
} from "~/lib/format";
import type { TreeNode } from "~/lib/types";

interface Props {
  /** The directory currently shown as the treemap root. */
  root: TreeNode;
  /** Zoom into a directory (its depth-1 child in the current view). */
  onEnterDir: (node: TreeNode) => void;
  /** Selection changed (for the details/delete panel). null clears. */
  onSelect: (node: TreeNode | null) => void;
  selectedPath: string | null;
}

type RNode = HierarchyRectangularNode<TreeNode>;

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
  if (node.name.startsWith("(")) return palette.other;
  return palette[categoryForName(node.name)];
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
    const h = hierarchy<TreeNode>(root)
      .sum((d) => (d.children?.length ? 0 : d.size))
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
      const r = w > 7 && h > 7 ? Math.min(3, w / 2, h / 2) : 0;
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
      ctx.roundRect(d.x0 + 0.5, d.y0 + 0.5, w - 1, h - 1, 3);
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
    if (n?.data.isDir && n.data.children?.length && n.data.path !== root.path) {
      onEnterDir(n.data);
    }
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
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
            className="pointer-events-none absolute z-0 rounded-[3px] ring-2 ring-white/70 ring-inset"
            style={{
              left: hover.node.x0,
              top: hover.node.y0,
              width: hover.node.x1 - hover.node.x0,
              height: hover.node.y1 - hover.node.y0,
            }}
          />
          <div
            className="pointer-events-none absolute z-10 max-w-xs rounded-grape bg-longan-900/95 px-2.5 py-2 shadow-xl ring-1 ring-white/10 backdrop-blur-sm"
            style={{
              left: Math.min(hover.x + 14, size.w - 224),
              top: Math.min(hover.y + 14, size.h - 60),
            }}
          >
            <div className="truncate font-medium font-mono text-lychee-50 text-sm">
              {hover.node.data.name}
            </div>
            <div className="font-mono text-persimmon-300 text-xs tabular-nums">
              {formatBytes(hover.node.value ?? hover.node.data.size)}
            </div>
            <div className="mt-0.5 max-w-56 truncate text-[0.625rem] text-lychee-500">
              {hover.node.data.path}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
