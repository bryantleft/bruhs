import type { TokenRef } from "@bruhs/theme/semantic";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { middleTruncate } from "~/lib/display-names";
import { foldersBetween } from "~/lib/folder-trail";
import {
  CATEGORY_LABEL,
  CATEGORY_VAR,
  type Category,
  formatBytes,
} from "~/lib/format";
import {
  type Appearance,
  inkFor,
  LABEL_INKS,
  MAP_ROLES,
  type MapRole,
  parseOklch,
  roleTokens,
} from "~/lib/map-colors";
import {
  CATEGORIES,
  folderToOpenAt,
  GAP,
  headerLabel,
  type Kind,
  kindBytesByFolder,
  type LabelMetrics,
  layoutTreemap,
  type Tile,
  type TreemapLayout,
  tileAt,
  tileForPath,
  tileLabel,
  tileName,
  tileSize,
} from "~/lib/treemap-layout";
import type { DirNode, TreeNode } from "~/lib/types";

interface Props {
  /** The directory currently shown as the treemap root. */
  root: DirNode;
  /**
   * Open a child folder of `root`. Opening a folder further down calls this once per
   * level, so the host's path keeps a step for each folder.
   */
  onEnterDir: (node: DirNode) => void;
  /** Selection changed (for the details/delete panel). null clears. */
  onSelect: (node: TreeNode | null) => void;
  selectedPath: string | null;
  /** Follow the system's light or dark appearance. The browser app is dark-only. */
  followSystemAppearance?: boolean;
  /** Dim every block that isn't this kind. */
  highlightKind?: Kind | null;
  /** A path hovered in another view, such as the largest-files list, to outline here. */
  linkedPath?: string | null;
  /** The path under the pointer or keyboard focus changed, for linking other views. */
  onHoverPath?: (path: string | null) => void;
}

/** Labels are Monaspace Neon at 11 px, the size of the native data captions. */
const LABEL = { size: 11, lineHeight: 13, padX: 4, padY: 3 } as const;
/** Blocks outside the highlighted kind stay visible as context, but recede. */
const DIM_ALPHA = 0.2;
/** Folders drawn as one block are see-through, so they read apart from files. */
const FOLDER_FILL_ALPHA = 0.45;
/** Hatching for grouped items: a 1 px line every 6 px across, at a strength that stays behind labels. */
const HATCH = { step: 6, alpha: 0.55 } as const;

/** Theme colours resolved to concrete strings, because a canvas can't read CSS variables. */
interface Palette {
  readonly role: Readonly<Record<MapRole, string>>;
  readonly fill: Readonly<Record<Category, string>>;
  /** Label ink on each kind's fill: the darker or lighter ink, whichever contrasts more. */
  readonly ink: Readonly<Record<Category, string>>;
  readonly folderFill: Readonly<Record<Category, string>>;
  readonly font: string;
}

/** Add an alpha channel to a theme colour: "…(L C H)" → "…(L C H / a)". */
function withAlpha(color: string, alpha: number): string {
  parseOklch(color);
  return color.replace(/\)\s*$/, ` / ${alpha})`);
}

function resolvePalette(
  appearance: Appearance,
  increasedContrast: boolean,
): Palette {
  const style = getComputedStyle(document.documentElement);
  const variable = (name: string) => {
    const value = style.getPropertyValue(name).trim();
    if (!value) {
      throw new Error(
        `${name} isn't in this page's CSS. Tailwind only emits theme variables that a class or stylesheet uses, so reference it there.`,
      );
    }
    return value;
  };
  const color = (token: string) => variable(`--color-${token}`);
  const resolve = (ref: TokenRef) =>
    typeof ref === "string"
      ? color(ref)
      : withAlpha(color(ref.token), ref.alpha);

  const tokens = roleTokens(appearance, increasedContrast);
  const role = {} as Record<MapRole, string>;
  for (const name of MAP_ROLES) role[name] = resolve(tokens[name]);

  const inks = { dark: color(LABEL_INKS.dark), light: color(LABEL_INKS.light) };
  const levels = { dark: parseOklch(inks.dark), light: parseOklch(inks.light) };
  const fill = {} as Record<Category, string>;
  const ink = {} as Record<Category, string>;
  const folderFill = {} as Record<Category, string>;
  for (const category of CATEGORIES) {
    const value = variable(CATEGORY_VAR[category]);
    fill[category] = value;
    ink[category] = inks[inkFor(parseOklch(value), levels)];
    folderFill[category] = withAlpha(value, FOLDER_FILL_ALPHA);
  }
  const font = `${variable("--font-neon")}, ui-monospace, Menlo, monospace`;
  return { role, fill, ink, folderFill, font };
}

