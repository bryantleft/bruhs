import type { TokenRef } from "@bruhs/theme/semantic";
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShownLayout } from "~/hooks/useShownLayout";
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
  type LabelMetrics,
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
  /**
   * The user asked for an item's actions (right-click, or Control-click), with the item's path, or
   * null for the open folder itself. Without it the map shows no menu.
   */
  onMenu?: (path: string | null) => void;
  /** Space on the selected item: show it in Quick Look. */
  onPreview?: (path: string) => void;
  /** Command-Delete on the selected item: move it to the Trash. */
  onTrash?: (path: string) => void;
  /** How much items changed since the last scan of the scan's folder, in bytes by path. */
  growth?: ReadonlyMap<string, number>;
  /** When that scan was, e.g. "Nov 3". */
  growthSince?: string;
  /**
   * The hovered block's 16 px icon, which the hover card leads its title with, for a host that has icons: Pith's page
   * shows macOS's own. Nothing when there's no icon for the block.
   */
  icon?: (tile: Tile) => ReactNode;
  /**
   * The host replaces `root` with a newer map of the same folder as the disk changes, as Pith's live map does, so the
   * map holds still (useShownLayout.ts): its blocks keep their places unless a change in size shows, it draws nothing
   * when no block would change, and it waits while the person clicks or reads the hover card.
   */
  steady?: boolean;
  /** How long the system waits for a second click to make a double-click, in milliseconds, which a steady map holds for. */
  doubleClickInterval?: number;
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
export function useDevicePixelRatio() {
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
  if (tile.kind === "volume") return kind === "volume";
  return tile.kind !== "folder" && tile.category === kind;
}

/** A kind's name, as the legend and the map's spoken summary use it. */
export function kindLabel(kind: Kind): string {
  if (kind === "grouped") return "Smaller items";
  if (kind === "volume") return "Other volumes";
  return CATEGORY_LABEL[kind];
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
    } else if (tile.kind === "volume") {
      // Measured but not entered: a recessed block with a dashed edge, apart from folders and files.
      ctx.fillStyle = palette.role.well;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.setLineDash([3, 2]);
      outline(box, palette.role.textTertiary);
      ctx.setLineDash([]);
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
  /** What clicks do; null once the user has done both. */
  readonly hint: string | null;
  /** Folders inside it the scan couldn't read, e.g. "2 folders inside couldn't be read". */
  readonly unreadable: string | null;
  /** How much it changed since the last scan, e.g. "+12.3 GB since Nov 3". */
  readonly change: string | null;
}

/** "2 folders inside couldn't be read", or null when the scan read them all. */
function unreadableInside(node: DirNode): string | null {
  const count = node.children.filter(
    (child) => child.kind === "unreadable",
  ).length;
  if (count === 0) return null;
  return `${count} ${count === 1 ? "folder" : "folders"} inside couldn’t be read`;
}

function describe(
  tile: Tile,
  open: DirNode | null,
  root: DirNode,
  hints: boolean,
  change: string | null,
): Card {
  const size = formatBytes(tileSize(tile));
  const share = `${percentOf(tileSize(tile), root.size)} of ${root.name || "/"}`;
  const openFolder = open ? ` Double-click to open ${open.name}/.` : "";
  const title = middleTruncate(tileName(tile), 34);
  const fill = (category: Category) => `var(${CATEGORY_VAR[category]})`;
  const hint = (text: string) => (hints ? text : null);
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
        hint: hint(`Click to select.${openFolder}`),
        unreadable: null,
        change,
      };
    case "volume":
      return {
        title,
        kind: { label: "Another volume on this disk", fill: null },
        size,
        share,
        // Always said: why this block can't be opened isn't something a user learns once.
        hint: "Measured, not scanned: macOS keeps this volume apart from your files.",
        unreadable: null,
        change,
      };
    case "group":
      return {
        title,
        kind: null,
        size,
        share,
        hint: hint(`Too small to show one by one.${openFolder}`),
        unreadable: null,
        change,
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
        hint: hint("Click to select. Double-click to open."),
        unreadable: unreadableInside(tile.node),
        change,
      };
    case "folder":
      // Drawn as a container around its contents, so its swatch is an outline.
      return {
        title,
        kind: { label: "Folder", fill: null },
        size,
        share,
        hint: hint("Click to select. Double-click to open."),
        unreadable: unreadableInside(tile.node),
        change,
      };
  }
}

/**
 * Click and double-click hints show until the user has selected and opened something on
 * the map once. Stored per viewer; when storage is unavailable the hints keep showing.
 */
const HINTS_KEY = "pith.mapHintsLearned";
function hintsLearned(): { selected: boolean; opened: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(HINTS_KEY) ?? "{}");
    return { selected: saved.selected === true, opened: saved.opened === true };
  } catch {
    return { selected: false, opened: false };
  }
}
function learnHint(step: "selected" | "opened") {
  try {
    const learned = { ...hintsLearned(), [step]: true };
    localStorage.setItem(HINTS_KEY, JSON.stringify(learned));
  } catch {
    // Without storage the hints stay, which is harmless.
  }
}

