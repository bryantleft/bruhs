import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { distanceParts, formatDistance } from '../explore/walk';
import { color, font, space } from '../theme/theme';
import { Copy } from './ui';

export function WalkDistance({ meters }: Readonly<{ meters: number }>): React.JSX.Element {
  const { value, unit } = distanceParts(meters);
  const [valueWidth, setValueWidth] = useState(0);
  const [availableWidth, setAvailableWidth] = useState(0);
  const compact = availableWidth > 0 && valueWidth > availableWidth;
  return (
    <View style={styles.group}>
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
          style={[styles.value, styles.measurementText]}
          onLayout={({ nativeEvent }) => setValueWidth(Math.ceil(nativeEvent.layout.width))}
        >
          {value}
        </Copy>
      </ScrollView>
      <View
        aria-hidden={compact}
        style={styles.row}
        onLayout={({ nativeEvent }) => setAvailableWidth(Math.floor(nativeEvent.layout.width))}
      >
        <Copy style={[styles.value, styles.visibleValue]}>
          {compact
            ? // Compact notation ("12K") already reads as rounded; the pixel font draws "~" as a dash.
              (unit === 'km' ? meters / 1_000 : meters).toLocaleString(undefined, {
                notation: 'compact',
                maximumFractionDigits: 0,
              })
            : value}
        </Copy>
        <Copy variant="small">{unit}</Copy>
      </View>
      {compact ? (
        <Copy variant="small" style={styles.exact}>
          {formatDistance(meters)}
        </Copy>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.micro },
  measurement: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 0,
  },
  measurementText: { flexShrink: 0 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: space.tight },
  value: {
    fontFamily: font.display,
    fontSize: 32,
    lineHeight: 40,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  visibleValue: { maxWidth: '100%', flexShrink: 1 },
  exact: { maxWidth: '100%', color: color.secondary },
});
