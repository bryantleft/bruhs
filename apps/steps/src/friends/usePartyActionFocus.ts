import {
  type ComponentRef,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Platform, type View } from 'react-native';
import { keepFocusVisible } from '../components/keepFocusVisible';
import { byLabel, PARTY_LABEL } from '../components/party/labels';

type PreferredTarget = (container: HTMLElement) => HTMLElement | null;
type PendingAction = {
  container: HTMLElement;
  opener: Element | null;
  preferred?: PreferredTarget;
  whilePending?: PreferredTarget;
  success: boolean | null;
};

function activationKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

// Resolve focus after the enabled/replacement control commits and the original
// activation is released. Focus or scrolling elsewhere cancels that handoff.
export function usePartyActionFocus(
  root: RefObject<ComponentRef<typeof View> | null>,
  busy: boolean,
): (
  action: () => Promise<boolean>,
  preferred?: PreferredTarget,
  whilePending?: PreferredTarget,
) => Promise<void> {
  const pending = useRef<PendingAction | null>(null);
  const held = useRef(new Set<string>());
  const blocked = useRef(new Set<string>());
  const frame = useRef<number | null>(null);
  const restoring = useRef(false);
  const mounted = useRef(true);
  const working = useRef(busy);
  working.current = busy;
  const [, renderResult] = useState(0);
  const visibleFocus = useRef<{
    target: HTMLElement;
    viewport: HTMLElement;
    contentTop: number;
    height: number;
  } | null>(null);

  const recordVisibleFocus = useCallback((): void => {
    if (Platform.OS !== 'web' || typeof HTMLElement === 'undefined') return;
    const container = root.current;
    const target = document.activeElement;
    if (
      !(container instanceof HTMLElement) ||
      !(target instanceof HTMLElement) ||
      !container.contains(target) ||
      !target.matches(':focus-visible:not(:active)') ||
      target.closest('[inert], [aria-hidden="true"]')
    ) {
      visibleFocus.current = null;
      return;
    }
    const viewport = target.closest<HTMLElement>('[data-focus-content]');
    if (!viewport) return;
    const bounds = target.getBoundingClientRect();
    const port = viewport.getBoundingClientRect();
    // Content coordinates also account for the browser scrolling a newly focused control.
    visibleFocus.current = {
      target,
      viewport,
      contentTop: bounds.top - port.top + viewport.scrollTop,
      height: bounds.height,
    };
  }, [root]);

  const maintainVisibleFocus = useCallback((): void => {
    const previous = visibleFocus.current;
    if (!previous || Platform.OS !== 'web') return;
    const { target, viewport } = previous;
    if (!target.isConnected) {
      const container = root.current;
      if (
        !pending.current &&
        document.activeElement === document.body &&
        container instanceof HTMLElement &&
        !container.closest('[inert], [aria-hidden="true"]')
      ) {
        // A read can remove Cancel without a button action. Restore the heading
        // after any confirmed cleanup finishes, subject to the same input guards.
        pending.current = { container, opener: target, success: true };
      }
      visibleFocus.current = null;
      return;
    }
    if (document.activeElement !== target || target.closest('[inert], [aria-hidden="true"]')) {
      visibleFocus.current = null;
      return;
    }
    if (!target.matches(':focus-visible:not(:active)')) return;
    const port = viewport.getBoundingClientRect();
    const bounds = target.getBoundingClientRect();
    const previousTop = port.top + previous.contentTop - viewport.scrollTop;
    const wasVisible =
      previousTop >= Math.max(0, port.top) &&
      previousTop + previous.height <= Math.min(window.innerHeight, port.bottom);
    visibleFocus.current = {
      target,
      viewport,
      contentTop: bounds.top - port.top + viewport.scrollTop,
      height: bounds.height,
    };
    if (wasVisible) keepFocusVisible(viewport);
  }, [root]);

  const cancel = useCallback((): void => {
    pending.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const restore = useCallback((): void => {
    const work = pending.current;
    if (!work || held.current.size || (work.success !== null && working.current)) return;
    const { container, opener, preferred, success, whilePending } = work;
    if (!container.isConnected || container.closest('[inert], [aria-hidden="true"]')) {
      cancel();
      return;
    }
    const heading = container.querySelector<HTMLElement>('[role="heading"][aria-level="1"]');
    const target =
      success === null
        ? whilePending?.(container)
        : success
          ? (preferred?.(container) ?? heading)
          : opener instanceof HTMLElement && opener.isConnected
            ? opener
            : (byLabel(container, PARTY_LABEL.tryAgain) ?? heading);
    if (!target || target.matches(':disabled, [aria-disabled="true"]') || target.closest('[inert]')) return;
    if (success === null && document.activeElement === target) return;
    if (document.activeElement !== document.body) {
      cancel();
      return;
    }
    // Keep inputs and buttons in their existing tab order; headings/rows need only programmatic focus.
    if (!target.matches('button, input, select, textarea, a[href], [tabindex]')) target.tabIndex = -1;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    restoring.current = true;
    target.focus({ preventScroll: true });
    restoring.current = false;
    keepFocusVisible(target.closest('[data-focus-content]'));
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pending.current !== work) return;
      // A removed pressed control's default action can finish after the first handoff.
      if (target.isConnected && document.activeElement === document.body) {
        restoring.current = true;
        target.focus({ preventScroll: true });
        restoring.current = false;
        keepFocusVisible(target.closest('[data-focus-content]'));
      }
      if (success !== null) pending.current = null;
    });
  }, [cancel]);

  useLayoutEffect(() => {
    if (Platform.OS === 'web') {
      maintainVisibleFocus();
      restore();
    }
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    mounted.current = true;
    const onKeyDown = (event: KeyboardEvent): void => {
      const container = root.current;
      if (!(container instanceof HTMLElement) || container.closest('[inert]')) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (['Tab', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
        visibleFocus.current = null;
        cancel();
      } else recordVisibleFocus();
      if (!activationKey(event.key)) return;
      if (blocked.current.has(event.key)) {
        event.preventDefault();
        event.stopPropagation();
      } else if (event.target instanceof Node && container.contains(event.target))
        held.current.add(event.key);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (!activationKey(event.key)) return;
      held.current.delete(event.key);
      // Let RNW's document keyup listener clean up its press responder.
      if (blocked.current.delete(event.key)) event.preventDefault();
      if (pending.current && frame.current === null) {
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          restore();
        });
      }
    };
    const onFocus = (): void => {
      if (!restoring.current) cancel();
      recordVisibleFocus();
    };
    const interrupt = (): void => {
      visibleFocus.current = null;
      cancel();
    };
    const onBlur = (): void => {
      held.current.clear();
      blocked.current.clear();
      interrupt();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('focusin', onFocus, true);
    window.addEventListener('wheel', interrupt, { capture: true, passive: true });
    window.addEventListener('touchstart', interrupt, { capture: true, passive: true });
    window.addEventListener('pointerdown', interrupt, true);
    window.addEventListener('popstate', interrupt);
    window.addEventListener('blur', onBlur);
    return () => {
      mounted.current = false;
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('focusin', onFocus, true);
      window.removeEventListener('wheel', interrupt, true);
      window.removeEventListener('touchstart', interrupt, true);
      window.removeEventListener('pointerdown', interrupt, true);
      window.removeEventListener('popstate', interrupt);
      window.removeEventListener('blur', onBlur);
      held.current.clear();
      blocked.current.clear();
      interrupt();
    };
  }, [cancel, recordVisibleFocus, restore, root]);

  return async (action, preferred, whilePending): Promise<void> => {
    const container = root.current;
    if (Platform.OS !== 'web' || !(container instanceof HTMLElement)) {
      await action();
      return;
    }
    cancel();
    const work: PendingAction = {
      container,
      opener: document.activeElement,
      preferred,
      whilePending,
      success: null,
    };
    pending.current = work;
    for (const key of held.current) blocked.current.add(key);
    try {
      work.success = await action();
      if (mounted.current && pending.current === work) renderResult((value) => value + 1);
    } catch (error) {
      if (pending.current === work) cancel();
      throw error;
    }
  };
}
