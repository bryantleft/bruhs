import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { keyName, parseKey } from '../game/items';
import { itemArt } from '../pixel/art';
import { QUALITY_TINT, Slot } from '../pixel/chrome';

export type Cell = Readonly<{ key: string; qty: number }> | null;

// A fixed-column grid of bag slots that sizes itself to the available width.
export function SlotGrid({
  cells,
  columns = 4,
  onPress,
  label,
}: Readonly<{
  cells: readonly Cell[];
  columns?: number;
  onPress: (key: string) => void;
  label: string;
}>): React.JSX.Element {
  const [width, setWidth] = useState(0);
  const gap = 6;
  const size = width > 0 ? Math.floor((width - gap * (columns - 1)) / columns) : 0;
  return (
    <View
      accessibilityLabel={label}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.grid, { gap }]}
    >
      {size > 0
        ? cells.map((cell, index) =>
            cell ? (
              <Pressable
                // biome-ignore lint/suspicious/noArrayIndexKey: split stacks share a key, so the position keeps them distinct.
                key={`${cell.key}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`${keyName(cell.key)}, ${cell.qty}`}
                onPress={() => onPress(cell.key)}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Slot art={itemArt(parseKey(cell.key).id)} qty={cell.qty} size={size} />
                {parseKey(cell.key).quality > 0 ? (
                  <View
                    style={[styles.quality, { backgroundColor: QUALITY_TINT[parseKey(cell.key).quality] }]}
                  />
                ) : null}
              </Pressable>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: empty slots have no other identity
              <View key={`empty-${index}`} aria-hidden>
                <Slot size={size} />
              </View>
            ),
          )
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', minHeight: 40 },
  pressed: { opacity: 0.7 },
  quality: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 6,
    height: 6,
    borderWidth: 1,
    borderColor: '#0a0a0a',
  },
});