/** The tile nearest `from` in an arrow key's direction, among the open folder's own items. */
function tileInDirection(
  tiles: readonly Tile[],
  from: Tile,
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
): Tile | null {
  const center = (t: Tile) => ({ x: (t.x0 + t.x1) / 2, y: (t.y0 + t.y1) / 2 });
  const origin = center(from);
  let best: Tile | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const tile of tiles) {
    if (tile === from) continue;
    const c = center(tile);
    const dx = c.x - origin.x;
    const dy = c.y - origin.y;
    const along =
      key === "ArrowLeft"
        ? -dx
        : key === "ArrowRight"
          ? dx
          : key === "ArrowUp"
            ? -dy
            : dy;
    const across =
      key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dy) : Math.abs(dx);
    if (along <= 0) continue;
    // Straight ahead beats diagonal: sideways distance counts double.
    const score = along + 2 * across;
    if (score < bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  return best;
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

/** A selectable item: a file or folder. Groups and volumes can't be moved to the Trash or revealed. */
const selectable = (tile: Tile | null): TreeNode | null =>
  tile && tile.kind !== "group" && tile.kind !== "volume" ? tile.node : null;

export function TreemapCanvas({
  root,
  onEnterDir,
  onSelect,
  selectedPath,
  followSystemAppearance = false,
  highlightKind = null,
  linkedPath = null,
  onHoverPath,
  onMenu,
  onPreview,
  onTrash,
  growth,
  growthSince,
  icon,
  steady = false,
  doubleClickInterval = 500,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [learned, setLearned] = useState(hintsLearned);
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
  const shownLayout = useShownLayout(
    root,
    size.w,
    size.h,
    steady,
    doubleClickInterval,
  );
  const { layout } = shownLayout;

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

  // The hover card is open while a block is under the pointer, and a steady map holds still meanwhile.
  const cardOpen = pointed !== null;
  const { cardShown, release } = shownLayout;
  useEffect(() => cardShown(cardOpen), [cardShown, cardOpen]);
  // A button that went down on the map can come up anywhere on the page.
  useEffect(() => {
    const up = (event: MouseEvent) => {
      if (event.button === 0) release();
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [release]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    setPointer(point);
    report(layout ? pathOf(tileAt(layout, point.x, point.y)) : null);
  };

  const onLeave = () => {
    setPointer(null);
    report(focusPath);
  };

  const learn = (step: "selected" | "opened") => {
    if (learned[step]) return;
    learnHint(step);
    setLearned((current) => ({ ...current, [step]: true }));
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) shownLayout.press(e.detail);
  };

  // Single click selects (for inspect/delete). Double click opens a folder.
  // Keeping these separate means nothing is ever left "selected" just by navigating.
  // Both act on the blocks on screen when the click began, whatever came since.
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const clicked = shownLayout.clicked();
    if (!clicked) return;
    const node = selectable(
      tileAt(clicked, e.nativeEvent.offsetX, e.nativeEvent.offsetY),
    );
    if (node) learn("selected");
    onSelect(node);
  };

  /** Opens `folder`, a step for each level from the folder of `from`, the layout it was found in. */
  const open = (from: TreemapLayout, folder: DirNode | null) => {
    if (!folder) return;
    learn("opened");
    for (const step of foldersBetween(from.root, folder)) onEnterDir(step);
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const clicked = shownLayout.clicked();
    if (!clicked) return;
    const { offsetX, offsetY } = e.nativeEvent;
    open(clicked, folderToOpenAt(clicked, offsetX, offsetY));
  };

  const onContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    // The menu takes the rest of the click, its button's release included.
    shownLayout.menu();
    if (!layout || !onMenu) return;
    const node = selectable(
      tileAt(layout, e.nativeEvent.offsetX, e.nativeEvent.offsetY),
    );
    // The menu acts on what's under the pointer, so that becomes the selection, as in Finder.
    if (node) onSelect(node);
    onMenu(node ? node.path : null);
  };

  /**
   * One tab stop for the whole map: arrows move the selection to the nearest item in that
   * direction, Return opens a folder, Space previews, Command-Delete trashes, Escape deselects.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!layout || e.target !== e.currentTarget) return;
    const items = layout.tiles;
    const current =
      (selectedPath ? tileForPath(layout, selectedPath) : null) ?? null;
    const own = current && items.includes(current) ? current : null;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        if (e.metaKey) return;
        e.preventDefault();
        const next = own
          ? tileInDirection(items, own, e.key)
          : (items.find((tile) => selectable(tile)) ?? null);
        const node = selectable(next);
        if (node) {
          onSelect(node);
          report(node.path);
        }
        return;
      }
      case "Enter": {
        e.preventDefault();
        if (own && (own.kind === "folder" || own.kind === "collapsed"))
          open(layout, own.node);
        return;
      }
      case " ": {
        e.preventDefault();
        if (selectedPath) onPreview?.(selectedPath);
        return;
      }
      case "Backspace":
      case "Delete": {
        if (!e.metaKey || !selectedPath) return;
        e.preventDefault();
        onTrash?.(selectedPath);
        return;
      }
      case "Escape": {
        if (selectedPath) {
          e.preventDefault();
          onSelect(null);
        }
        return;
      }
    }
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
      : ` Highlighting ${kindLabel(highlightKind).toLowerCase()}.`;
  const summary = `Treemap of ${root.path}, ${formatBytes(root.size)} in ${
    root.children.length
  } items.${highlightLabel} Arrow keys select items, Return opens a folder and Space previews. The list after it names every item.`;

  const delta =
    pointed && pointed.kind !== "group"
      ? growth?.get(pointed.node.path)
      : undefined;
  const change =
    delta !== undefined && growthSince
      ? `${delta > 0 ? "+" : "\u2212"}${formatBytes(Math.abs(delta))} since ${growthSince}`
      : null;
  const card =
    pointed && layout && pointer
      ? describe(
          pointed,
          folderToOpenAt(layout, pointer.x, pointer.y),
          root,
          !(learned.selected && learned.opened),
          change,
        )
      : null;
  const ink = (tile: Tile) =>
    tile.kind === "file"
      ? colors.palette.ink[tile.category]
      : colors.palette.role.text;

  const selectedNode =
    selected && selected.kind !== "group" ? selected.node : null;
  return (
    // One tab stop that handles its own keys, so it's an application to assistive technology.
    <div
      ref={wrapRef}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: role="application" makes it interactive; Biome doesn't count that role.
      tabIndex={0}
      role="application"
      aria-roledescription="disk map"
      aria-label={`Disk map of ${root.name || root.path}`}
      onKeyDown={onKeyDown}
      className="rounded-seed relative h-full w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-(--role-accent,var(--color-persimmon-400))"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={summary}
        style={{
          width: size.w,
          height: size.h,
          display: "block",
          // An arrow, as Finder's icon view: macOS keeps the pointing hand for links.
          cursor: "default",
        }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onMouseDown={onMouseDown}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
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
            selected.kind === "file" ||
            selected.kind === "collapsed" ||
            selected.kind === "volume"
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
          {icon && pointed ? (
            <p className="text-code-sm flex gap-1.5 font-medium text-(--role-text,var(--color-rambutan-50))">
              {/* Hidden when there's no icon to show, so the title starts where it would without one. */}
              <span
                aria-hidden="true"
                className="mt-px flex shrink-0 empty:hidden"
              >
                {icon(pointed)}
              </span>
              <span className="min-w-0 break-all">{card.title}</span>
            </p>
          ) : (
            <p className="text-code-sm font-medium break-all text-(--role-text,var(--color-rambutan-50))">
              {card.title}
            </p>
          )}
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
          {card.change && (
            <p className="text-code-sm mt-0.5 text-(--role-text-secondary,var(--color-rambutan-300)) tabular-nums">
              {card.change}
            </p>
          )}
          {card.unreadable && (
            <p className="text-label-sm mt-1 flex items-center gap-1.5 text-(--role-text-secondary,var(--color-rambutan-300))">
              <LockGlyph />
              {card.unreadable}
            </p>
          )}
          {card.hint && (
            <p className="text-label-sm mt-1 text-pretty text-(--role-text-tertiary,var(--color-rambutan-400))">
              {card.hint}
            </p>
          )}
        </div>
      )}
      <p aria-live="polite" className="sr-only">
        {selectedNode
          ? `${selectedNode.name}, ${formatBytes(selectedNode.size)}`
          : ""}
      </p>
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

