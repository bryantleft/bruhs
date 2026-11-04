import { type ComponentRef, type RefObject, useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import type { ScrollView, View } from 'react-native';
import { keepFocusVisibleOnFocus } from './keepFocusVisible';

export function useFooterResize(
  scroll: RefObject<ComponentRef<typeof ScrollView> | null>,
  footerRef: RefObject<ComponentRef<typeof View> | null>,
  enabled: boolean,
  inFlow: boolean,
  onResize: (bodyHeight: number, footerHeight: number) => void,
): void {
  useLayoutEffect(() => {
    if (!enabled || typeof HTMLElement === 'undefined') return;
    const viewport = scroll.current?.getNativeScrollRef();
    if (!(viewport instanceof HTMLElement)) return;
    const body = viewport.parentElement;
    const footer = footerRef.current;
    if (!(body instanceof HTMLElement) || !(footer instanceof HTMLElement)) return;
    let active = true;
    let previous = { width: 0, body: 0, footer: 0 };
    const measure = (synchronous = false) => {
      if (!active || viewport.contains(footer) !== inFlow) return;
      const bounds = body.getBoundingClientRect();
      const footerHeight = footer.getBoundingClientRect().height;
      if (bounds.height <= 0 || footerHeight <= 0) return;
      if (
        bounds.width === previous.width &&
        bounds.height === previous.body &&
        footerHeight === previous.footer
      )
        return;
      previous = { width: bounds.width, body: bounds.height, footer: footerHeight };
      const update = () => onResize(bounds.height, footerHeight);
      if (synchronous) {
        // RN Web defers onLayout. Commit a wrapping footer during resize
        // delivery so it cannot consume the next painted content viewport.
        flushSync(update);
        keepFocusVisibleOnFocus(viewport);
      } else update();
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure(true));
    observer.observe(body);
    observer.observe(footer);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [enabled, footerRef, inFlow, onResize, scroll]);
}
