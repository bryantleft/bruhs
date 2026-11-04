import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useGame } from '../game/GameProvider';
import { useScreenLink } from '../navigation/useScreenFocus';
import { color, radius, space } from '../theme/theme';
import { Icon } from './Icon';
import { keepFocusVisibleOnFocus } from './keepFocusVisible';
import { Copy } from './ui';

export function HealthSummary(): React.JSX.Element {
  const { demo, tracking } = useGame();
  const healthLink = useScreenLink('/health');
  const [captionWidth, setCaptionWidth] = useState(0);
  const [copyWidth, setCopyWidth] = useState(0);
  // Keep the caption beside the icon while it can use roughly two lines.
  const stacked = copyWidth > 0 && captionWidth > copyWidth * 2;
  const caption = demo
    ? 'phone app needed'
    : tracking.status === 'ready'
      ? 'read-only steps'
      : tracking.status === 'paused'
        ? 'step sync paused'
        : tracking.status === 'no-data'
          ? 'no step data'
          : 'connect steps';
  const keepCardVisible = (): void => {
    const target = healthLink.buttonRef.current;
    if (Platform.OS === 'web' && target instanceof HTMLElement && document.activeElement === target)
      keepFocusVisibleOnFocus(target.closest('[data-focus-content]'));
  };
  return (
    <View>
      <ScrollView
        horizontal
        aria-hidden
        accessible={false}
        focusable={false}
        pointerEvents="none"
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={styles.measurement}
      >
        <Copy
          aria-hidden
          accessible={false}
          variant="label"
          style={styles.measurementText}
          onLayout={({ nativeEvent }) => {
            const width = nativeEvent.layout.width;
            if (width > 0) setCaptionWidth(width);
          }}
        >
          {caption}
        </Copy>
      </ScrollView>
      <Pressable
        ref={healthLink.buttonRef}
        accessibilityRole="button"
        accessibilityLabel="Manage health connections and step access"
        onPress={healthLink.open}
        onKeyDownCapture={healthLink.onKeyDownCapture}
        onLayout={keepCardVisible}
        style={({ pressed }) => [styles.card, pressed && { backgroundColor: color.raised }]}
      >
        <View style={styles.row}>
          <View style={styles.icon}>
            <Icon name="health" tint={color.success} />
          </View>
          <View
            style={styles.copy}
            onLayout={({ nativeEvent }) => {
              const width = nativeEvent.layout.width;
              if (width > 0) setCopyWidth(width);
            }}
          >
            <Copy style={styles.title}>health</Copy>
            {stacked ? null : <Copy variant="label">{caption}</Copy>}
          </View>
          <Icon name="arrow" tint={color.secondary} />
        </View>
        {stacked ? <Copy variant="label">{caption}</Copy> : null}
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  measurement: { position: 'absolute', top: 0, left: 0, right: 0, height: 0 },
  measurementText: { flexShrink: 0 },
  card: {
    padding: space.group,
    minHeight: 80,
    backgroundColor: color.panel,
    borderColor: color.border,
    borderWidth: 1,
    borderRadius: radius.lychee,
    justifyContent: 'center',
    gap: space.tight,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.related },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.lychee,
    backgroundColor: `${color.success}0c`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copy: { flex: 1, gap: space.micro },
  title: { color: color.text, fontSize: 14, lineHeight: 22 },
});
