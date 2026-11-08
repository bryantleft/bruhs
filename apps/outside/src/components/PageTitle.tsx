import { StyleSheet, Text, View } from 'react-native';
import { useGame } from '../game/GameProvider';
import { questPoints, totalLevel, unspentSteps } from '../game/game';
import { type Art, UI_ART } from '../pixel/art';
import { Sprite } from '../pixel/Sprite';
import { palette } from '../theme/palette';
import { color, font, shadow, space } from '../theme/theme';
import { RollingNumber } from './RollingNumber';

// Big numbers shrink so a title row fits a 320-wide screen; the spoken label keeps every digit.
export function compact(value: number): string {
  if (value >= 1_000_000) return `${Math.floor(value / 100_000) / 10}m`;
  if (value >= 10_000) return `${Math.floor(value / 100) / 10}k`;
  return value.toLocaleString();
}

type Stat = Readonly<{ value: number; spoken: string; art?: Art; label?: string; tint?: string }>;

// The one figure each tab is about, beside its title: waiting steps on the world and map,
// coins in the bag, total level on skills, quest points on quests.
export function useTabStat(kind: 'steps' | 'coins' | 'level' | 'quest-points'): Stat {
  const { game } = useGame();
  switch (kind) {
    case 'steps': {
      const pouch = unspentSteps(game);
      return {
        value: pouch,
        spoken: `${pouch.toLocaleString()} steps waiting`,
        art: UI_ART.steps,
        tint: pouch > 0 ? color.success : color.muted,
      };
    }
    case 'coins':
      return {
        value: game.coins,
        spoken: `${game.coins.toLocaleString()} coins`,
        art: UI_ART.coins,
        tint: palette['durian-300'],
      };
    case 'level': {
      const level = totalLevel(game);
      return { value: level, spoken: `total level ${level}`, label: 'total lvl' };
    }
    case 'quest-points': {
      const points = questPoints(game);
      return { value: points, spoken: `${points} quest points`, label: 'quest pts' };
    }
  }
}

export function PageTitle({ title, stat }: Readonly<{ title: string; stat?: Stat }>): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text accessibilityRole="header" aria-level={1} style={styles.title}>
        {title}
      </Text>
      {stat ? (
        <View accessible accessibilityLabel={stat.spoken} style={styles.stat}>
          {stat.art ? <Sprite art={stat.art} size={18} /> : null}
          {stat.label ? <Text style={styles.label}>{stat.label}</Text> : null}
          <RollingNumber
            value={stat.value}
            format={compact}
            style={[styles.value, { color: stat.tint ?? color.gold }]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.related },
  title: { flex: 1, fontFamily: font.display, fontSize: 26, lineHeight: 32, color: color.gold, ...shadow },
  stat: { flexDirection: 'row', alignItems: 'center', gap: space.micro, flexShrink: 0 },
  label: { fontFamily: font.label, fontSize: 9, lineHeight: 12, color: color.muted, ...shadow },
  value: { fontFamily: font.labelBold, fontSize: 15, lineHeight: 20, ...shadow },
});
