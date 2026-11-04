import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

export function AppStage({ children }: PropsWithChildren): React.JSX.Element {
  return (
    <View nativeID="outside-app-world">
      <View nativeID="outside-app-frame">{children}</View>
    </View>
  );
}
