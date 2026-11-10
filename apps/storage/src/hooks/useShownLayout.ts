import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clicking,
  type HoldEvent,
  heldUntil,
  holdAfter,
  NO_HOLD,
  nextStep,
} from "~/lib/steady-map";
import {
  kindBytesByFolder,
  layoutTreemap,
  siblingOrder,
  type TreemapLayout,
} from "~/lib/treemap-layout";
import type { DirNode } from "~/lib/types";

export interface ShownLayout {
  /** What the map draws, and finds the blocks under the pointer in. */
  readonly layout: TreemapLayout | null;
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

/**
 * The layout a disk map shows: `root` laid out at `width` × `height` CSS pixels, once for each. A `steady` map's newer
 * layouts of the same folder keep its siblings' places within a margin, leave the layout shown as it is when they'd
 * draw the same, and wait while the person clicks or reads the hover card, a double-click lasting `doubleClick` ms
 * (steady-map.ts). Any other map shows each layout as it comes.
 */
export function useShownLayout(
  root: DirNode,
  width: number,
  height: number,
  steady: boolean,
  doubleClick: number,
): ShownLayout {
  const kinds = useMemo(() => kindBytesByFolder(root), [root]);
  const [layout, setLayout] = useState<TreemapLayout | null>(null);
  // As of now rather than the last render, since the pointer and the timer act between renders: the layout shown,
  // the newest one waiting for the hold to let go, the hold, and the layout the click under way began on.
  const shown = useRef<TreemapLayout | null>(null);
  const waiting = useRef<TreemapLayout | null>(null);
  const hold = useRef(NO_HOLD);
  const pressedOn = useRef<TreemapLayout | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((next: TreemapLayout | null) => {
    waiting.current = null;
    shown.current = next;
    setLayout(next);
  }, []);

  // Shows the layout waiting once the hold lets go, or comes back when it will.
  const settle = useCallback(() => {
    clearTimeout(timer.current);
    const next = waiting.current;
    if (!next) return;
    const now = performance.now();
    const until = heldUntil(hold.current, now);
    if (until === null) show(next);
    else timer.current = setTimeout(settle, until - now);
  }, [show]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Before the browser paints, so the map never shows a folder with another's blocks.
  useLayoutEffect(() => {
    if (width < 2 || height < 2) {
      show(null);
      return;
    }
    const before = shown.current;
    const order =
      steady && before?.root.path === root.path
        ? siblingOrder(before)
        : undefined;
    const next = layoutTreemap(root, width, height, kinds, order);
    const holding = heldUntil(hold.current, performance.now()) !== null;
    const step = steady ? nextStep(before, next, holding) : "show";
    if (step === "show") {
      show(next);
    } else if (step === "wait") {
      waiting.current = next;
      settle();
    } else {
      // The newest map draws what's shown, so whatever waited is out of date.
      waiting.current = null;
    }
  }, [root, width, height, kinds, steady, show, settle]);

  const report = useCallback(
    (event: HoldEvent) => {
      hold.current = holdAfter(hold.current, event, performance.now());
      settle();
    },
    [settle],
  );

  return {
    layout,
    press: useCallback(
      (clicks: number) => {
        // A double-click's second press keeps what its first was aimed at.
        if (clicks < 2 || !clicking(hold.current, performance.now())) {
          pressedOn.current = shown.current;
        }
        report({ type: "press" });
      },
      [report],
    ),
    release: useCallback(
      () => report({ type: "release", doubleClick }),
      [report, doubleClick],
    ),
    menu: useCallback(() => report({ type: "menu" }), [report]),
    cardShown: useCallback(
      (open: boolean) => report({ type: "card", open }),
      [report],
    ),
    clicked: useCallback(() => {
      const pressed = pressedOn.current;
      const onScreen = shown.current;
      return pressed &&
        pressed.root.path === onScreen?.root.path &&
        clicking(hold.current, performance.now())
        ? pressed
        : onScreen;
    }, []),
  };
}
