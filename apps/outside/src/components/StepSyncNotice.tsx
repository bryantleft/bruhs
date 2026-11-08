import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGame } from '../game/GameProvider';
import { useScreenLink } from '../navigation/useScreenFocus';
import { bevel } from '../pixel/chrome';
import { color, font, shadow, space } from '../theme/theme';
import { Icon } from './Icon';

// Steps sync on their own whenever the app opens, so the world only mentions syncing when it
// needs the player: never connected, paused, missing access, or failing. The row opens settings.
export function StepSyncNotice(): React.JSX.Element | null {
  const { demo, tracking, game } = useGame();
  const settings = useScreenLink('/health');
  if (demo) return null;
  const provider = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
  const message = (() => {
    if (!game.health) return `connect ${provider} so your steps reach the fruitlands.`;
    if (!game.health.enabled) return 'step sync is paused. new steps wait until you resume it.';
    switch (tracking.status) {
      case 'permission-required':
        return `allow Steps access in ${provider} to keep syncing.`;
      case 'no-data':
        return `no steps found today. check Steps access in ${provider}.`;
      case 'unavailable':
        return tracking.reason === 'update-required'
          ? 'install or update Health Connect to bring your steps along.'
          : `${provider} isn’t available on this device.`;
      case 'error':
        return tracking.message;
      default:
        return null;
    }
  })();
  if (!message) return null;
  return (
    <Pressable
      ref={settings.buttonRef}
      accessibilityRole="button"
      accessibilityLabel={`${message} Open step sync settings.`}
      onPress={settings.open}
      onKeyDownCapture={settings.onKeyDownCapture}
      style={({ pressed }) => [styles.row, bevel('panel', pressed)]}
    >
      <Icon name="health" tint={color.danger} />
      <View style={styles.grow}>
        <Text style={styles.text}>{message}</Text>
      </View>
      <Icon name="arrow" tint={color.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.related,
    padding: space.related,
    minHeight: 48,
  },
  grow: { flex: 1, minWidth: 0 },
  text: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: color.text, ...shadow },
});
