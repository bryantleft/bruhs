import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { type Clock, steadyMap } from "~/lib/steady-map";
import {
  kindBytesByFolder,
  type LabelMarks,
  layoutTreemap,
  siblingOrder,
  type TreemapLayout,
} from "~/lib/treemap-layout";
import type { DirNode } from "~/lib/types";

export interface ShownLayout {
  /** What the map draws, and finds the blocks under the pointer in. */
  readonly layout: TreemapLayout | null;
  /** The map drew `layout`, which is now on screen. */
  drew(layout: TreemapLayout): void;
  /** A button went down over the map, as the `clicks`th click in a row (`MouseEvent.detail`). */
  press(clicks: number): void;
  /** The button came up, wherever the pointer is. */
  release(): void;
  /** The press opened the item's menu instead of clicking. */
  menu(): void;
  /** The hover card opened or closed. */
  cardShown(open: boolean): void;
  /** The layout a click acts on: the one on screen when its button went down, a double-click's first click's. */
  clicked(): TreemapLayout | null;
}

const browserClock: Clock = {
  now: () => performance.now(),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

/**
 * The layout a disk map shows: `root` laid out at `width` × `height` CSS pixels, once for each, with room for the
 * `marks` the host draws on labels, if any, and the Not measured block of `unmeasured` bytes, if the host gives them.
 * A `steady` map's newer layouts of the same folder keep its siblings' places within a margin, leave the layout shown
 * as it is when they'd draw the same, and wait while the person clicks or reads the hover card, a double-click
 * lasting `doubleClick` ms (steady-map.ts). A root `atOnce` answers the person's own action, and shows as it comes, as
 * every layout of any other map does.
 */
export function useShownLayout(
  root: DirNode,
  width: number,
  height: number,
  steady: boolean,
  doubleClick: number,
  atOnce: boolean,
  marks: LabelMarks | undefined,
  unmeasured?: number,
): ShownLayout {
  const kinds = useMemo(() => kindBytesByFolder(root), [root]);
  const [layout, setLayout] = useState<TreemapLayout | null>(null);
  const [map] = useState(() => steadyMap(browserClock, setLayout));
  useEffect(() => () => map.stop(), [map]);

  // Before the browser paints, so the map never shows a folder with another's blocks.
  useLayoutEffect(() => {
    if (width < 2 || height < 2) {
      map.show(null);
      return;
    }
    const before = map.shown();
    const order =
      steady && before?.root.path === root.path
        ? siblingOrder(before)
        : undefined;
    const next = layoutTreemap(
      root,
      width,
      height,
      kinds,
      order,
      marks,
      unmeasured,
    );
    if (steady && !atOnce) map.newer(next);
    else map.show(next);
  }, [root, width, height, kinds, steady, atOnce, marks, unmeasured, map]);

  const release = useCallback(
    () => map.release(doubleClick),
    [map, doubleClick],
  );
  return {
    layout,
    drew: map.drew,
    press: map.press,
    release,
    menu: map.menu,
    cardShown: map.card,
    clicked: map.clicked,
  };
}
