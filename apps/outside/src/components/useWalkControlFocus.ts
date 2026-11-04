import {
  type ComponentProps,
  type ComponentRef,
  type RefCallback,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { Platform, type Pressable, type View } from 'react-native';
import { keepFocusVisible, keepFocusVisibleOnFocus } from './keepFocusVisible';

const actions = [
  'reload',
  'start',
  'resume',
  'cancel',
  'pause',
  'finish',
  'settings',
  'retry',
  'delete',
] as const;
type WalkAction = (typeof actions)[number];
type ButtonRef = RefCallback<ComponentRef<typeof Pressable>>;
type KeyHandler = NonNullable<ComponentProps<typeof View>['onKeyDownCapture']>;

function activationKey(key: string): string | null {
  return key === 'Enter' ? key : key === ' ' || key === 'Spacebar' ? ' ' : null;
}

// Each action has its own keyed button. Transfer focus only when that focused
// action disappears, and keep a held activation from reaching its replacement.
export function useWalkControlFocus(
  primary: WalkAction,
  saving: boolean,
  root: RefObject<ComponentRef<typeof View> | null>,
): Readonly<{
  buttonRefs: Readonly<Record<WalkAction, ButtonRef>>;
  onKeyDownCapture: KeyHandler | undefined;
  onLayout: () => void;
}> {
  const nodes = useRef(new Map<WalkAction, HTMLElement>());
  const pending = useRef<WalkAction | null>(null);
  const held = useRef(new Map<string, { preventDefault: () => void }>());
  const blocked = useRef(new Set<string>());
  const interrupted = useRef(new Set<string>());
  const frame = useRef<number | null>(null);

  const cancelRepair = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const restore = useCallback(
    (action: WalkAction) => {
      if (pending.current === null) return;
      const active = document.activeElement;
      if (active !== document.body && active?.isConnected) {
        pending.current = null;
        return;
      }
      const target = nodes.current.get(action);
      if (
        !target?.isConnected ||
        target.matches(':disabled, [aria-disabled="true"]') ||
        target.closest('[inert], [aria-hidden="true"]')
      )
        return;
      pending.current = null;
      cancelRepair();
      target.focus({ preventScroll: true });
      keepFocusVisible(target.closest('[data-focus-content]'));
      // A removed pressed button can leave BODY focused after the default action.
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (target.isConnected && document.activeElement === document.body) {
          target.focus({ preventScroll: true });
          keepFocusVisible(target.closest('[data-focus-content]'));
        }
      });
    },
    [cancelRepair],
  );

  const buttonRefs = useMemo(
    () =>
      Object.fromEntries(
        actions.map((action) => [
          action,
          (node: ComponentRef<typeof Pressable> | null) => {
            if (Platform.OS !== 'web' || typeof HTMLElement === 'undefined') return;
            const previous = nodes.current.get(action);
            if (node instanceof HTMLElement) {
              nodes.current.set(action, node);
              // Adaptive footer reflow can remount the same logical action.
              if (pending.current === action) restore(action);
            } else {
              if (previous === document.activeElement) {
                pending.current = action;
                for (const [key, event] of held.current) {
                  blocked.current.add(key);
                  event.preventDefault();
                }
              }
              nodes.current.delete(action);
            }
          },
        ]),
      ) as Record<WalkAction, ButtonRef>,
    [restore],
  );

  const onLayout = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const target = document.activeElement;
    if (Array.from(nodes.current.values()).some((node) => node === target))
      keepFocusVisibleOnFocus(target?.closest('[data-focus-content]'));
  }, []);

  useLayoutEffect(() => {
    // Retry temporarily unmounts while saving. Restore it after failure, or the
    // current walk action after success; let deliberate focus changes win.
    if (Platform.OS === 'web' && !(pending.current === 'retry' && saving)) restore(primary);
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Track the physical key even if its modifiers change before handoff.
    // Fresh shortcuts keep their default behavior until a handoff blocks the key.
    const onKeyDown = (event: KeyboardEvent) => {
      const key = activationKey(event.key);
      if (key === null) return;
      // A release can happen outside the document. A fresh press re-arms that key.
      if (!event.repeat && interrupted.current.delete(key)) blocked.current.delete(key);
      const container = root.current;
      if (
        !(container instanceof HTMLElement) ||
        !container.isConnected ||
        container.closest('[inert], [aria-hidden="true"]')
      )
        return;
      const target = event.target;
      if (target !== document.body && !(target instanceof Node && container.contains(target))) return;
      held.current.set(key, event);
      if ((pending.current !== null && target === document.body) || blocked.current.has(key)) {
        blocked.current.add(key);
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = activationKey(event.key);
      if (key === null) return;
      held.current.delete(key);
      interrupted.current.delete(key);
      if (blocked.current.delete(key)) event.preventDefault();
    };
    const onFocus = () => {
      pending.current = null;
      cancelRepair();
    };
    const onBlur = () => {
      // Cancel the old press without allowing its release to activate a new target.
      for (const key of held.current.keys()) blocked.current.add(key);
      for (const key of blocked.current) interrupted.current.add(key);
      held.current.clear();
      pending.current = null;
      cancelRepair();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('focusin', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('blur', onBlur);
      held.current.clear();
      blocked.current.clear();
      interrupted.current.clear();
      cancelRepair();
    };
  }, [cancelRepair, root]);

  const onKeyDownCapture = useCallback<KeyHandler>((event) => {
    const native = event.nativeEvent;
    const key = activationKey(native.key);
    if (key === null) return;
    if (blocked.current.has(key)) {
      event.preventDefault();
      event.stopPropagation();
    } else held.current.set(key, event);
  }, []);

  return { buttonRefs, onKeyDownCapture: Platform.OS === 'web' ? onKeyDownCapture : undefined, onLayout };
}
