import type { ComponentRef, RefObject } from 'react';
import type { ScrollView, View } from 'react-native';

// Native placement continues through the body's and footer's onLayout handlers.
export function useFooterResize(
  _scroll: RefObject<ComponentRef<typeof ScrollView> | null>,
  _footer: RefObject<ComponentRef<typeof View> | null>,
  _enabled: boolean,
  _inFlow: boolean,
  _onResize: (bodyHeight: number, footerHeight: number) => void,
): void {}
