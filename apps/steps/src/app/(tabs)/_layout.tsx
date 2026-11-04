import { Tabs } from 'expo-router/js-tabs';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdventureTabBar } from '../../components/AdventureTabBar';
import { ADVENTURE_TABS } from '../../navigation/tabs';
import { color, layout } from '../../theme/theme';

export default function TabsLayout(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      tabBar={(props) => <AdventureTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Web tabs reference real panels from first load; native screens stay lazy.
        lazy: Platform.OS !== 'web',
        sceneStyle: { backgroundColor: color.canvas },
        // The custom bar reports its measured height after this initial estimate.
        tabBarStyle: { height: layout.navigation + insets.bottom },
      }}
    >
      {ADVENTURE_TABS.map((tab) => (
        <Tabs.Screen
          key={tab.route}
          name={tab.route}
          options={{ title: tab.label, tabBarAccessibilityLabel: tab.name }}
        />
      ))}
    </Tabs>
  );
}
