import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { color, layout, radius, space, typography } from '../../theme/theme';
import { Icon } from '../Icon';
import { Copy } from '../ui';

// The party's sharing consent. On web, Space and Enter toggle once per press, and the box stays
// centred on the first text line as larger text grows it.
export function ConsentCheckbox({
  checked,
  disabled,
  onToggle,
}: Readonly<{ checked: boolean; disabled: boolean; onToggle: () => void }>): React.JSX.Element {
  const [lineHeight, setLineHeight] = useState<number>(typography.small.lineHeight);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      aria-disabled={disabled}
      onKeyDownCapture={
        Platform.OS === 'web'
          ? (event) => {
              const { key, repeat } = event.nativeEvent;
              if (key !== ' ' && key !== 'Enter') return;
              event.preventDefault();
              event.stopPropagation();
              if (!disabled && !repeat) onToggle();
            }
          : undefined
      }
      onKeyUpCapture={
        Platform.OS === 'web'
          ? (event) => {
              if (event.nativeEvent.key === ' ' || event.nativeEvent.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
              }
            }
          : undefined
      }
      accessibilityLabel="Share my name, bruh and daily steps with party members"
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [styles.consent, pressed && { backgroundColor: color.raised }]}
    >
      <View aria-hidden accessible={false} pointerEvents="none" style={styles.measurement}>
        <Copy
          variant="small"
          aria-hidden
          accessible={false}
          onLayout={({ nativeEvent }) => {
            const target = 'target' in nativeEvent ? nativeEvent.target : null;
            const height =
              Platform.OS === 'web' && target instanceof HTMLElement
                ? target.getBoundingClientRect().height
                : nativeEvent.layout.height;
            if (height > 0) setLineHeight(height);
          }}
        >
          M
        </Copy>
      </View>
      <View
        aria-hidden
        style={[
          styles.check,
          // Preserve the normal offset as the first text line grows.
          { marginTop: 2 + Math.max(0, (lineHeight - typography.small.lineHeight) / 2) },
          checked && styles.checked,
        ]}
      >
        {checked ? <Icon name="check" tint={color.canvas} /> : null}
      </View>
      <Copy variant="small" style={styles.copy}>
        share my name, bruh and daily steps with party members.
      </Copy>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  consent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.related,
    minHeight: layout.touch,
    paddingVertical: space.tight,
    paddingHorizontal: space.micro,
    borderRadius: radius.grape,
  },
  measurement: { position: 'absolute', top: 0, left: 0, opacity: 0, alignItems: 'flex-start' },
  check: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: color.secondary,
    borderRadius: radius.seed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checked: { backgroundColor: color.success, borderColor: color.success },
  copy: { flex: 1, minWidth: 0, color: color.secondary },
});
