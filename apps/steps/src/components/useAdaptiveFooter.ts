import {
  type ComponentRef,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { type LayoutChangeEvent, Platform, type ScrollView, type View } from 'react-native';
import { layout } from '../theme/theme';
import { keepFocusVisible } from './keepFocusVisible';
import { useFooterResize } from './useFooterResize';

const controls = 'button, a[href], [role="button"], [tabindex]';
// Keep room for several readable controls instead of docking over the adventure.
const minimumContentHeight = layout.touch * 4;

function focusedFooterControl(footer: unknown): number | null {
  if (Platform.OS !== 'web' || typeof HTMLElement === 'undefined' || !(footer instanceof HTMLElement))
    return null;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !footer.contains(active)) return null;
  const index = Array.from(footer.querySelectorAll(controls)).indexOf(active);
  return index < 0 ? null : index;
}

export function useAdaptiveFooter(
  scroll: RefObject<ComponentRef<typeof ScrollView> | null>,
  canRestoreFocus: boolean,
  pauseReflow = false,
): Readonly<{
  footerInFlow: boolean;
  footerRef: RefObject<ComponentRef<typeof View> | null>;
  onBodyLayout: (event: LayoutChangeEvent) => void;
  onFooterLayout: (event: LayoutChangeEvent) => void;
}> {
  const footerRef = useRef<ComponentRef<typeof View>>(null);
  const sizes = useRef({ body: 0, footer: 0 });
  const desiredFlow = useRef(false);
  const reflowPaused = useRef(pauseReflow);
  const restoreIndex = useRef<number | null>(null);
  const [footerInFlow, setFooterInFlow] = useState(false);

  const updateFlow = useCallback(() => {
    const { body, footer } = sizes.current;
    const next = body > 0 && footer > 0 && body - footer < minimumContentHeight;
    if (next === desiredFlow.current) return;
    restoreIndex.current = focusedFooterControl(footerRef.current);
    desiredFlow.current = next;
    setFooterInFlow(next);
  }, []);

  const measure = useCallback(
    (part: 'body' | 'footer', height: number) => {
      // Retained hidden screens report zero sizes; keep their last usable footer placement.
      if (!canRestoreFocus && height === 0) return;
      sizes.current[part] = height;
      if (!pauseReflow && !reflowPaused.current) updateFlow();
    },
    [canRestoreFocus, pauseReflow, updateFlow],
  );

  useLayoutEffect(() => {
    if (pauseReflow) reflowPaused.current = true;
  }, [pauseReflow]);

  const resize = useCallback(
    (body: number, footer: number) => {
      sizes.current = { body, footer };
      if (!reflowPaused.current) updateFlow();
    },
    [updateFlow],
  );
  useFooterResize(scroll, footerRef, canRestoreFocus && !pauseReflow, footerInFlow, resize);

  useEffect(() => {
    if (pauseReflow) return;
    // Modal opener restoration runs during passive unmount cleanup. Keep its
    // footer mounted until that completes, then move it with the existing focus guard.
    reflowPaused.current = false;
    updateFlow();
  }, [pauseReflow, updateFlow]);

  useLayoutEffect(() => {
    const index = restoreIndex.current;
    restoreIndex.current = null;
    if (
      index === null ||
      !canRestoreFocus ||
      Platform.OS !== 'web' ||
      typeof HTMLElement === 'undefined' ||
      !(footerRef.current instanceof HTMLElement)
    )
      return;
    const active = document.activeElement;
    if (active !== document.body && active?.isConnected && !footerRef.current.contains(active)) return;
    const target = footerRef.current.querySelectorAll<HTMLElement>(controls)[index];
    if (!(target instanceof HTMLElement) || target.matches(':disabled, [aria-disabled="true"]')) return;
    if (target.closest('[inert], [aria-hidden="true"]')) return;
    target.focus({ preventScroll: true });
    if (footerInFlow) keepFocusVisible(scroll.current?.getNativeScrollRef());
  }, [canRestoreFocus, footerInFlow, scroll]);

  const onBodyLayout = useCallback(
    (event: LayoutChangeEvent) => measure('body', event.nativeEvent.layout.height),
    [measure],
  );
  const onFooterLayout = useCallback(
    (event: LayoutChangeEvent) => measure('footer', event.nativeEvent.layout.height),
    [measure],
  );
  return { footerInFlow, footerRef, onBodyLayout, onFooterLayout };
}