/** A small padlock for folders the scan couldn't read, drawn in the text colour. */
function LockGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 12"
      className="size-2.5 shrink-0"
      fill="currentColor"
    >
      <path d="M2 5V3.5a3 3 0 0 1 6 0V5h.5A1.5 1.5 0 0 1 10 6.5v4A1.5 1.5 0 0 1 8.5 12h-7A1.5 1.5 0 0 1 0 10.5v-4A1.5 1.5 0 0 1 1.5 5H2Zm1.5 0h3V3.5a1.5 1.5 0 0 0-3 0V5Z" />
    </svg>
  );
}

/**
 * A screen reader can't read the canvas, so the current folder's items are also listed as
 * buttons, including the ones too small to draw and the folders the scan couldn't read.
 * The list stays out of the tab order, since the map itself is the one tab stop; VoiceOver
 * still reaches every button, and the item it's on is outlined on the map.
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
            tabIndex={-1}
            aria-pressed={child.path === selectedPath}
            disabled={child.kind === "unreadable" || child.kind === "volume"}
            onClick={() => onSelect(child)}
            onFocus={() =>
              onFocusItem(child.kind === "aggregate" ? null : child.path)
            }
            className="menu-item block min-w-0 flex-1 truncate px-2 py-1"
          >
            {child.name}{" "}
            <span className="text-code-sm text-(--role-text-secondary,var(--color-rambutan-400)) tabular-nums">
              {child.kind === "unreadable"
                ? "couldn’t be read"
                : child.kind === "volume"
                  ? `${formatBytes(child.size)}, another volume`
                  : formatBytes(child.size)}
            </span>
          </button>
          {isOpenable(child, root) && (
            <button
              type="button"
              tabIndex={-1}
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
