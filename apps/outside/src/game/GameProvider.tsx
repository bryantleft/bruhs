import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AccessibilityInfo, AppState, Platform } from 'react-native';
import { useExplore } from '../explore/ExploreProvider';
import type { HealthTracking } from '../health/model';
import { useHealthSteps } from '../health/useHealthSteps';
import type { MissionPeriod, SkinId } from './content';
import {
  createDemoGame,
  createGame,
  dateKey,
  type Game,
  type GameAction,
  type Goal,
  type Rejection,
} from './game';
import { createProgressStore, type Loading } from './progress';
import type { Notice, Report, Session } from './session';

const IS_DEMO = Platform.OS === 'web';
export const STORAGE_KEY = `bruhs-outside-v2-${IS_DEMO ? 'demo' : 'device'}`;
// Earlier single-XP-bar saves are read once and migrated; the old key is left untouched.
const LEGACY_STORAGE_KEY = `bruhs-outside-v1-${IS_DEMO ? 'demo' : 'device'}`;

type GameContextValue = Readonly<{
  game: Game;
  today: string;
  demo: boolean;
  loading: Loading;
  retryLoad: () => void;
  tracking: HealthTracking;
  syncHealth: () => void;
  pauseHealth: () => void;
  subscribeHealthPause: (listener: () => void) => () => void;
  healthSettings: () => void;
  connect: () => void;
  walk: () => void;
  // Plays an action; returns why the rules refused it, or null. The session shows the reason.
  act: (action: GameAction) => Rejection | null;
  claimMission: (period: MissionPeriod, mission: string) => void;
  equip: (skin: SkinId) => void;
  setGoal: (goal: Goal) => void;
  reset: () => void;
  resetting: boolean;
  resetError: string | null;
}>;

// Short-lived feedback lives apart from the game, so a gain flash or a notice re-renders only
// the components that show them.
type GameFeedbackValue = Readonly<{
  notice: Notice | null;
  reward: Report | null;
  restoreRewardFocus: boolean;
  gain: Session['gain'];
  dismissReward: (options?: Readonly<{ restoreFocus: boolean }>) => void;
  dismissNotice: (notice?: Notice) => void;
  retrySave: () => void;
  retryingSave: boolean;
}>;

const GameContext = createContext<GameContextValue | null>(null);
const GameFeedbackContext = createContext<GameFeedbackValue | null>(null);

export function GameProvider({ children }: PropsWithChildren): React.JSX.Element {
  const { recorder } = useExplore();
  const [store] = useState(() =>
    createProgressStore({
      read: () => AsyncStorage.getItem(STORAGE_KEY),
      readLegacy: () => AsyncStorage.getItem(LEGACY_STORAGE_KEY),
      write: (raw) => AsyncStorage.setItem(STORAGE_KEY, raw),
      today: () => dateKey(),
      fresh: IS_DEMO ? createDemoGame : createGame,
      demo: IS_DEMO,
      warn: (message, error) => console.warn(message, error),
    }),
  );
  const { session, today, loading, retryingSave, resetting, resetError } = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  const { game, notice, reward, restoreRewardFocus, gain } = session;
  const healthPauseListeners = useRef(new Set<() => void>());
  const subscribeHealthPause = useCallback((listener: () => void): (() => void) => {
    healthPauseListeners.current.add(listener);
    return () => {
      healthPauseListeners.current.delete(listener);
    };
  }, []);
  const {
    tracking,
    connect,
    syncHealth,
    pauseHealth: pauseHealthSync,
    healthSettings,
  } = useHealthSteps(loading.status === 'ready' && !IS_DEMO, today, game.health, store.play);
  const pauseHealth = useCallback((): void => {
    for (const listener of healthPauseListeners.current) listener();
    pauseHealthSync();
  }, [pauseHealthSync]);

  useEffect(() => {
    if (notice && Platform.OS === 'ios')
      AccessibilityInfo.announceForAccessibilityWithOptions(notice.message, { queue: true });
  }, [notice]);

  useEffect(() => {
    if (!gain) return;
    const timer = setTimeout(() => store.send({ type: 'dismiss-gain', id: gain.id }), 750);
    return () => clearTimeout(timer);
  }, [gain, store]);

  useEffect(() => {
    store.load();
    return () => store.cancelLoad();
  }, [store]);

  useEffect(() => {
    const nextMidnight = new Date(`${today}T12:00:00`);
    nextMidnight.setHours(24, 0, 0, 0);
    const timer = setTimeout(store.refreshDay, nextMidnight.getTime() - Date.now());
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') store.refreshDay();
    });
    return () => {
      clearTimeout(timer);
      listener.remove();
    };
  }, [store, today]);

  const reset = useCallback(
    (): void => store.reset({ stopSteps: pauseHealth, clearWalk: recorder?.clear ?? null }),
    [pauseHealth, recorder, store],
  );

  const value = useMemo<GameContextValue>(
    () => ({
      game,
      today,
      demo: IS_DEMO,
      loading,
      retryLoad: store.retryLoad,
      tracking,
      connect,
      syncHealth,
      pauseHealth,
      subscribeHealthPause,
      healthSettings,
      walk: () => {
        if (IS_DEMO) store.play({ type: 'add-steps', date: today, steps: 500 });
      },
      act: store.play,
      claimMission: (period, mission) => {
        store.play({ type: 'mission-claim', date: today, period, mission });
      },
      equip: (skin) => {
        store.play({ type: 'equip', skin });
      },
      setGoal: (goal) => {
        store.play({ type: 'goal', date: today, goal });
      },
      reset,
      resetting,
      resetError,
    }),
    [
      connect,
      game,
      healthSettings,
      loading,
      pauseHealth,
      reset,
      resetError,
      resetting,
      store,
      subscribeHealthPause,
      syncHealth,
      today,
      tracking,
    ],
  );
  const feedback = useMemo<GameFeedbackValue>(
    () => ({
      notice,
      reward,
      restoreRewardFocus,
      gain,
      dismissReward: (options) =>
        store.send({ type: 'dismiss-reward', restoreFocus: options?.restoreFocus ?? true }),
      dismissNotice: (shown) => store.send({ type: 'dismiss-notice', notice: shown }),
      retrySave: store.retrySave,
      retryingSave,
    }),
    [gain, notice, restoreRewardFocus, retryingSave, reward, store],
  );

  return (
    <GameContext.Provider value={value}>
      <GameFeedbackContext.Provider value={feedback}>{children}</GameFeedbackContext.Provider>
    </GameContext.Provider>
  );
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be called inside GameProvider.');
  return context;
}

export function useGameFeedback(): GameFeedbackValue {
  const context = useContext(GameFeedbackContext);
  if (!context) throw new Error('useGameFeedback must be called inside GameProvider.');
  return context;
}