/** The system appearance when the host follows it; otherwise bruhs's dark. */
function useAppearance(follow: boolean) {
  const query = (media: string) => follow && window.matchMedia(media).matches;
  const [light, setLight] = useState(() =>
    query("(prefers-color-scheme: light)"),
  );
  const [more, setMore] = useState(() => query("(prefers-contrast: more)"));
  useEffect(() => {
    if (!follow) return;
    const scheme = window.matchMedia("(prefers-color-scheme: light)");
    const contrast = window.matchMedia("(prefers-contrast: more)");
    const update = () => {
      setLight(scheme.matches);
      setMore(contrast.matches);
    };
    scheme.addEventListener("change", update);
    contrast.addEventListener("change", update);
    return () => {
      scheme.removeEventListener("change", update);
      contrast.removeEventListener("change", update);
    };
  }, [follow]);
  const appearance: Appearance = light ? "light" : "dark";
  return { appearance, increasedContrast: more };
}

/** The display's pixel density, which changes when the window moves between screens. */
function useDevicePixelRatio() {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    const query = window.matchMedia(`(resolution: ${ratio}dppx)`);
    const update = () => setRatio(window.devicePixelRatio || 1);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [ratio]);
  return ratio;
}

/**
 * True once loading the label font has finished, so labels are measured and cut with its
 * real widths. If the font can't load they still appear, in the fallback monospace.
 */
function useFontSettled(font: string | null) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!font) return;
    let live = true;
    const settle = () => {
      if (live) setSettled(true);
    };
    Promise.all([
      document.fonts.load(`500 ${LABEL.size}px ${font}`),
      document.fonts.load(`400 ${LABEL.size}px ${font}`),
    ]).then(settle, settle);
    return () => {
      live = false;
    };
  }, [font]);
  return settled;
}

interface Drawn {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A tile's painted area: its box less the gap on the right and bottom. */
const drawnBox = (tile: Tile): Drawn => ({
  x: tile.x0,
  y: tile.y0,
  w: tile.x1 - tile.x0 - GAP,
  h: tile.y1 - tile.y0 - GAP,
});

function matchesKind(tile: Tile, kind: Kind): boolean {
  if (tile.kind === "group") return kind === "grouped";
  return tile.kind !== "folder" && tile.category === kind;
}

function drawMap(
  canvas: HTMLCanvasElement,
  layout: TreemapLayout,
  palette: Palette,
  highlight: Kind | null,
  ratio: number,
  labels: boolean,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error("This browser couldn't create a canvas for the disk map.");
  canvas.width = Math.round(layout.width * ratio);
  canvas.height = Math.round(layout.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.textBaseline = "middle";
  const fonts = {
    name: `500 ${LABEL.size}px ${palette.font}`,
    size: `400 ${LABEL.size}px ${palette.font}`,
  };
  ctx.font = fonts.name;
  const metrics: LabelMetrics = {
    charWidth: ctx.measureText("0").width,
    lineHeight: LABEL.lineHeight,
    padX: LABEL.padX,
    padY: LABEL.padY,
  };

  const text = (
    value: string,
    x: number,
    y: number,
    font: string,
    color: string,
    align: CanvasTextAlign,
  ) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };

  const clipTo = (box: Drawn, paint: () => void) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    paint();
    ctx.restore();
  };

  const outline = (box: Drawn, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
  };

  const hatch = (box: Drawn) => {
    clipTo(box, () => {
      ctx.strokeStyle = palette.role.textTertiary;
      ctx.globalAlpha *= HATCH.alpha;
      ctx.beginPath();
      for (let d = -box.h; d < box.w; d += HATCH.step) {
        ctx.moveTo(box.x + d, box.y + box.h);
        ctx.lineTo(box.x + d + box.h, box.y);
      }
      ctx.stroke();
    });
  };

