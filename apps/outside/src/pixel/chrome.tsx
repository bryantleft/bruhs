import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { palette } from '../theme/palette';
import { color, font, layout, shadow, space } from '../theme/theme';
import type { Art } from './art';
import { Sprite } from './Sprite';

type Tone = 'panel' | 'well' | 'gold' | 'green' | 'red' | 'blue';
const TONES: Readonly<Record<Tone, Readonly<{ fill: string; light: string; dark: string }>>> = {
  panel: { fill: color.panel, light: color.bevelLight, dark: color.bevelDark },
  well: { fill: color.well, light: color.bevelDark, dark: color.raised },
  gold: { fill: palette['persimmon-500'], light: palette['durian-400'], dark: palette['persimmon-800'] },
  green: { fill: palette['pandan-600'], light: palette['pandan-400'], dark: palette['pandan-900'] },
  red: { fill: palette['lychee-600'], light: palette['lychee-400'], dark: palette['lychee-900'] },
  blue: { fill: palette['blueberry-700'], light: palette['blueberry-500'], dark: palette['blueberry-950'] },
};

export function bevel(tone: Tone = 'panel', pressed = false): ViewStyle {
  const { fill, light, dark } = TONES[tone];
  return {
    backgroundColor: fill,
    borderTopColor: pressed ? dark : light,
    borderLeftColor: pressed ? dark : light,
    borderBottomColor: pressed ? light : dark,
    borderRightColor: pressed ? light : dark,
    borderWidth: layout.border,
  };
}

// A bordered, bevelled box: the basic building block of the interface.
export function Panel({
  children,
  tone = 'panel',
  style,
  inner,
  title,
  aside,
}: PropsWithChildren<
  Readonly<{
    tone?: Tone;
    style?: StyleProp<ViewStyle>;
    inner?: StyleProp<ViewStyle>;
    title?: string;
    aside?: ReactNode;
  }>
>): React.JSX.Element {
  return (
    <View style={[styles.outline, style]}>
      <View style={[bevel(tone), styles.inner, inner]}>
        {title ? (
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {typeof aside === 'string' ? <Text style={styles.aside}>{aside}</Text> : aside}
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}

function fraction(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

// `from` marks where new progress starts: the part before it is dimmed, so a report shows what it added.
export function Bar({
  value,
  fill = color.xp,
  height = 12,
  from,
  children,
}: PropsWithChildren<
  Readonly<{ value: number; fill?: string; height?: number; from?: number }>
>): React.JSX.Element {
  const end = fraction(value);
  const start = from === undefined ? 0 : Math.min(fraction(from), end);
  return (
    // A labelled bar grows with its label, so larger text sizes never clip the numbers.
    <View
      style={[
        styles.bar,
        children ? { minHeight: height + layout.border * 2 } : { height: height + layout.border * 2 },
      ]}
    >
      {start > 0 ? (
        <View
          style={[styles.barFill, styles.barEarlier, { width: `${start * 100}%`, backgroundColor: fill }]}
        />
      ) : null}
      <View
        style={[
          styles.barFill,
          { left: `${start * 100}%`, width: `${(end - start) * 100}%`, backgroundColor: fill },
        ]}
      >
        <View style={styles.barShine} />
      </View>
      {children ? <View style={styles.barLabel}>{children}</View> : null}
    </View>
  );
}

// MMO-style stack counts: yellow below 100K, white thousands, green millions.
export function formatQty(qty: number): Readonly<{ text: string; tint: string }> {
  if (qty >= 10_000_000) return { text: `${Math.floor(qty / 1_000_000)}M`, tint: palette['pandan-300'] };
  if (qty >= 100_000) return { text: `${Math.floor(qty / 1_000)}K`, tint: palette['rambutan-50'] };
  return { text: String(qty), tint: palette['durian-300'] };
}

export function Slot({
  art,
  qty,
  size = 52,
  dim = false,
  selected = false,
  always = false,
}: Readonly<{
  art?: Art;
  qty?: number;
  size?: number;
  dim?: boolean;
  selected?: boolean;
  always?: boolean;
}>): React.JSX.Element {
  // Like classic MMO banks, a single item shows no count unless asked (coins always do).
  const label = qty !== undefined && (qty > 1 || always) ? formatQty(qty) : null;
  return (
    <View
      style={[
        styles.slot,
        bevel('well'),
        { width: size, height: size },
        selected && { borderColor: color.gold },
        dim && { opacity: 0.45 },
      ]}
    >
      {art ? <Sprite art={art} size={Math.round(size * 0.72)} /> : null}
      {label ? <Text style={[styles.qty, { color: label.tint }]}>{label.text}</Text> : null}
    </View>
  );
}

// A row of bevelled tabs; the selected one is pressed in and gold.
export function Segments<T extends string>({
  value,
  options,
  onChange,
  label,
}: Readonly<{
  value: T;
  options: readonly T[];
  onChange: (option: T) => void;
  label?: (option: T) => string;
}>): React.JSX.Element {
  return (
    <View accessibilityRole="tablist" style={styles.segments}>
      {options.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === option }}
          aria-selected={value === option}
          onPress={() => onChange(option)}
          style={({ pressed }) => [
            styles.segment,
            bevel(value === option ? 'gold' : 'panel', pressed || value === option),
          ]}
        >
          <Text style={[styles.segmentText, value === option && { color: color.text }]}>
            {label ? label(option) : option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Tag({
  children,
  tint = color.gold,
}: PropsWithChildren<Readonly<{ tint?: string }>>): React.JSX.Element {
  return <Text style={[styles.tag, { color: tint, borderColor: tint }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  outline: { borderWidth: layout.border, borderColor: color.ink, backgroundColor: color.ink },
  inner: { padding: space.related, gap: space.related },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: space.tight,
    rowGap: 2,
  },
  title: {
    fontFamily: font.display,
    fontSize: 17,
    lineHeight: 22,
    color: color.gold,
    flexShrink: 1,
    ...shadow,
  },
  aside: { fontFamily: font.label, fontSize: 11, lineHeight: 16, color: color.muted, ...shadow },
  bar: {
    borderWidth: layout.border,
    borderColor: color.ink,
    // A neutral track: red reads as danger, and an empty bar is just empty.
    backgroundColor: palette['longan-900'],
    overflow: 'hidden',
    justifyContent: 'center',
  },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  barEarlier: { opacity: 0.45 },
  barShine: { height: 2, backgroundColor: 'rgba(255,255,255,0.28)' },
  barLabel: { alignItems: 'center', justifyContent: 'center' },
  slot: { alignItems: 'center', justifyContent: 'center' },
  qty: {
    position: 'absolute',
    top: 1,
    left: 3,
    fontFamily: font.labelBold,
    fontSize: 11,
    lineHeight: 13,
    ...shadow,
  },
  segments: { flexDirection: 'row', gap: space.micro },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontFamily: font.label, fontSize: 11, lineHeight: 15, color: color.secondary, ...shadow },
  tag: {
    fontFamily: font.label,
    fontSize: 10,
    lineHeight: 14,
    paddingHorizontal: 4,
    borderWidth: 1,
    alignSelf: 'flex-start',
    ...shadow,
  },
});

// Quality colours, normal → perfect.
export const QUALITY_TINT = [
  palette['rambutan-100'],
  palette['pandan-300'],
  palette['blueberry-300'],
  palette['mangosteen-300'],
  palette['durian-400'],
] as const;
