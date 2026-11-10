import type { TokenRef } from "@bruhs/theme/semantic";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShownLayout } from "~/hooks/useShownLayout";
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
  type HintStep,
  type LearnedHints,
  type MapHints,
  NOTHING_LEARNED,
  storedHints,
  storeHint,
} from "~/lib/map-hints";
import {
  CATEGORIES,
  folderToOpenAt,
  GAP,
  headerLabel,
  isFolderLike,
  type Kind,
  type LabelMarks,
  type LabelMetrics,
  labelMiddle,
  markRoom,
  nodeOf,
  type Tile,
  type TreemapLayout,
  tileAt,
  tileForPath,
  tileLabel,
  type UsedSpace,
} from "~/lib/treemap-layout";
import type { DirNode, TreeNode } from "~/lib/types";
import { describe } from "./hover-card";
import {
  browserFrames,
  drawMark,
  drawPadlock,
  iconArrivals,
  iconPaint,
  type MapIcons,
  PADLOCK_BOX,
  PADLOCK_PATH,
  paintArrived,
  type WaitingIcon,
} from "./map-marks";
import { arrowStep, selectable } from "./map-selection";
import { TreemapItems } from "./treemap-items";

interface Props {
  /** The directory currently shown as the treemap root. */
  root: DirNode;
  /**
   * Open a child folder of `root`. Opening a folder further down calls this once per
   * level, so the host's path keeps a step for each folder.
   */
  onEnterDir: (node: DirNode) => void;
  /** A click selected an item (for the details/delete panel), or null to select nothing. */
  onSelect: (node: TreeNode | null) => void;
  /**
   * A ⌘-click on an item: add it to the selection, or take it out, as in Finder, for a host that keeps several, as
   * Pith does. Without it a ⌘-click selects as a click does.
   */
  onToggle?: (node: TreeNode) => void;
  /** The items selected, by path, each outlined; the last one picked is where the arrow keys move from. */
  selectedPaths: readonly string[];
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
  /** Space with items selected: show them in Quick Look. */
  onPreview?: (paths: readonly string[]) => void;
  /** Command-Delete with items selected: move them to the Trash. */
  onTrash?: (paths: readonly string[]) => void;
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
   * macOS's icons on the map itself, for a host that has them, as Pith's page does: on depth-1 and depth-2 header
   * strips, and on package, volume and folder blocks with room (map-marks.ts). Without them the map keeps no room for
   * icons, as in the browser app.
   */
  mapIcons?: MapIcons;
  /**
   * macOS's Differentiate Without Color is on: each file block with room shows its kind's glyph, the cue that doesn't
   * need colour, as By kind does beside each kind.
   */
  kindGlyphs?: boolean;
  /**
   * The host replaces `root` with a newer map of the same folder as the disk changes, as Pith's live map does, so the
   * map holds still (useShownLayout.ts): its blocks keep their places unless a change in size shows, it draws nothing
   * when no block would change, and it waits while the person clicks or reads the hover card.
   */
  steady?: boolean;
  /** How long the system waits for a second click to make a double-click, in milliseconds, which a steady map holds for. */
  doubleClickInterval?: number;
  /**
   * `root` answers the person's own action, such as moving an item to the Trash or putting it back, so a steady map
   * shows it at once, whatever would hold it still.
   */
  atOnce?: boolean;
  /**
   * `root`'s volume's used space, from a host that accounts for a whole volume's space, as Pith's page does at its map's
   * root: what the scan couldn't measure takes a hatched "Not measured" block among `root`'s items, and `root`'s shares
   * become shares of the volume's used space. Without it the map shows the scan alone.
   */
  usedSpace?: UsedSpace;
  /** The Not measured block was clicked: show what it holds and why. Nothing selects or opens it. */
  onUnmeasured?: () => void;
  /** Draw a padlock after the name of each header strip whose folder holds folders the scan couldn't read, as Pith does. */
  padlocks?: boolean;
  /**
   * Which click hints the person has learned, for a host that keeps them, as Pith does in its settings, and what to do
   * as the map learns one. Without it the map keeps them in the page's own storage.
   */
  hints?: MapHints;
  /**
   * A scan is running, which the host shows over this map, dimmed, taking no clicks on it until the scan ends, as Pith
   * does: the hover card offers none meanwhile.
   */
  scanning?: boolean;
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

/** The labels' metrics in `font`, which the map lays its labels and their marks out with and draws them with. */
function labelMetrics(font: string): LabelMetrics {
  const context = document.createElement("canvas").getContext("2d");
  if (!context)
    throw new Error("This browser couldn't create a canvas for the disk map.");
  context.font = `500 ${LABEL.size}px ${font}`;
  return {
    charWidth: context.measureText("0").width,
    lineHeight: LABEL.lineHeight,
    padX: LABEL.padX,
    padY: LABEL.padY,
  };
}

/**
 * The labels' metrics in `font`, and whether loading the font has finished, so labels are measured and cut with its
 * real widths: measured at once, in whatever face stands in, and again once it has loaded. If the font can't load
 * they still appear, in the fallback monospace.
 */
function useLabelFont(font: string | null) {
  const [state, setState] = useState(() => ({
    metrics: font ? labelMetrics(font) : null,
    settled: false,
  }));
  useEffect(() => {
    if (!font) return;
    let live = true;
    const settle = () => {
      if (live) setState({ metrics: labelMetrics(font), settled: true });
    };
    Promise.all([
      document.fonts.load(`500 ${LABEL.size}px ${font}`),
      document.fonts.load(`400 ${LABEL.size}px ${font}`),
    ]).then(settle, settle);
    return () => {
      live = false;
    };
  }, [font]);
  return state;
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
  if (tile.kind === "unmeasured") return false;
  return tile.kind !== "folder" && tile.category === kind;
}

/** A kind's name, as the legend and the map's spoken summary use it. */
export function kindLabel(kind: Kind): string {
  if (kind === "grouped") return "Smaller items";
  if (kind === "volume") return "Other volumes";
  return CATEGORY_LABEL[kind];
}

/**
 * Paints `layout`, its labels, once their font has loaded, with `metrics`, and its marks: each file block's kind
 * glyph, and the icons `icons` has loaded, from its cache. It asks for the icons it lacks, keeping their room empty,
 * and returns those, for painting as they come.
 */
function drawMap(
  canvas: HTMLCanvasElement,
  layout: TreemapLayout,
  palette: Palette,
  highlight: Kind | null,
  ratio: number,
  metrics: LabelMetrics,
  labels: boolean,
  icons: MapIcons | undefined,
): readonly WaitingIcon[] {
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

  /** Hatching that rises to the right, as the group of smaller items has, or falls to the right. */
  const hatch = (box: Drawn, rising = true) => {
    clipTo(box, () => {
      ctx.strokeStyle = palette.role.textTertiary;
      ctx.globalAlpha *= HATCH.alpha;
      ctx.beginPath();
      for (let d = -box.h; d < box.w; d += HATCH.step) {
        ctx.moveTo(box.x + d, rising ? box.y + box.h : box.y);
        ctx.lineTo(box.x + d + box.h, rising ? box.y : box.y + box.h);
      }
      ctx.stroke();
    });
  };

  const paint = icons ? iconPaint(icons, ratio) : null;

  const drawFolder = (tile: Extract<Tile, { kind: "folder" }>) => {
    const box = drawnBox(tile);
    ctx.fillStyle = palette.role.well;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    outline(box, palette.role.hairline);
    const middle = labelMiddle(tile, metrics);
    drawMark(ctx, tile, metrics, paint, palette.role.text);
    const label = labels ? headerLabel(tile, metrics) : null;
    if (!label) return;
    clipTo({ ...box, h: tile.header }, () => {
      text(
        label.name,
        box.x + LABEL.padX + markRoom(tile),
        middle,
        fonts.name,
        palette.role.text,
        "left",
      );
      // After the name as drawn, in the room its layout kept, as the size beside it is drawn.
      drawPadlock(
        ctx,
        tile,
        metrics,
        ctx.measureText(label.name).width,
        palette.role.textSecondary,
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
    } else if (tile.kind === "collapsed" || tile.kind === "package") {
      // A package is a folder that Finder shows as one item, so it's drawn as a folder block is.
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
    } else if (tile.kind === "unmeasured") {
      // Used space nothing on the map stands for: recessed, hatched the other way from the smaller items, whose items
      // the map has, and edged with dashes, as a volume the scan didn't enter is.
      ctx.fillStyle = palette.role.well;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      hatch(box, false);
      ctx.setLineDash([3, 2]);
      outline(box, palette.role.textTertiary);
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = palette.role.hairline;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      hatch(box);
    }
    const first = labelMiddle(tile, metrics);
    drawMark(ctx, tile, metrics, paint, ink);
    const label = labels ? tileLabel(tile, metrics) : null;
    if (label) {
      clipTo(box, () => {
        text(
          label.name,
          box.x + LABEL.padX + markRoom(tile),
          first,
          fonts.name,
          ink,
          "left",
        );
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
  return paint?.done() ?? [];
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

/** A block with a fill of its own, unlike a folder drawn around its contents or the hatched blocks. */
const filled = (tile: Tile) =>
  tile.kind !== "folder" && tile.kind !== "group" && tile.kind !== "unmeasured";

/** The item a tile shows, by path, for linking other views: none for the group or the Not measured block. */
const pathOf = (tile: Tile | null) => (tile && nodeOf(tile)?.path) ?? null;

export function TreemapCanvas({
  root,
  onEnterDir,
  onSelect,
  onToggle,
  selectedPaths,
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
  mapIcons,
  kindGlyphs = false,
  steady = false,
  doubleClickInterval = 500,
  atOnce = false,
  usedSpace,
  onUnmeasured,
  padlocks = false,
  hints,
  scanning = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  // The hints the page's own storage has learned, unless the host keeps them.
  const [stored, setStored] = useState<LearnedHints>(() =>
    hints ? NOTHING_LEARNED : storedHints(),
  );
  const learned = hints?.learned ?? stored;
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
  const { metrics, settled: fontSettled } = useLabelFont(
    "palette" in colors ? colors.palette.font : null,
  );
  // The marks drawn on labels, which the layout keeps room for where the labels still fit beside them.
  const hasIcons = mapIcons !== undefined;
  const marks = useMemo(
    (): LabelMarks | undefined =>
      metrics && (hasIcons || kindGlyphs || padlocks)
        ? { icons: hasIcons, glyphs: kindGlyphs, padlocks, metrics }
        : undefined,
    [hasIcons, kindGlyphs, padlocks, metrics],
  );

  // Layout once per folder, size, marks and Not measured block; hovering never lays out again.
  const shownLayout = useShownLayout(
    root,
    size.w,
    size.h,
    steady,
    doubleClickInterval,
    atOnce,
    marks,
    usedSpace,
  );
  const { layout, drew } = shownLayout;

  // Paint when the layout, colours, label font, highlight or icons change. An icon that comes later is no change to the
  // layout: it's painted into the room the layout kept for it, without drawing the map again or holding it still.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout || !("palette" in colors) || !metrics) return;
    const waiting = drawMap(
      canvas,
      layout,
      colors.palette,
      highlightKind,
      ratio,
      metrics,
      fontSettled,
      mapIcons,
    );
    // On screen now, so a click that begins acts on it.
    drew(layout);
    if (!mapIcons || waiting.length === 0) return;
    return iconArrivals(waiting, mapIcons, browserFrames, (icon, image) =>
      paintArrived(canvas, ratio, icon, image),
    );
  }, [
    layout,
    colors,
    highlightKind,
    ratio,
    metrics,
    fontSettled,
    drew,
    mapIcons,
  ]);

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
  // The blocks that show the items selected, each once: items folded into one group share its block.
  const selected = useMemo(
    () =>
      layout
        ? [
            ...new Set(
              selectedPaths.flatMap((path) => tileForPath(layout, path) ?? []),
            ),
          ]
        : [],
    [layout, selectedPaths],
  );

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

  const learn = useCallback(
    (step: HintStep) => {
      if (learned[step]) return;
      if (hints) {
        hints.learn(step);
        return;
      }
      storeHint(step);
      setStored((current) => ({ ...current, [step]: true }));
    },
    [learned, hints],
  );
  // A ⌘-click, or the add button in the list of items, adds an item to the selection or takes it out, and the card
  // stops saying a ⌘-click selects several. It's the same function while the pointer moves, so hovering doesn't render
  // the list again.
  const toggle = useMemo(
    () =>
      onToggle &&
      ((node: TreeNode) => {
        learn("several");
        onToggle(node);
      }),
    [onToggle, learn],
  );

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) shownLayout.press(e.detail);
  };

  // Single click selects (for inspect/delete), and a ⌘-click adds an item to the selection or takes it out, where the
  // host keeps several. Double click opens a folder. Keeping these separate means nothing is ever left "selected" just
  // by navigating. Both act on the blocks on screen when the click began, whatever came since.
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const clicked = shownLayout.clicked();
    if (!clicked) return;
    const tile = tileAt(clicked, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    // The Not measured block explains itself, and leaves the selection as it was.
    if (tile?.kind === "unmeasured") {
      onUnmeasured?.();
      return;
    }
    const node = selectable(tile);
    if (node) learn("selected");
    // A ⌘-click on what's no item, such as the smaller items, leaves the selection as it was.
    if (e.metaKey && toggle) {
      if (node) toggle(node);
      return;
    }
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
    // The menu acts on what's under the pointer, so that becomes the selection, as in Finder; on an item selected
    // already, it acts on every item selected.
    if (node && !selectedPaths.includes(node.path)) onSelect(node);
    onMenu(node ? node.path : null);
  };

  /**
   * One tab stop for the whole map: arrows move the selection to the nearest item in that direction from the item
   * picked last, and Shift-arrows add it to the selection where the host keeps several (map-selection.ts). Return opens
   * it when it's a folder, Space previews the selection, Command-Delete trashes it, and Escape deselects.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!layout || e.target !== e.currentTarget) return;
    // The Not measured block is no item to arrow onto; the list of items reaches it.
    const items: readonly Tile[] = layout.tiles.filter(
      (tile) => tile.kind !== "unmeasured",
    );
    const last = selectedPaths.at(-1);
    const current = last === undefined ? null : tileForPath(layout, last);
    const own = current && items.includes(current) ? current : null;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        if (e.metaKey) return;
        e.preventDefault();
        const extend = e.shiftKey && onToggle !== undefined;
        const step = arrowStep(items, own, e.key, extend, selected);
        if (!step) return;
        const node = "add" in step ? step.add : step.select;
        // Pith adds it as a ⌘-click would, through the same toggle: it isn't selected yet.
        if ("add" in step) onToggle?.(node);
        else onSelect(node);
        report(node.path);
        return;
      }
      case "Enter": {
        e.preventDefault();
        if (own && isFolderLike(own)) open(layout, own.node);
        return;
      }
      case " ": {
        e.preventDefault();
        if (selectedPaths.length > 0) onPreview?.(selectedPaths);
        return;
      }
      case "Backspace":
      case "Delete": {
        if (!e.metaKey || selectedPaths.length === 0) return;
        e.preventDefault();
        onTrash?.(selectedPaths);
        return;
      }
      case "Escape": {
        if (selectedPaths.length > 0) {
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
  const notMeasured =
    usedSpace !== undefined && usedSpace.unmeasured > 0
      ? ` ${formatBytes(usedSpace.unmeasured)} more is used space the scan couldn’t measure.`
      : "";
  const keys = onToggle
    ? "Arrow keys select items, Shift and an arrow key add one to the selection, Return opens a folder and Space previews."
    : "Arrow keys select items, Return opens a folder and Space previews.";
  const summary = `Treemap of ${root.path}, ${formatBytes(root.size)} in ${
    root.children.length
  } items.${notMeasured}${highlightLabel} ${keys} The list after it names every item.`;

  const pointedNode = pointed && nodeOf(pointed);
  const delta = pointedNode ? growth?.get(pointedNode.path) : undefined;
  const change =
    delta !== undefined && growthSince
      ? `${delta > 0 ? "+" : "\u2212"}${formatBytes(Math.abs(delta))} since ${growthSince}`
      : null;
  // A share of the folder the block was laid out in: a steady map can show an older map than `root` for a moment.
  const card =
    pointed && layout && pointer
      ? describe(pointed, {
          open: folderToOpenAt(layout, pointer.x, pointer.y),
          layout,
          hints: !(learned.selected && learned.opened),
          clicks: !scanning,
          several: onToggle !== undefined && !learned.several,
          change,
        })
      : null;
  const ink = (tile: Tile) =>
    tile.kind === "file"
      ? colors.palette.ink[tile.category]
      : colors.palette.role.text;

  // What VoiceOver hears of the selection: one item's name and size, or how many.
  const selectedNode = selected.length === 1 ? nodeOf(selected[0]) : null;
  const announced =
    selectedPaths.length > 1
      ? `${selectedPaths.length} items selected`
      : selectedNode
        ? `${selectedNode.name}, ${formatBytes(selectedNode.size)}`
        : "";
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
      {selected.map((tile) => (
        <Ring
          // Blocks never share a corner, so it names the block.
          key={`${tile.x0},${tile.y0}`}
          tile={tile}
          // On a coloured block, a line of its label ink keeps the accent apart from the fill.
          shadow={`inset 0 0 0 2px ${colors.palette.role.accent}${
            filled(tile) ? `, inset 0 0 0 3px ${ink(tile)}` : ""
          }`}
        />
      ))}
      {outlined && !selected.includes(outlined) && (
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
        {announced}
      </p>
      <TreemapItems
        root={root}
        selectedPaths={selectedPaths}
        onSelect={onSelect}
        onToggle={toggle}
        onEnterDir={onEnterDir}
        onFocusItem={focusItem}
        unmeasured={usedSpace?.unmeasured}
        onUnmeasured={onUnmeasured}
      />
    </div>
  );
}

/** A small padlock for folders the scan couldn't read, drawn in the text colour: the one the map's header strips draw. */
function LockGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${PADLOCK_BOX.width} ${PADLOCK_BOX.height}`}
      className="size-2.5 shrink-0"
      fill="currentColor"
    >
      <path d={PADLOCK_PATH} />
    </svg>
  );
}
