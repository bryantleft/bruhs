import type { PropsWithChildren } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { color } from '../theme/theme';

export function AppStage({ children }: PropsWithChildren): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  return (
    <View style={styles.world}>
      <View style={[styles.app, width > height && styles.landscapeApp]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  world: { flex: 1, backgroundColor: color.canvas, alignItems: 'center' },
  app: { flex: 1, width: '100%', maxWidth: 480, overflow: 'hidden', backgroundColor: color.canvas },
  landscapeApp: { maxWidth: '100%' },
});