  const drawFolder = (tile: Extract<Tile, { kind: "folder" }>) => {
    const box = drawnBox(tile);
    ctx.fillStyle = palette.role.well;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    outline(box, palette.role.hairline);
    const label = labels ? headerLabel(tile, metrics) : null;
    if (!label) return;
    const middle = box.y + tile.header / 2 + 0.5;
    clipTo({ ...box, h: tile.header }, () => {
      text(
        label.name,
        box.x + LABEL.padX,
        middle,
        fonts.name,
        palette.role.text,
        "left",
      );
      if (label.size) {
        text(
          label.size,
          box.x + box.w - LABEL.padX,
          middle,
          fonts.size,
          palette.role.textSecondary,
          "right",
        );
      }
    });
  };

  const drawBlock = (tile: Exclude<Tile, { kind: "folder" }>, dim: boolean) => {
    const box = drawnBox(tile);
    ctx.globalAlpha = dim ? DIM_ALPHA : 1;
    let ink = palette.role.text;
    if (tile.kind === "file") {
      ctx.fillStyle = palette.fill[tile.category];
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ink = palette.ink[tile.category];
    } else if (tile.kind === "collapsed") {
      ctx.fillStyle = palette.folderFill[tile.category];
      ctx.fillRect(box.x, box.y, box.w, box.h);
      outline(box, palette.fill[tile.category]);
    } else {
      ctx.fillStyle = palette.role.hairline;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      hatch(box);
    }
    const label = labels ? tileLabel(tile, metrics) : null;
    if (label) {
      const first = box.y + LABEL.padY + LABEL.lineHeight / 2 + 0.5;
      clipTo(box, () => {
        text(label.name, box.x + LABEL.padX, first, fonts.name, ink, "left");
        if (!label.size) return;
        if (label.lines === 2) {
          text(
            label.size,
            box.x + LABEL.padX,
            first + LABEL.lineHeight,
            fonts.size,
            ink,
            "left",
          );
        } else {
          text(
            label.size,
            box.x + box.w - LABEL.padX,
            first,
            fonts.size,
            ink,
            "right",
          );
        }
      });
    }
    ctx.globalAlpha = 1;
  };

  const visit = (tiles: readonly Tile[]) => {
    for (const tile of tiles) {
      if (tile.kind === "folder") {
        drawFolder(tile);
        visit(tile.children);
      } else {
        drawBlock(tile, highlight !== null && !matchesKind(tile, highlight));
      }
    }
  };
  visit(layout.tiles);
}

const percentOf = (part: number, whole: number) => {
  const share = whole > 0 ? (part / whole) * 100 : 0;
  return share > 0 && share < 1 ? "<1%" : `${Math.round(share)}%`;
};

/** What the hover card says about a block, each part shown as its own line or figure. */
interface Card {
  readonly title: string;
  /**
   * What the block is, with the fill or outline it has on the map, as in the kind legend.
   * Null for a group of small items, which mixes kinds.
   */
  readonly kind: {
    readonly label: string;
    readonly fill: string | null;
  } | null;
  readonly size: string;
  /** The block's share of the open folder, e.g. "12% of Users". */
  readonly share: string;
  /** What clicks do. */
  readonly hint: string;
}

function describe(tile: Tile, open: DirNode | null, root: DirNode): Card {
  const size = formatBytes(tileSize(tile));
  const share = `${percentOf(tileSize(tile), root.size)} of ${root.name || "/"}`;
  const openFolder = open ? ` Double-click to open ${open.name}/.` : "";
  const title = middleTruncate(tileName(tile), 34);
  const fill = (category: Category) => `var(${CATEGORY_VAR[category]})`;
  switch (tile.kind) {
    case "file":
      return {
        title,
        kind: {
          label: CATEGORY_LABEL[tile.category],
          fill: fill(tile.category),
        },
        size,
        share,
        hint: `Click to select.${openFolder}`,
      };
    case "group":
      return {
        title,
        kind: null,
        size,
        share,
        hint: `Too small to show one by one.${openFolder}`,
      };
    case "collapsed":
      return {
        title,
        kind: {
          label:
            tile.category === "other"
              ? "Folder"
              : `Folder, mostly ${CATEGORY_LABEL[tile.category].toLowerCase()}`,
          fill: fill(tile.category),
        },
        size,
        share,
        hint: "Click to select. Double-click to open.",
      };
    case "folder":
      // Drawn as a container around its contents, so its swatch is an outline.
      return {
        title,
        kind: { label: "Folder", fill: null },
        size,
        share,
        hint: "Click to select. Double-click to open.",
      };
  }
}

