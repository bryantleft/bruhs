import { router } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { useGame } from '../game/GameProvider';

import { color, space } from '../theme/theme';
import { Icon } from './Icon';
import { Button, Copy } from './ui';

export function TrackingControl({ adventure = false }: Readonly<{ adventure?: boolean }>): React.JSX.Element {
  const { demo, tracking, walk, connect, syncHealth, healthSettings, game } = useGame();
  const provider = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
  if (demo)
    return (
      <Button
        label="walk · +500 steps"
        icon="trail"
        onPress={walk}
        accessibilityLabel="Take a demo walk: add 500 steps"
      />
    );
  if (tracking.status === 'ready') {
    return (
      <View style={styles.group}>
        {adventure ? (
          <View style={styles.actions}>
            <View style={styles.primary}>
              <Button label="sync steps" icon="refresh" onPress={syncHealth} />
            </View>
          </View>
        ) : (
          <Button label="sync steps now" variant="outline" icon="refresh" onPress={syncHealth} />
        )}
        <View style={styles.connected}>
          <Icon name="check" tint={color.success} />
          <Copy variant="label" style={styles.status}>
            {provider} · synced{' '}
            {new Date(tracking.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Copy>
        </View>
      </View>
    );
  }
  if (tracking.status === 'syncing')
    return <Button label={`syncing ${provider}…`} disabled onPress={() => {}} />;
  if (tracking.status === 'unavailable')
    return (
      <View style={styles.group}>
        <Copy variant="small" style={styles.note}>
          {tracking.reason === 'preview'
            ? 'health connections need the installed bruhs app on your phone.'
            : tracking.reason === 'update-required'
              ? 'install or update Health Connect to bring your steps along.'
              : `${provider} isn’t available on this device.`}
        </Copy>
        {tracking.reason === 'update-required' ? (
          <Button label="get Health Connect" icon="arrow" onPress={healthSettings} />
        ) : (
          <Button label="check again" variant="outline" icon="refresh" onPress={connect} />
        )}
      </View>
    );
  if (tracking.status === 'no-data')
    return (
      <View style={styles.group}>
        <Button label="sync steps again" variant="outline" icon="refresh" onPress={syncHealth} />
        <Copy variant="small" style={styles.note}>
          no readable steps. check Steps access in {provider}, then sync again.
        </Copy>
      </View>
    );
  if (tracking.status === 'permission-required')
    return (
      <View style={styles.group}>
        <Button
          label="allow step access"
          icon="health"
          onPress={adventure ? () => router.push('/health') : connect}
        />
        <Copy variant="small" style={styles.note}>
          allow read access to Steps in {provider} to continue.
        </Copy>
      </View>
    );
  if (tracking.status === 'error')
    return (
      <View style={styles.group}>
        <Button
          label="try syncing again"
          variant="outline"
          icon="refresh"
          onPress={game.health?.enabled ? syncHealth : connect}
        />
        <Copy variant="small" style={styles.note}>
          {tracking.message}
        </Copy>
      </View>
    );
  return (
    <Button
      label={tracking.status === 'paused' ? 'resume step sync' : `connect ${provider}`}
      icon="health"
      onPress={adventure ? () => router.push('/health') : connect}
    />
  );
}
const styles = StyleSheet.create({
  group: { gap: space.tight },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.tight },
  primary: { flex: 1 },
  note: { textAlign: 'center' },
  connected: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.tight },
  status: { color: color.success, flexShrink: 1 },
});
