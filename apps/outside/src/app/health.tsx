import { Linking, Platform, StyleSheet, View } from 'react-native';
import { Bruh } from '../components/Bruh';
import { ConfirmAction } from '../components/ConfirmAction';
import { GoalPicker } from '../components/GoalPicker';
import { Icon, type IconName } from '../components/Icon';
import { TrackingControl } from '../components/TrackingControl';
import { Button, Copy, IconButton, Screen, SectionTitle } from '../components/ui';
import { useParty } from '../friends/PartyProvider';
import { useGame } from '../game/GameProvider';
import { backToAdventure, useScreenFocus } from '../navigation/useScreenFocus';
import { Panel } from '../pixel/chrome';
import { color, radius, space } from '../theme/theme';

// The policy both stores link to. Health Connect's privacy action opens this screen
// (plugins/with-health-rationale.cjs), so the link here is that action's privacy policy too.
const PRIVACY_POLICY = 'https://outside.bruhs.app/privacy/#app';

export default function HealthScreen(): React.JSX.Element {
  const screen = useScreenFocus();
  const { demo, game, setGoal, pauseHealth, healthSettings, reset, resetting, resetError } = useGame();
  const provider = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
  const active = game.health?.enabled === true;
  const { available: hasParties } = useParty();
  return (
    <Screen rootRef={screen} bottomSafeArea footer={<TrackingControl />}>
      <View style={styles.navigation}>
        <IconButton icon="back" label="Back to your adventure" onPress={() => backToAdventure('/health')} />
      </View>
      <View style={styles.hero}>
        <View style={styles.art}>
          <Bruh size={100} skin={game.equipped} />
          <View style={styles.heart}>
            <Icon name="health" tint={color.success} />
          </View>
        </View>
        <Copy variant="title" style={styles.title}>
          settings
        </Copy>
      </View>
      <Panel title="daily goal" aside="changes apply from today">
        <GoalPicker value={game.goal} onChange={setGoal} />
      </Panel>
      <View style={styles.permissions}>
        {(
          [
            {
              icon: 'trail',
              title: 'read access only',
              description: 'daily step totals pay for travel, xp and quests.',
            },
            {
              icon: 'refresh',
              title: 'when it syncs',
              description: 'syncs when you open the app or tap sync. watch updates may arrive later.',
            },
            {
              icon: 'lock',
              title: hasParties ? 'your choice' : 'saved locally',
              description: hasParties
                ? 'daily totals stay here unless you join a party. party members can read shared totals.'
                : 'daily totals stay on this device.',
            },
          ] satisfies readonly Readonly<{ icon: IconName; title: string; description: string }>[]
        ).map((item) => (
          <View style={styles.permission} key={item.title}>
            <View style={styles.permissionIcon}>
              <Icon name={item.icon} tint={color.success} />
            </View>
            <View style={styles.permissionCopy}>
              <Copy style={styles.permissionTitle}>{item.title}</Copy>
              <Copy variant="small">{item.description}</Copy>
            </View>
          </View>
        ))}
      </View>
      <Button
        label="read the privacy policy"
        variant="ghost"
        accessibilityHint="opens outside.bruhs.app in your browser"
        onPress={() => void Linking.openURL(PRIVACY_POLICY)}
      />
      {demo ? (
        <View style={styles.demo}>
          <Copy variant="label" style={{ color: color.primary }}>
            BROWSER DEMO
          </Copy>
          <Copy variant="small">sample steps. connect Health in the iPhone or Android app.</Copy>
        </View>
      ) : (
        <View style={styles.controls}>
          <SectionTitle title="step access" aside={active ? 'sync enabled' : 'sync off'} />
          <Copy variant="small">
            {Platform.OS === 'ios'
              ? 'in Apple Health, let this app read Steps. if totals are missing, check that, then sync again.'
              : 'in Health Connect, let this app read Steps. your phone or fitness app must record steps there.'}
          </Copy>
          <Button label={`open ${provider}`} variant="outline" onPress={healthSettings} />
          {active ? (
            <>
              <Button label="pause step sync" variant="ghost" onPress={pauseHealth} />
              <Copy variant="label" style={styles.centered}>
                pausing keeps earned progress. revoke access in {provider}.
              </Copy>
            </>
          ) : null}
          <View style={styles.divider} />
          <Copy variant="small">health record changes do not remove earned progress.</Copy>
          <ConfirmAction
            label={resetting ? 'erasing journey…' : 'erase saved journey'}
            confirmLabel="yes, erase my journey"
            cancelLabel="keep my journey"
            description={
              hasParties
                ? 'erases your walks and game progress on this device. your health records and shared party totals stay.'
                : 'erases your walks and game progress on this device. your health records stay.'
            }
            variant="ghost"
            cancelVariant="outline"
            onConfirm={reset}
            disabled={resetting}
          />
          {resetError ? (
            <Copy variant="small" accessibilityLiveRegion="polite" style={{ color: color.primary }}>
              {resetError}
            </Copy>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.tight,
    marginLeft: -space.tight,
    marginRight: -space.tight,
  },
  hero: { alignItems: 'center', gap: space.group },
  art: { width: 120, height: 112, justifyContent: 'center', alignItems: 'center' },
  heart: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: color.strongBorder,
    backgroundColor: color.panel,
    borderRadius: radius.lychee,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { maxWidth: '100%', textAlign: 'center' },
  permissions: {
    padding: space.group,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lychee,
    gap: space.section,
  },
  permission: { flexDirection: 'row', alignItems: 'flex-start', gap: space.related },
  permissionIcon: { paddingTop: space.micro },
  permissionCopy: { flex: 1, gap: space.tight },
  permissionTitle: { color: color.text, fontSize: 14, lineHeight: 22 },
  demo: {
    gap: space.tight,
    padding: space.group,
    borderWidth: 1,
    borderColor: `${color.primary}55`,
    borderRadius: radius.lychee,
  },
  controls: { gap: space.related },
  centered: { textAlign: 'center' },
  divider: { height: 1, backgroundColor: color.border, marginVertical: space.related },
});
