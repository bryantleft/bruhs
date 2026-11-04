import {
  type ComponentProps,
  type ComponentRef,
  type RefCallback,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import { Platform, type Pressable, type ScrollView } from 'react-native';
import { keepFocusVisible, keepFocusVisibleOnFocus, keepFocusVisibleOnKey } from './keepFocusVisible';

type KeyHandler = NonNullable<ComponentProps<typeof ScrollView>['onKeyDownCapture']>;

function activationKey(key: string): string | null {
  return key === 'Enter' ? key : key === ' ' || key === 'Spacebar' ? ' ' : null;
}

// A load attempt removes its focused Retry button. Restore usable focus after
// it settles, without carrying that press into the new screen or retry button.
export function useProgressRecoveryFocus(status: 'loading' | 'ready' | 'error') {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const retry = useRef<HTMLElement | null>(null);
  const currentStatus = useRef(status);
  const pending = useRef<string | null>(null);
  const held = useRef(new Map<string, { preventDefault: () => void }>());
  const blocked = useRef(new Set<string>());
  const frame = useRef<number | null>(null);
  const observer = useRef<MutationObserver | null>(null);

  const cancelRepair = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    observer.current?.disconnect();
    observer.current = null;
  }, []);

  const restore = useCallback(() => {
    if (pending.current === null || currentStatus.current === 'loading') return;
    if (pending.current !== window.location.href) {
      pending.current = null;
      cancelRepair();
      return;
    }
    if (document.activeElement !== document.body && document.activeElement?.isConnected) {
      pending.current = null;
      cancelRepair();
      return;
    }
    const target =
      currentStatus.current === 'error'
        ? retry.current
        : Array.from(
            document.querySelectorAll<HTMLElement>(
              '[data-focus-content="true"] button, [data-focus-content="true"] [role="button"]',
            ),
          ).find((node) => {
            const bounds = node.getBoundingClientRect();
            return (
              !node.matches(':disabled, [aria-disabled="true"]') &&
              !node.closest('[inert], [aria-hidden="true"]') &&
              bounds.width > 0 &&
              bounds.height > 0 &&
              bounds.bottom > 0 &&
              bounds.top < window.innerHeight
            );
          });
    if (!target?.isConnected || target.matches(':disabled, [aria-disabled="true"]')) return;
    pending.current = null;
    cancelRepair();
    const container =
      currentStatus.current === 'error'
        ? scroll.current?.getNativeScrollRef()
        : target.closest('[data-focus-content]');
    target.focus({ preventScroll: true });
    keepFocusVisible(container);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (target.isConnected && document.activeElement === document.body) {
        target.focus({ preventScroll: true });
        keepFocusVisible(container);
      }
    });
  }, [cancelRepair]);

  const prepare = useCallback(() => {
    if (Platform.OS !== 'web' || retry.current !== document.activeElement) return;
    pending.current = window.location.href;
    for (const [key, event] of held.current) {
      blocked.current.add(key);
      event.preventDefault();
    }
  }, []);

  const retryRef = useCallback<RefCallback<ComponentRef<typeof Pressable>>>(
    (node) => {
      if (Platform.OS !== 'web' || typeof HTMLElement === 'undefined') return;
      if (node instanceof HTMLElement) {
        retry.current = node;
        restore();
      } else {
        prepare();
        retry.current = null;
      }
    },
    [prepare, restore],
  );

  const onLayout = useCallback(() => {
    if (Platform.OS !== 'web') return;
    restore();
    keepFocusVisibleOnFocus(scroll.current?.getNativeScrollRef());
  }, [restore]);

  useLayoutEffect(() => {
    currentStatus.current = status;
    if (Platform.OS !== 'web') return;
    restore();
    if (pending.current !== null && status !== 'loading') {
      cancelRepair();
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        restore();
      });
    }
    // The navigator can mount its first screen after this parent commits.
    // Stop observing after recovery or intervening input, focus or navigation.
    if (pending.current !== null && status === 'ready') {
      observer.current = new MutationObserver(restore);
      observer.current.observe(document.getElementById('root') ?? document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['inert', 'aria-hidden', 'style', 'class'],
      });
    }
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const cancel = () => {
      pending.current = null;
      cancelRepair();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        cancel();
        return;
      }
      const key = activationKey(event.key);
      if (key === null) cancel();
      if (key !== null && blocked.current.has(key)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = activationKey(event.key);
      if (key === null) return;
      held.current.delete(key);
      if (blocked.current.delete(key)) event.preventDefault();
    };
    const onBlur = () => {
      held.current.clear();
      blocked.current.clear();
      cancel();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    const onFocus = (event: FocusEvent) => {
      if (event.target !== document.body) cancel();
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('pointerdown', cancel);
    document.addEventListener('wheel', cancel, { passive: true });
    document.addEventListener('touchmove', cancel, { passive: true });
    window.addEventListener('popstate', cancel);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('pointerdown', cancel);
      document.removeEventListener('wheel', cancel);
      document.removeEventListener('touchmove', cancel);
      window.removeEventListener('popstate', cancel);
      window.removeEventListener('blur', onBlur);
      cancelRepair();
    };
  }, [cancelRepair]);

  const onKeyDownCapture = useCallback<KeyHandler>((event) => {
    const native = event.nativeEvent;
    keepFocusVisibleOnKey(scroll.current?.getNativeScrollRef(), native);
    if (native.altKey || native.ctrlKey || native.metaKey) return;
    const key = activationKey(native.key);
    if (key !== null) held.current.set(key, event);
  }, []);

  return {
    scroll,
    retryRef,
    prepare,
    onLayout,
    onKeyDownCapture: Platform.OS === 'web' ? onKeyDownCapture : undefined,
  };
}
