import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useGame, useGameFeedback } from '../game/GameProvider';
import { questPoints, totalLevel, unspentSteps } from '../game/game';
import { useScreenLink } from '../navigation/useScreenFocus';
import { UI_ART } from '../pixel/art';
import { bevel } from '../pixel/chrome';
import { Sprite } from '../pixel/Sprite';
import { palette } from '../theme/palette';
import { color, font, layout, shadow, space } from '../theme/theme';
import { Bruh } from './Bruh';

// Big numbers shrink so the HUD fits a 320-wide screen; the spoken label keeps every digit.
function compact(value: number): string {
  if (value >= 1_000_000) return `${Math.floor(value / 100_000) / 10}m`;
  if (value >= 10_000) return `${Math.floor(value / 100) / 10}k`;
  return value.toLocaleString();
}

export function Hud(): React.JSX.Element {
  const { game } = useGame();
  const { gain } = useGameFeedback();
  const characterLink = useScreenLink('/character');
  const pouch = unspentSteps(game);
  return (
    <View style={styles.wrap}>
      <View style={[styles.hud, bevel('panel')]}>
        <Pressable
          ref={characterLink.buttonRef}
          accessibilityRole="button"
          accessibilityLabel="Open your character"
          onPress={characterLink.open}
          onKeyDownCapture={characterLink.onKeyDownCapture}
          style={({ pressed }) => [styles.avatar, bevel('well', pressed)]}
        >
          <Bruh skin={game.equipped} size={32} />
        </Pressable>
        <View style={styles.stats} accessible accessibilityLabel={`Total level ${totalLevel(game)}`}>
          <Text style={styles.small}>total lvl</Text>
          <Text style={styles.level}>{totalLevel(game)}</Text>
        </View>
        <View style={styles.stats} accessible accessibilityLabel={`${questPoints(game)} quest points`}>
          <Text style={styles.small}>quest pts</Text>
          <Text style={styles.level}>{questPoints(game)}</Text>
        </View>
        <View style={styles.counters}>
          <View style={styles.counter} accessible accessibilityLabel={`${game.coins.toLocaleString()} coins`}>
            <Sprite art={UI_ART.coins} size={18} />
            <Text style={[styles.count, { color: palette['durian-300'] }]}>{compact(game.coins)}</Text>
          </View>
          <View
            style={styles.counter}
            accessible
            accessibilityLabel={`${pouch.toLocaleString()} unspent steps`}
          >
            <Sprite art={UI_ART.steps} size={18} />
            <Text style={[styles.count, { color: pouch > 0 ? color.success : color.muted }]}>
              {compact(pouch)}
            </Text>
          </View>
        </View>
      </View>
      {gain ? (
        <View pointerEvents="none" style={styles.toastRow}>
          <Text accessibilityLiveRegion="polite" style={[styles.toast, bevel('green')]}>
            {gain.text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: layout.border, borderColor: color.ink, zIndex: 2 },
  hud: { flexDirection: 'row', alignItems: 'center', gap: space.related, padding: space.tight },
  avatar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  stats: { alignItems: 'flex-start' },
  small: { fontFamily: font.label, fontSize: 9, lineHeight: 12, color: color.muted, ...shadow },
  level: { fontFamily: font.labelBold, fontSize: 18, lineHeight: 22, color: color.gold, ...shadow },
  counters: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: space.micro },
  count: { fontFamily: font.labelBold, fontSize: 13, lineHeight: 18, ...shadow },
  toastRow: { position: 'absolute', left: 0, right: 0, bottom: -18, alignItems: 'center' },
  toast: {
    fontFamily: font.label,
    fontSize: 11,
    lineHeight: 16,
    color: color.text,
    paddingHorizontal: space.tight,
    ...shadow,
  },
});