/** A ring drawn over the canvas, so hover and selection never repaint the map. */
function Ring({ tile, shadow }: { tile: Tile; shadow: string }) {
  const box = drawnBox(tile);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        boxShadow: shadow,
      }}
    />
  );
}

const pathOf = (tile: Tile | null) =>
  tile && tile.kind !== "group" ? tile.node.path : null;

export function TreemapCanvas({
  root,
  onEnterDir,
  onSelect,
  selectedPath,
  followSystemAppearance = false,
  highlightKind = null,
  linkedPath = null,
  onHoverPath,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const reported = useRef<string | null>(null);
  const { appearance, increasedContrast } = useAppearance(
    followSystemAppearance,
  );
  const ratio = useDevicePixelRatio();

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

  const colors = useMemo((): { palette: Palette } | { error: string } => {
    try {
      return { palette: resolvePalette(appearance, increasedContrast) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [appearance, increasedContrast]);
  const fontSettled = useFontSettled(
    "palette" in colors ? colors.palette.font : null,
  );

  // Layout once per folder and size; hovering never lays out again.
  const kinds = useMemo(() => kindBytesByFolder(root), [root]);
  const layout = useMemo(
    () =>
      size.w < 2 || size.h < 2
        ? null
        : layoutTreemap(root, size.w, size.h, kinds),
    [root, size, kinds],
  );

  // Paint when the layout, colours, label font or highlight change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout || !("palette" in colors)) return;
    drawMap(canvas, layout, colors.palette, highlightKind, ratio, fontSettled);
  }, [layout, colors, highlightKind, ratio, fontSettled]);

  // Tell the host what's under the pointer or keyboard focus, once per change.
  const report = useCallback(
    (path: string | null) => {
      if (path === reported.current) return;
      reported.current = path;
      onHoverPath?.(path);
    },
    [onHoverPath],
  );

  const focusItem = useCallback(
    (path: string | null) => {
      setFocusPath(path);
      report(path);
    },
    [report],
  );

  const pointed =
    layout && pointer ? tileAt(layout, pointer.x, pointer.y) : null;
  const outlinedPath = linkedPath ?? focusPath;
  const outlined =
    pointed ??
    (layout && outlinedPath ? tileForPath(layout, outlinedPath) : null);
  const selected =
    layout && selectedPath ? tileForPath(layout, selectedPath) : null;

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    setPointer(point);
    report(layout ? pathOf(tileAt(layout, point.x, point.y)) : null);
  };

  const onLeave = () => {
    setPointer(null);
    report(focusPath);
  };

  // Single click selects (for inspect/delete). Double click opens a folder.
  // Keeping these separate means nothing is ever left "selected" just by navigating.
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!layout) return;
    const tile = tileAt(layout, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    onSelect(tile && tile.kind !== "group" ? tile.node : null);
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!layout) return;
    const folder = folderToOpenAt(
      layout,
      e.nativeEvent.offsetX,
      e.nativeEvent.offsetY,
    );
    if (!folder) return;
    for (const step of foldersBetween(root, folder)) onEnterDir(step);
  };

  if ("error" in colors) {
    return (
      <p
        role="alert"
        className="text-body-sm p-4 text-(--role-status-critical,var(--color-lychee-400))"
      >
        The disk map can't draw: {colors.error}
      </p>
    );
  }

  const highlightLabel =
    highlightKind === null
      ? ""
      : ` Highlighting ${highlightKind === "grouped" ? "smaller items" : CATEGORY_LABEL[highlightKind].toLowerCase()}.`;
  const summary = `Treemap of ${root.path}, ${formatBytes(root.size)} in ${
    root.children.length
  } items.${highlightLabel} Use the list after it to select or open them.`;

  const card =
    pointed && layout && pointer
      ? describe(pointed, folderToOpenAt(layout, pointer.x, pointer.y), root)
      : null;
  const ink = (tile: Tile) =>
    tile.kind === "file"
      ? colors.palette.ink[tile.category]
      : colors.palette.role.text;

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
          cursor: pointed ? "pointer" : "default",
        }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
      {layout && layout.tiles.length === 0 && (
        <p className="text-body-sm pointer-events-none absolute inset-0 flex items-center justify-center text-(--role-text-secondary,var(--color-rambutan-400))">
          Nothing in this folder takes up space.
        </p>
      )}
      {selected && (
        <Ring
          tile={selected}
          // On a coloured block, a line of its label ink keeps the accent apart from the fill.
          shadow={`inset 0 0 0 2px ${colors.palette.role.accent}${
            selected.kind === "file" || selected.kind === "collapsed"
              ? `, inset 0 0 0 3px ${ink(selected)}`
              : ""
          }`}
        />
      )}
      {outlined && outlined !== selected && (
        <Ring tile={outlined} shadow={`inset 0 0 0 2px ${ink(outlined)}`} />
      )}
      {card && pointer && (
        <div
          className="tooltip absolute max-w-64 px-2.5 py-2"
          style={{
            ...(pointer.x > size.w / 2
              ? { right: size.w - pointer.x + 14 }
              : { left: pointer.x + 14 }),
            ...(pointer.y > size.h * 0.6
              ? { bottom: size.h - pointer.y + 14 }
              : { top: pointer.y + 14 }),
          }}
        >
          <p className="text-code-sm font-medium break-all text-(--role-text,var(--color-rambutan-50))">
            {card.title}
          </p>
          {card.kind && (
            <p className="text-label-sm mt-1 flex items-center gap-1.5 text-(--role-text-secondary,var(--color-rambutan-300))">
              <span
                aria-hidden="true"
                className={`rounded-seed size-2.5 shrink-0 ${card.kind.fill ? "" : "inset-ring inset-ring-(--role-text-tertiary,var(--color-rambutan-400))"}`}
                style={
                  card.kind.fill ? { background: card.kind.fill } : undefined
                }
              />
              {card.kind.label}
            </p>
          )}
          <p className="text-code-sm mt-0.5 flex flex-wrap items-baseline gap-x-2 tabular-nums">
            <span className="text-(--role-text,var(--color-rambutan-50))">
              {card.size}
            </span>
            <span className="text-(--role-text-secondary,var(--color-rambutan-300))">
              {card.share}
            </span>
          </p>
          <p className="text-label-sm mt-1 text-pretty text-(--role-text-tertiary,var(--color-rambutan-400))">
            {card.hint}
          </p>
        </div>
      )}
      <TreemapItems
        root={root}
        selectedPath={selectedPath}
        onSelect={onSelect}
        onEnterDir={onEnterDir}
        onFocusItem={focusItem}
      />
    </div>
  );
}

