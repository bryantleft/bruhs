import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from 'expo-router/js-tabs';
import { PlatformPressable, useLinkBuilder } from 'expo-router/react-navigation';
import { useContext, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { adventureTab, panelId, tabId } from '../navigation/tabs';
import { UI_ART } from '../pixel/art';
import { bevel } from '../pixel/chrome';
import { Sprite } from '../pixel/Sprite';
import { color, font, layout, shadow, space } from '../theme/theme';

export function AdventureTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets,
}: BottomTabBarProps): React.JSX.Element {
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const { buildHref } = useLinkBuilder();
  const buttons = useRef<Record<string, HTMLElement | null>>({});
  const [focused, setFocused] = useState<string | null>(null);

  function activate(index: number, moveFocus = false): void {
    const route = state.routes[index];
    if (!route) return;
    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (event.defaultPrevented) return;
    if (index !== state.index) navigateToTab(route.key);
    if (moveFocus) buttons.current[route.key]?.focus({ preventScroll: true });
  }

  return (
    <View
      onLayout={(event) => {
        const height = event.nativeEvent.layout.height;
        if (height > 0) onHeightChange?.(height);
      }}
      style={[
        styles.bar,
        {
          minHeight: layout.navigation + insets.bottom,
          paddingBottom: space.tight + insets.bottom,
          paddingLeft: space.tight + insets.left,
          paddingRight: space.tight + insets.right,
        },
      ]}
    >
      <View role="tablist" accessibilityLabel="Game navigation" style={styles.tabs}>
        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options;
          const label = typeof options?.title === 'string' ? options.title : route.name;
          const selected = index === state.index;
          const art = UI_ART[adventureTab(route.name)?.art ?? 'world'];
          const webProps =
            Platform.OS === 'web'
              ? {
                  id: tabId(route.name),
                  'aria-controls': panelId(route.name),
                  dataSet: { insetFocus: 'true' },
                }
              : {};
          return (
            <PlatformPressable
              {...webProps}
              key={route.key}
              ref={(element) => {
                buttons.current[route.key] =
                  typeof HTMLElement !== 'undefined' && element instanceof HTMLElement ? element : null;
              }}
              href={buildHref(route.name, route.params)}
              role={Platform.OS === 'ios' ? 'button' : 'tab'}
              accessibilityLabel={options?.tabBarAccessibilityLabel ?? label}
              accessibilityState={{ selected }}
              aria-selected={selected}
              accessibilityLargeContentTitle={label}
              accessibilityShowsLargeContentViewer
              tabIndex={Platform.OS === 'web' ? (selected ? 0 : -1) : undefined}
              onPress={() => activate(index)}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              onFocus={() => setFocused(route.key)}
              onBlur={() => setFocused(null)}
              onKeyDown={
                Platform.OS === 'web'
                  ? (event) => {
                      if (event.nativeEvent.altKey || event.nativeEvent.ctrlKey || event.nativeEvent.metaKey)
                        return;
                      const count = state.routes.length;
                      const next =
                        event.nativeEvent.key === 'ArrowRight'
                          ? (index + 1) % count
                          : event.nativeEvent.key === 'ArrowLeft'
                            ? (index - 1 + count) % count
                            : event.nativeEvent.key === 'Home'
                              ? 0
                              : event.nativeEvent.key === 'End'
                                ? count - 1
                                : event.nativeEvent.key === ' '
                                  ? index
                                  : null;
                      if (next === null) return;
                      event.preventDefault();
                      activate(next, true);
                    }
                  : undefined
              }
              pressOpacity={1}
              style={[
                styles.tab,
                bevel(selected ? 'gold' : 'panel', selected),
                focused === route.key && styles.focused,
              ]}
            >
              <Sprite art={art} size={24} />
              <Text
                numberOfLines={1}
                style={[styles.label, { color: selected ? color.text : color.secondary }]}
              >
                {label}
              </Text>
            </PlatformPressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexShrink: 0,
    paddingTop: space.tight,
    borderTopWidth: layout.border,
    borderTopColor: color.ink,
    backgroundColor: color.well,
  },
  tabs: { flexDirection: 'row', gap: space.micro },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: layout.touch + 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: space.micro,
  },
  label: { fontFamily: font.label, fontSize: 10, lineHeight: 13, ...shadow },
  focused: { outlineWidth: 2, outlineColor: color.gold, outlineStyle: 'solid', outlineOffset: 2 },
});
