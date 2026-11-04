import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';
import { useGame } from '../game/GameProvider';
import { readHealthSteps } from '../health/native';
import type { PartyEntry, PartyService } from './client';
import { createPartyController, type Operation, type PartyState } from './controller';
import type { PartyError, raceWeek } from './model';
import type { SharingState } from './sharing';

type PartyContextValue = Readonly<{
  available: boolean;
  hasSession: boolean;
  state: PartyState;
  operation: Operation;
  readRequestId: number | null;
  cancelRead: (requestId: number) => boolean;
  error: PartyError | null;
  errorOperation: Operation;
  sharing: SharingState;
  week: ReturnType<typeof raceWeek>;
  refresh: () => Promise<boolean>;
  enter: (entry: PartyEntry) => Promise<boolean>;
  leave: () => Promise<boolean>;
  deleteProfile: () => Promise<boolean>;
  loadMore: () => Promise<boolean>;
}>;

const PartyContext = createContext<PartyContextValue | null>(null);

// Publishes the party controller to React and forwards app, Health and game changes to it.
export function PartyProvider({
  children,
  service,
  hasSession,
}: PropsWithChildren<{ service: PartyService | null; hasSession: boolean }>): React.JSX.Element {
  const { game, demo, loading, resetting, subscribeHealthPause } = useGame();
  // The service is fixed for a provider's lifetime: PartyBackend mounts one provider per service.
  const [controller] = useState(() =>
    createPartyController(service, readHealthSteps, {
      inputs: { health: game.health, demo, ready: loading.status === 'ready', resetting },
      active: AppState.currentState === 'active',
    }),
  );
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => subscribeHealthPause(controller.healthPaused), [controller, subscribeHealthPause]);
  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', controller.appStateChanged);
    return () => subscription.remove();
  }, [controller]);
  // After every render, let the controller commit pending changes and run its week and sharing
  // reactions. It tracks their dependencies itself, so a render that changed nothing is a no-op.
  useEffect(() => {
    controller.setInputs({ health: game.health, demo, ready: loading.status === 'ready', resetting });
    controller.reconcile();
  });
  const value = useMemo<PartyContextValue>(
    () => ({
      available: service !== null,
      hasSession,
      state: snapshot.state,
      operation: snapshot.operation,
      readRequestId: snapshot.readRequestId,
      cancelRead: controller.cancelRead,
      error: snapshot.failure?.error ?? null,
      errorOperation: snapshot.failure?.operation ?? null,
      sharing: snapshot.sharing,
      week: snapshot.week,
      refresh: controller.refresh,
      enter: controller.enter,
      leave: controller.leave,
      deleteProfile: controller.deleteProfile,
      loadMore: controller.loadMore,
    }),
    [controller, hasSession, service, snapshot],
  );
  return <PartyContext.Provider value={value}>{children}</PartyContext.Provider>;
}

export function useParty(): PartyContextValue {
  const context = useContext(PartyContext);
  if (!context) throw new Error('useParty requires PartyProvider.');
  return context;
}
