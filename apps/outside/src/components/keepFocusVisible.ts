import { Platform } from 'react-native';
import { space } from '../theme/theme';

// Leave room for the focused control and its outline inside the scroll viewport,
// without moving focus or scrolling outer ancestors.
export function keepFocusVisible(container: unknown): void {
  if (Platform.OS !== 'web' || typeof HTMLElement === 'undefined' || !(container instanceof HTMLElement))
    return;
  const target = document.activeElement;
  if (
    !(target instanceof HTMLElement) ||
    target === container ||
    !container.contains(target) ||
    target.closest('[inert], [aria-hidden="true"]')
  )
    return;
  const viewport = container.getBoundingClientRect();
  const bounds = target.getBoundingClientRect();
  const top = Math.max(0, viewport.top) + space.tight;
  const bottom = Math.min(window.innerHeight, viewport.bottom) - space.tight;
  if (bottom <= top) return;
  const offset =
    bounds.height > bottom - top || bounds.top < top
      ? bounds.top - top
      : bounds.bottom > bottom
        ? bounds.bottom - bottom
        : 0;
  if (offset !== 0) container.scrollTop += offset;
}

export function keepFocusVisibleOnFocus(container: unknown): void {
  // A pointer press must keep its target still until release.
  if (
    Platform.OS === 'web' &&
    typeof document !== 'undefined' &&
    document.activeElement?.matches(':focus-visible:not(:active)')
  )
    keepFocusVisible(container);
}

export function keepFocusVisibleOnKey(
  container: unknown,
  event: Readonly<{ key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }>,
): void {
  if (
    Platform.OS !== 'web' ||
    typeof document === 'undefined' ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return;
  const target = document.activeElement;
  if (!target || target.matches(':disabled, [aria-disabled="true"]')) return;
  const button = target.matches('button, [role="button"]');
  const radio = target.getAttribute('role') === 'radio';
  const activation = (button || radio) && (event.key === 'Enter' || event.key === ' ');
  const radioNavigation =
    radio && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key);
  // Correct activation before controls consume their keys; leave ordinary scrolling alone.
  if (activation || radioNavigation) keepFocusVisible(container);
}
