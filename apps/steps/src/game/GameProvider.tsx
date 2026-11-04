import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, AppState, Platform } from 'react-native';
import { useExplore } from '../explore/ExploreProvider';
import type { HealthTracking } from '../health/model';
import { useHealthSteps } from '../health/useHealthSteps';
import type { MissionPeriod, SkinId } from './content';
import { eraseJourney } from './eraseJourney';
import {
  actionRejection,
  createDemoGame,
  createGame,
  dateKey,
  decodeGame,
  type Game,
  type GameAction,
  type Goal,
  type LoadFailure,
  type Rejection,
  updateGame,
} from './game';
import { createSession, type Notice, type Report, reduceSession, type Session } from './session';

const IS_DEMO = Platform.OS === 'web';
export const STORAGE_KEY = `bruhs-outside-v2-${IS_DEMO ? 'demo' : 'device'}`;
// Earlier single-XP-bar saves are read once and migrated; the old key is left untouched.
const LEGACY_STORAGE_KEY = `bruhs-outside-v1-${IS_DEMO ? 'demo' : 'device'}`;
type Loading =
  | Readonly<{ status: 'loading' | 'ready' }>
  | Readonly<{ status: 'error'; failure: LoadFailure }>;

type GameContextValue = Readonly<{
  game: Game;
  today: string;
  demo: boolean;
  loading: Loading;
  retryLoad: () => void;
  notice: Notice | null;
  reward: Report | null;
  restoreRewardFocus: boolean;
  gain: Session['gain'];
  dismissReward: (options?: Readonly<{ restoreFocus: boolean }>) => void;
  tracking: HealthTracking;
  syncHealth: () => void;
  pauseHealth: () => void;
  subscribeHealthPause: (listener: () => void) => () => void;
  healthSettings: () => void;
  connect: () => void;
  dismissNotice: (notice?: Notice) => void;
  retrySave: () => void;
  retryingSave: boolean;
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

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: PropsWithChildren): React.JSX.Element {
  const { recorder } = useExplore();
  const [today, setToday] = useState(dateKey);
  const [session, dispatch] = useReducer(reduceSession, today, (date) =>
    createSession(IS_DEMO ? createDemoGame(date) : createGame(date)),
  );
  const { game, notice, reward, restoreRewardFocus, gain } = session;
  const [loading, setLoading] = useState<Loading>({ status: 'loading' });
  const loadPending = useRef(true);
  const loadVersion = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const retryPending = useRef(false);
  const [retryingSave, setRetryingSave] = useState(false);
  const resetPending = useRef(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const healthPauseListeners = useRef(new Set<() => void>());
  const subscribeHealthPause = useCallback((listener: () => void): (() => void) => {
    healthPauseListeners.current.add(listener);
    return () => {
      healthPauseListeners.current.delete(listener);
    };
  }, []);

  // The rendered game, for answering `act` synchronously. The reducer stays the authority.
  const latestGame = useRef(game);
  latestGame.current = game;
  const act = useCallback((action: GameAction): Rejection | null => {
    const rejection = actionRejection(latestGame.current, action);
    dispatch({ type: 'play', action, demo: IS_DEMO });
    return rejection;
  }, []);
  const dismissNotice = useCallback((notice?: Notice): void => {
    dispatch({ type: 'dismiss-notice', notice });
  }, []);
  const saveProgress = useCallback((snapshot: Game): Promise<void> => {
    const raw = JSON.stringify(snapshot);
    saveQueue.current = saveQueue.current
      .then(() => AsyncStorage.setItem(STORAGE_KEY, raw))
      .then(() => dispatch({ type: 'save-succeeded' }))
      .catch((error: unknown) => {
        console.warn('Progress could not be saved:', error);
        dispatch({
          type: 'save-failed',
          message: "couldn't save your progress. free up space on this device, then retry.",
        });
      });
    return saveQueue.current;
  }, []);
  const retrySave = useCallback((): void => {
    if (loading.status !== 'ready' || retryPending.current) return;
    retryPending.current = true;
    setRetryingSave(true);
    void saveProgress(game).then(() => {
      retryPending.current = false;
      setRetryingSave(false);
    });
  }, [game, loading.status, saveProgress]);
  const {
    tracking,
    connect,
    syncHealth,
    pauseHealth: pauseHealthSync,
    healthSettings,
  } = useHealthSteps(loading.status === 'ready' && !IS_DEMO, today, game.health, act);
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
    const timer = setTimeout(() => dispatch({ type: 'dismiss-gain', id: gain.id }), 750);
    return () => clearTimeout(timer);
  }, [gain]);

  const loadProgress = useCallback((): void => {
    const version = ++loadVersion.current;
    loadPending.current = true;
    void Promise.resolve()
      .then(async () => {
        if (version !== loadVersion.current) return null;
        return (await AsyncStorage.getItem(STORAGE_KEY)) ?? (await AsyncStorage.getItem(LEGACY_STORAGE_KEY));
      })
      .then((raw) => {
        if (version !== loadVersion.current) return;
        if (raw !== null) {
          const decoded = decodeGame(raw);
          if (!decoded.ok) {
            loadPending.current = false;
            setLoading({ status: 'error', failure: decoded.failure });
            return;
          }
          dispatch({ type: 'restore', game: updateGame(decoded.game, { type: 'new-day', date: dateKey() }) });
          if (decoded.migrated)
            dispatch({
              type: 'notice',
              message: Object.keys(decoded.game.bank).length
                ? 'the fruitlands grew: bags, gear, crafting and chests. your items are in the bank.'
                : 'welcome to the fruitlands. today’s steps are in your pouch.',
            });
        }
        loadPending.current = false;
        setLoading({ status: 'ready' });
      })
      .catch((error: unknown) => {
        if (version !== loadVersion.current) return;
        console.warn('Progress could not be read:', error);
        loadPending.current = false;
        setLoading({ status: 'error', failure: { kind: 'storage' } });
      });
  }, []);

  useEffect(() => {
    loadProgress();
    return () => {
      loadVersion.current += 1;
    };
  }, [loadProgress]);

  useEffect(() => {
    if (loading.status !== 'ready') return;
    void saveProgress(game);
  }, [game, loading.status, saveProgress]);

  useEffect(() => {
    const refreshDay = (): void => {
      const date = dateKey();
      setToday(date);
      act({ type: 'new-day', date });
    };
    const nextMidnight = new Date(`${today}T12:00:00`);
    nextMidnight.setHours(24, 0, 0, 0);
    const timer = setTimeout(refreshDay, nextMidnight.getTime() - Date.now());
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshDay();
    });
    return () => {
      clearTimeout(timer);
      listener.remove();
    };
  }, [act, today]);

  const retryLoad = (): void => {
    if (loading.status !== 'error' || loadPending.current || resetPending.current) return;
    setResetError(null);
    setLoading({ status: 'loading' });
    loadProgress();
  };

  const walk = (): void => {
    if (!IS_DEMO) return;
    act({ type: 'add-steps', date: today, steps: 500 });
  };

  const claimMission = (period: MissionPeriod, mission: string): void => {
    act({ type: 'mission-claim', date: today, period, mission });
  };

  const equip = (id: SkinId): void => {
    act({ type: 'equip', skin: id });
  };

  const reset = (): void => {
    if (resetPending.current || loadPending.current) return;
    if (!recorder) {
      setResetError('your walk is still opening. try erasing it again.');
      return;
    }
    resetPending.current = true;
    setResetting(true);
    setResetError(null);
    void eraseJourney({
      stopSteps: pauseHealth,
      clearWalk: recorder.clear,
      resetGame: () => {
        const date = dateKey();
        dispatch({ type: 'restore', game: IS_DEMO ? createDemoGame(date) : createGame(date) });
        setToday(date);
        setLoading({ status: 'ready' });
        dispatch({
          type: 'notice',
          message: IS_DEMO ? 'a fresh demo. your bruh is ready.' : 'a new adventure. one step at a time.',
        });
      },
    })
      .then((result) => {
        if (!result.ok) setResetError(result.message);
      })
      .catch(() => setResetError('couldn’t erase your journey. try again.'))
      .finally(() => {
        resetPending.current = false;
        setResetting(false);
      });
  };

  return (
    <GameContext.Provider
      value={{
        game,
        today,
        demo: IS_DEMO,
        loading,
        retryLoad,
        notice,
        reward,
        restoreRewardFocus,
        gain,
        dismissReward: (options) =>
          dispatch({ type: 'dismiss-reward', restoreFocus: options?.restoreFocus ?? true }),
        tracking,
        connect,
        syncHealth,
        pauseHealth,
        subscribeHealthPause,
        healthSettings,
        dismissNotice,
        retrySave,
        retryingSave,
        walk,
        act,
        claimMission,
        equip,
        setGoal: (goal) => {
          act({ type: 'goal', date: today, goal });
        },
        reset,
        resetting,
        resetError,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be called inside GameProvider.');
  return context;
}
