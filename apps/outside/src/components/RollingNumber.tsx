import { useEffect, useRef } from 'react';
import { Animated, Platform, type StyleProp, StyleSheet, Text, type TextStyle, View } from 'react-native';
import { isDigit, placeFromRight, wheelTurn } from '../pixel/odometer';
import { easeOut, motion } from '../theme/theme';
import { useReducedMotion } from './MotionProvider';

const ROWS = Array.from({ length: 20 }, (_, row) => row % 10);
const NATIVE = Platform.OS !== 'web';

type Props = Readonly<{
  value: number;
  // Defaults to grouped digits ("1,234"). Letters and separators sit still between the wheels.
  format?: (value: number) => string;
  // Rolls from this figure when it first appears, as the loot report's xp counts up from 0.
  from?: number;
  // Needs a numeric lineHeight: each wheel is one line tall.
  style: StyleProp<TextStyle>;
}>;

function grouped(value: number): string {
  return value.toLocaleString();
}

// A figure whose digits roll to each new value like an odometer, up as it grows and down as it
// shrinks, over 250 ms on the ease-out curve. It only moves when the value changes, on the
// native driver, and is plain text under reduced motion. The digits are hidden from screen
// readers, so the parent gives the spoken figure, as every caller does.
export function RollingNumber({ value, format = grouped, from, style }: Props): React.JSX.Element {
  const reduced = useReducedMotion();
  const previous = useRef(from ?? value);
  const text = format(value);
  const before = format(previous.current);
  const up = value >= previous.current;
  useEffect(() => {
    previous.current = value;
  }, [value]);
  if (reduced) return <Text style={style}>{text}</Text>;
  const height = StyleSheet.flatten(style)?.lineHeight ?? 20;
  return (
    <View
      style={styles.row}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      {Array.from(text, (char, index) => {
        const place = text.length - 1 - index;
        if (!isDigit(char)) {
          return (
            <Text key={`s${place}`} style={style}>
              {char}
            </Text>
          );
        }
        const start = placeFromRight(before, place);
        return (
          <Wheel
            key={`d${place}`}
            digit={Number(char)}
            start={isDigit(start) ? Number(start) : null}
            up={up}
            height={height}
            style={style}
          />
        );
      })}
    </View>
  );
}

function Wheel({
  digit,
  start,
  up,
  height,
  style,
}: Readonly<{
  digit: number;
  // The digit this place showed before it mounted, or null for a place the figure just grew.
  start: number | null;
  up: boolean;
  height: number;
  style: StyleProp<TextStyle>;
}>): React.JSX.Element {
  const shown = useRef(start ?? 0);
  const entering = useRef(start === null);
  const y = useRef(new Animated.Value(-shown.current * height)).current;
  const opacity = useRef(new Animated.Value(entering.current ? 0 : 1)).current;
  useEffect(() => {
    const from = shown.current;
    if (from === digit && !entering.current) return;
    shown.current = digit;
    entering.current = false;
    const turn = wheelTurn(from, digit, up);
    y.setValue(-turn.start * height);
    const timing = { duration: motion.roll, easing: easeOut, useNativeDriver: NATIVE };
    const animation = Animated.parallel([
      Animated.timing(y, { ...timing, toValue: -turn.end * height }),
      Animated.timing(opacity, { ...timing, toValue: 1 }),
    ]);
    // Finished or cut short by the next value, the wheel comes to rest on the first ten rows.
    animation.start(() => {
      y.setValue(-digit * height);
      opacity.setValue(1);
    });
    return () => animation.stop();
  }, [digit, up, height, y, opacity]);
  return (
    <View style={[styles.window, { height }]}>
      <Animated.View style={{ opacity, transform: [{ translateY: y }] }}>
        {ROWS.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows are fixed; each digit appears twice.
          <Text key={index} style={[style, styles.digit, { height, lineHeight: height }]}>
            {row}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  // The extra pixel on the right keeps the drop shadow inside the clip without moving the digit.
  window: { overflow: 'hidden', paddingRight: 1, marginRight: -1 },
  digit: { textAlign: 'center' },
});
