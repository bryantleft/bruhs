import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { dateKey, type GameAction, type HealthConnection } from '../game/game';
import { createHealthSync } from './controller';
import type { HealthTracking } from './model';
import { openHealthSettings, readHealthSteps } from './native';

export function useHealthSteps(
  ready: boolean,
  today: string,
  connection: HealthConnection | undefined,
  onAction: (action: GameAction) => void,
): Readonly<{
  tracking: HealthTracking;
  connect: () => void;
  syncHealth: () => void;
  pauseHealth: () => void;
  healthSettings: () => void;
}> {
  const [tracking, setTracking] = useState<HealthTracking>({
    status: Platform.OS === 'web' ? 'demo' : 'idle',
  });
  const latest = useRef(connection);
  latest.current = connection;
  const sync = useMemo(() => createHealthSync(readHealthSteps, setTracking, onAction), [onAction]);
  const enabled = connection?.enabled === true;
  useEffect(() => {
    if (!ready || Platform.OS === 'web' || today !== dateKey()) return;
    if (!enabled) {
      sync.cancel();
      setTracking({ status: latest.current ? 'paused' : 'idle' });
      return;
    }
    const refresh = (): void => {
      if (!latest.current?.enabled) return;
      void sync.run({ connection: latest.current, requestPermission: false });
    };
    refresh();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      listener.remove();
      sync.cancel();
    };
  }, [enabled, ready, sync, today]);
  useEffect(() => () => sync.cancel(), [sync]);
  const connect = useCallback((): void => {
    if (!ready || Platform.OS === 'web') return;
    void sync.run({ connection: latest.current, requestPermission: true });
  }, [ready, sync]);
  const syncHealth = useCallback((): void => {
    if (!ready || Platform.OS === 'web') return;
    if (!latest.current?.enabled) return;
    void sync.run({ connection: latest.current, requestPermission: false });
  }, [ready, sync]);
  const pauseHealth = useCallback((): void => {
    if (latest.current) latest.current = { ...latest.current, enabled: false };
    sync.cancel();
    onAction({ type: 'health-pause' });
    setTracking({ status: 'paused' });
  }, [onAction, sync]);
  const healthSettings = useCallback((): void => {
    void openHealthSettings().catch(() =>
      setTracking({
        status: 'error',
        message:
          'Health settings could not open. Open Apple Health or Health Connect on your phone to manage step access.',
      }),
    );
  }, []);
  return { tracking, connect, syncHealth, pauseHealth, healthSettings };
}