/** A folder the user can zoom into. */
function isOpenable(node: TreeNode, root: DirNode): node is DirNode {
  return (
    node.kind === "dir" && node.children.length > 0 && node.path !== root.path
  );
}

/**
 * The canvas can't be reached by keyboard or read by a screen reader, so the current
 * folder's items are also listed as buttons, including the ones too small to draw. The
 * list is visually hidden until it holds focus, then it appears over the treemap, and the
 * focused item is outlined on the map.
 */
const TreemapItems = memo(function TreemapItems({
  root,
  selectedPath,
  onSelect,
  onEnterDir,
  onFocusItem,
}: Pick<Props, "root" | "selectedPath" | "onSelect" | "onEnterDir"> & {
  onFocusItem: (path: string | null) => void;
}) {
  return (
    <ul
      aria-label={`Items in ${root.name || root.path}`}
      className="surface-floating focus-within:z-popover sr-only max-h-[calc(100%-1rem)] overflow-y-auto p-2 focus-within:not-sr-only focus-within:absolute focus-within:top-2 focus-within:left-2 focus-within:w-80"
      onBlur={() => onFocusItem(null)}
    >
      {root.children.map((child) => (
        <li key={child.path} className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={child.path === selectedPath}
            onClick={() => onSelect(child)}
            onFocus={() =>
              onFocusItem(child.kind === "aggregate" ? null : child.path)
            }
            className="menu-item block min-w-0 flex-1 truncate px-2 py-1"
          >
            {child.name}{" "}
            <span className="text-code-sm text-(--role-text-secondary,var(--color-rambutan-400)) tabular-nums">
              {formatBytes(child.size)}
            </span>
          </button>
          {isOpenable(child, root) && (
            <button
              type="button"
              onClick={() => onEnterDir(child)}
              onFocus={() => onFocusItem(child.path)}
              aria-label={`Open ${child.name}`}
              className="menu-item w-auto shrink-0 px-2 py-1"
            >
              Open
            </button>
          )}
        </li>
      ))}
    </ul>
  );
});
