import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useGame } from '../game/GameProvider';
import { recentWeek } from '../game/history';
import { formatSteps, stepUnit } from '../game/labels';
import { color, radius, space } from '../theme/theme';
import { Icon } from './Icon';
import { Copy, SectionTitle } from './ui';

export function WeekHistory(): React.JSX.Element {
  const { game, today, demo } = useGame();
  const week = recentWeek(game, today);
  const [fullTotalWidth, setFullTotalWidth] = useState(0);
  const [availableTotalWidth, setAvailableTotalWidth] = useState(0);
  const fullTotal = week.total.toLocaleString();
  const compactTotal = availableTotalWidth > 0 && fullTotalWidth > availableTotalWidth;
  const description = week.days.map(({ date, entry }) => {
    const label = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    return entry
      ? `${label}: ${formatSteps(entry.steps)}; daily goal ${entry.goal.toLocaleString()} steps${entry.steps >= entry.goal ? ', reached' : ''}`
      : `${label}: no entry`;
  });
  return (
    <View style={styles.week}>
      <View aria-hidden accessible={false} pointerEvents="none" style={styles.totalMeasurement}>
        <Copy
          aria-hidden
          accessible={false}
          variant="number"
          style={[styles.total, styles.measurementText]}
          onLayout={({ nativeEvent }) => {
            const width = Math.ceil(nativeEvent.layout.width);
            if (width > 0) setFullTotalWidth(width);
          }}
        >
          {fullTotal}
        </Copy>
      </View>
      <SectionTitle title="week" aside={demo ? 'demo' : '7 days'} />
      <View style={styles.totalGroup}>
        <View
          aria-hidden={compactTotal}
          accessible={false}
          style={styles.totalRow}
          onLayout={({ nativeEvent }) => {
            const width = Math.floor(nativeEvent.layout.width);
            if (width > 0) setAvailableTotalWidth(width);
          }}
        >
          {compactTotal ? <Copy variant="label">~</Copy> : null}
          <Copy variant="number" style={[styles.total, styles.totalValue]}>
            {compactTotal
              ? week.total.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 0 })
              : fullTotal}
          </Copy>
          {compactTotal ? null : <Copy variant="small">{stepUnit(week.total)}</Copy>}
        </View>
        {compactTotal ? (
          <Copy variant="small" style={styles.exactTotal}>
            {formatSteps(week.total)}
          </Copy>
        ) : null}
      </View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Daily steps for the past seven days. ${description.join('. ')}.`}
        style={styles.chart}
      >
        {week.days.map(({ date, entry }) => {
          const completed = entry !== null && entry.steps >= entry.goal;
          const tint = date === today ? color.primary : completed ? color.success : color.faint;
          return (
            <View key={date} aria-hidden accessible={false} style={styles.day}>
              <View style={styles.dayHeading}>
                <Copy variant="label" style={date === today && { color: color.primary }}>
                  {new Date(`${date}T12:00:00`)
                    .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
                    .toLowerCase()}
                </Copy>
                <View style={styles.dayValue}>
                  {completed ? <Icon name="check" tint={color.success} /> : null}
                  <Copy
                    variant="label"
                    style={[styles.dayValueText, entry && { color: date === today ? tint : color.secondary }]}
                  >
                    {entry ? entry.steps.toLocaleString() : '\u2014'}
                  </Copy>
                </View>
              </View>
              <View style={[styles.barTrack, !entry && styles.missingTrack]}>
                {entry ? (
                  <View
                    style={[
                      styles.bar,
                      { width: `${(entry.steps / week.scale) * 100}%`, backgroundColor: tint },
                    ]}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  week: {
    gap: space.group,
    padding: space.group,
    backgroundColor: color.panel,
    borderRadius: radius.lychee,
    borderWidth: 1,
    borderColor: color.border,
  },
  totalMeasurement: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 0,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  measurementText: { flexShrink: 0 },
  totalGroup: { gap: space.micro },
  totalRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: space.tight },
  total: { fontSize: 28, lineHeight: 36, letterSpacing: -1 },
  totalValue: { maxWidth: '100%', flexShrink: 1 },
  exactTotal: { maxWidth: '100%', color: color.secondary },
  chart: { gap: space.tight },
  day: { gap: space.micro },
  dayHeading: {
    minHeight: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.tight,
  },
  dayValue: {
    maxWidth: '100%',
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.micro,
  },
  dayValueText: { flexShrink: 1 },
  barTrack: { height: space.micro, backgroundColor: color.border, borderRadius: radius.seed },
  missingTrack: { backgroundColor: 'transparent', borderBottomWidth: 1, borderColor: color.border },
  bar: { height: '100%', borderRadius: radius.seed },
});
