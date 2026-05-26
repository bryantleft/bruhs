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

    // Leaf rectangles with cushion shading.
    for (const leaf of leaves) {
      const w = leaf.x1 - leaf.x0;
      const h = leaf.y1 - leaf.y0;
      if (w < 1 || h < 1) continue;
      ctx.fillStyle = colorFor(leaf.data, palette);
      ctx.fillRect(leaf.x0, leaf.y0, w, h);
      // Cushion: light top-left, dark bottom-right.
      if (w > 3 && h > 3) {
        const g = ctx.createLinearGradient(leaf.x0, leaf.y0, leaf.x1, leaf.y1);
        g.addColorStop(0, "rgba(255,255,255,0.22)");
        g.addColorStop(0.5, "rgba(255,255,255,0.0)");
        g.addColorStop(1, "rgba(0,0,0,0.28)");
        ctx.fillStyle = g;
        ctx.fillRect(leaf.x0, leaf.y0, w, h);
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
      ctx.strokeRect(d.x0 + 0.5, d.y0 + 0.5, w - 1, h - 1);
      if (d.depth <= 2 && w > 42 && h > 14) {
        const label = d.data.name;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.save();
        ctx.beginPath();
        ctx.rect(d.x0 + 3, d.y0, w - 6, 14);
        ctx.clip();
        ctx.fillText(label, d.x0 + 4, d.y0 + 7);
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
      if (sel) {
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

  const onClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const n = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
    if (!n) {
      onSelect(null);
      return;
    }
    onSelect(n.data);
    // Zoom into the directory the click lands in (depth-1 child of the current root),
    // unless it's a leaf the user is selecting.
    if (n.data.isDir && n.data.children?.length) onEnterDir(n.data);
    else {
      const d1 = ancestorAtDepth(n, 1);
      if (
        d1?.data.isDir &&
        d1.data.children?.length &&
        d1.data.path !== root.path
      ) {
        onEnterDir(d1.data);
      }
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
      />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-xs rounded-grape border border-longan-700 bg-longan-900/95 px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: Math.min(hover.x + 12, size.w - 220),
            top: Math.min(hover.y + 12, size.h - 56),
          }}
        >
          <div className="truncate font-medium text-lychee-100">
            {hover.node.data.name}
          </div>
          <div className="text-persimmon-300">
            {formatBytes(hover.node.value ?? hover.node.data.size)}
          </div>
          <div className="truncate text-[10px] text-lychee-500">
            {hover.node.data.path}
          </div>
        </div>
      )}
    </div>
  );
}

function ancestorAtDepth(node: RNode, depth: number): RNode | null {
  let cur: RNode | null = node;
  while (cur && cur.depth > depth) cur = cur.parent as RNode | null;
  return cur && cur.depth === depth ? cur : null;
}
