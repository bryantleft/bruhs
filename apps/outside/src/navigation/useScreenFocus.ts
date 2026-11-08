import { router, useIsFocused, useLocalSearchParams, usePathname } from 'expo-router';
import {
  type ComponentPropsWithRef,
  type ComponentRef,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from 'react';
import { Platform, type Pressable, type View } from 'react-native';
import { keepFocusVisible, keepFocusVisibleOnFocus } from '../components/keepFocusVisible';

type DetailRoute = '/explore' | '/health' | '/party';
type ScreenLinkRoute = DetailRoute;
type ScreenLinkOwner = Readonly<{ openerId: string; sourcePath: string }>;

// Hidden HUD copies must not claim another control's return. Keep ownership
// within one browser document, without storing elements or changing game saves.
const screenLinkOwners = new WeakMap<Document, Map<ScreenLinkRoute, ScreenLinkOwner>>();

// The first screen of a page load keeps the browser's own starting point: the title is already
// first in reading order, and focusing it before any input would paint a stray focus ring.
const enteredDocuments = new WeakSet<Document>();

function focusFromBody(target: HTMLElement, reveal: 'title' | 'opener'): void {
  if (
    !target.isConnected ||
    target.matches(':disabled, [aria-disabled="true"]') ||
    target.closest('[inert], [aria-hidden="true"]')
  )
    return;
  const active = document.activeElement;
  // Browser history can leave the outgoing element focused until its inert state takes effect.
  if (active instanceof HTMLElement && active.closest('[inert], [aria-hidden="true"]')) active.blur();
  if (document.activeElement !== document.body) return;
  target.focus({ preventScroll: true });
  const container = target.closest('[data-focus-content]');
  if (!(container instanceof HTMLElement)) return;
  const box = target.getBoundingClientRect();
  const port = container.getBoundingClientRect();
  const outside = box.bottom <= Math.max(0, port.top) || box.top >= Math.min(window.innerHeight, port.bottom);
  if (reveal === 'title' || outside) keepFocusVisible(container);
  else keepFocusVisibleOnFocus(container);
}

export function useScreenLink(
  href: ScreenLinkRoute,
  params?: Readonly<Record<string, string>>,
): Readonly<{
  buttonRef: RefObject<ComponentRef<typeof Pressable> | null>;
  open: () => void;
  onKeyDownCapture: ComponentPropsWithRef<typeof Pressable>['onKeyDownCapture'];
}> {
  const focused = useIsFocused();
  const pathname = usePathname();
  const openerId = useId();
  const sourcePath = useRef(pathname);
  const { returnFrom } = useLocalSearchParams<{ returnFrom?: string | string[] }>();
  const buttonRef = useRef<ComponentRef<typeof Pressable>>(null);
  const returning = useRef(false);
  const returningToTab = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const owner = screenLinkOwners.get(document)?.get(href);
    if (!focused) {
      if (pathname === href) {
        returning.current = owner?.openerId === openerId;
        returningToTab.current = owner !== undefined && owner.sourcePath !== sourcePath.current;
      } else if (pathname !== sourcePath.current) {
        returning.current = false;
        returningToTab.current = false;
      }
    } else {
      sourcePath.current = pathname;
      const needsTab = returningToTab.current && pathname !== href && owner?.sourcePath !== pathname;
      returningToTab.current = false;
      if (returning.current || returnFrom === href) {
        returning.current = false;
        // Direct entry has no mounted opener. Consume its fallback handoff once.
        if (returnFrom === href) router.setParams({ returnFrom: undefined });
        const target = buttonRef.current;
        if (target instanceof HTMLElement) focusFromBody(target, 'opener');
      } else if (needsTab) {
        // Tab history can return home instead of to the original opener's route.
        // Let page-heading handoffs run on routes that have their own heading.
        const tab = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
        const panelId = tab?.getAttribute('aria-controls');
        const panel = panelId ? document.getElementById(panelId) : null;
        if (tab && panel && !panel.querySelector('[role="heading"][aria-level="1"]'))
          focusFromBody(tab, 'opener');
      }
    }
  }, [focused, href, openerId, pathname, returnFrom]);

  return {
    buttonRef,
    open: () => {
      if (!focused) return;
      sourcePath.current = pathname;
      const target = buttonRef.current;
      if (Platform.OS === 'web') {
        let owners = screenLinkOwners.get(document);
        if (!owners) {
          owners = new Map();
          screenLinkOwners.set(document, owners);
        }
        owners.set(href, { openerId, sourcePath: pathname });
        if (target instanceof HTMLElement) {
          const active = document.activeElement;
          const panel = target.closest('[role="tabpanel"]');
          if (active instanceof HTMLElement && (active === target || panel?.contains(active))) active.blur();
        }
      }
      router.push(params ? { pathname: href, params } : href);
    },
    onKeyDownCapture:
      Platform.OS === 'web'
        ? (event) => {
            const { key, repeat, altKey, ctrlKey, metaKey } = event.nativeEvent;
            // Returning to the opener must not repeat the navigation key still held on Back.
            if (!altKey && !ctrlKey && !metaKey && repeat && (key === 'Enter' || key === ' ')) {
              event.preventDefault();
              event.stopPropagation();
            }
          }
        : undefined,
  };
}

type ScreenFocusOptions = Readonly<{ focusOnEntry?: boolean; returnToTab?: boolean }>;

export function useScreenFocus({
  focusOnEntry = true,
  returnToTab = false,
}: ScreenFocusOptions = {}): RefObject<ComponentRef<typeof View> | null> {
  const root = useRef<ComponentRef<typeof View>>(null);
  const focused = useIsFocused();
  const pathname = usePathname();
  const initialPath = useRef(pathname);
  const navigated = useRef(false);
  const pending = useRef(true);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (pathname !== initialPath.current) navigated.current = true;
    if (!focused) {
      pending.current = true;
      return;
    }
    if (!pending.current || !(root.current instanceof HTMLElement)) return;
    pending.current = false;
    // A specific destination owns this entry even after its request is consumed.
    const initialLoad = !enteredDocuments.has(document);
    enteredDocuments.add(document);
    if (!focusOnEntry || initialLoad) return;
    const heading = root.current.querySelector<HTMLElement>('[role="heading"][aria-level="1"]');
    if (heading) {
      heading.tabIndex = -1;
      focusFromBody(heading, 'title');
    } else if (
      returnToTab &&
      navigated.current &&
      root.current.isConnected &&
      !root.current.closest('[inert], [aria-hidden="true"]')
    ) {
      // A screen without a heading can return to its tab after navigation.
      // Preserve the initial page and let actual opener handoffs run first.
      const tab = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (tab?.getAttribute('aria-controls') === root.current.id) focusFromBody(tab, 'opener');
    }
  }, [focusOnEntry, focused, pathname, returnToTab]);
  return root;
}

export function backToAdventure(href: DetailRoute): void {
  if (Platform.OS === 'web' && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  if (router.canGoBack()) router.back();
  else {
    router.replace(Platform.OS === 'web' ? { pathname: '/you', params: { returnFrom: href } } : '/you');
  }
}
