import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGameFeedback } from '../game/GameProvider';
import { bevel } from '../pixel/chrome';
import { color, font, shadow, space } from '../theme/theme';

// A brief "+15 xp · +1 raw minnow" over whichever tab is showing, after an instant action.
export function GainToast(): React.JSX.Element | null {
  const { gain } = useGameFeedback();
  const insets = useSafeAreaInsets();
  if (!gain) return null;
  return (
    <View pointerEvents="none" style={[styles.row, { top: insets.top + space.tight }]}>
      <Text accessibilityLiveRegion="polite" style={[styles.toast, bevel('green')]}>
        {gain.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  toast: {
    fontFamily: font.label,
    fontSize: 11,
    lineHeight: 16,
    color: color.text,
    paddingHorizontal: space.tight,
    paddingVertical: 2,
    ...shadow,
  },
});
