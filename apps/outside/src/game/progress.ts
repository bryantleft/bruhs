// Saved progress as a plain store: loading (with the v1 fallback and migration notice), the
// ordered save queue and its retry, the day rollover, and erasing a journey. GameProvider only
// subscribes to it and forwards app events, so all of this is testable without React.
import type { Recorder } from '../explore/recorder.ts';
import { eraseJourney } from './eraseJourney.ts';
import {
  decodeGame,
  type Game,
  type GameAction,
  type LoadFailure,
  type Rejection,
  updateGame,
} from './game.ts';
import { createSession, playSession, reduceSession, type Session, type SessionAction } from './session.ts';

export type Loading =
  | Readonly<{ status: 'loading' | 'ready' }>
  | Readonly<{ status: 'error'; failure: LoadFailure }>;

export type ProgressState = Readonly<{
  session: Session;
  today: string;
  loading: Loading;
  retryingSave: boolean;
  resetting: boolean;
  resetError: string | null;
}>;

export type ProgressPorts = Readonly<{
  // The current save, then the pre-v2 key read once for migration (and left untouched).
  read: () => Promise<string | null>;
  readLegacy: () => Promise<string | null>;
  write: (raw: string) => Promise<void>;
  today: () => string;
  // A new save for the date: the demo or a fresh adventure.
  fresh: (date: string) => Game;
  demo: boolean;
  warn: (message: string, error: unknown) => void;
}>;

export type EraseSteps = Readonly<{
  stopSteps: () => void;
  // Null while the walk recorder is still opening.
  clearWalk: Recorder['clear'] | null;
}>;

export type ProgressStore = Readonly<{
  getState: () => ProgressState;
  subscribe: (listener: () => void) => () => void;
  load: () => void;
  cancelLoad: () => void;
  retryLoad: () => void;
  // Plays an action and returns why the rules refused it, or null.
  play: (action: GameAction) => Rejection | null;
  send: (event: Exclude<SessionAction, Readonly<{ type: 'play' }>>) => void;
  refreshDay: () => void;
  retrySave: () => void;
  reset: (steps: EraseSteps) => void;
}>;

export const SAVE_FAILED = "couldn't save your progress. free up space on this device, then retry.";

export function createProgressStore(ports: ProgressPorts): ProgressStore {
  const today = ports.today();
  let state: ProgressState = {
    session: createSession(ports.fresh(today)),
    today,
    loading: { status: 'loading' },
    retryingSave: false,
    resetting: false,
    resetError: null,
  };
  const listeners = new Set<() => void>();
  let loadPending = true;
  let loadVersion = 0;
  let resetPending = false;
  let retryPending = false;
  let saves: Promise<void> = Promise.resolve();

  const save = (game: Game): Promise<void> => {
    const raw = JSON.stringify(game);
    saves = saves
      .then(() => ports.write(raw))
      .then(() => update({ session: reduceSession(state.session, { type: 'save-succeeded' }) }))
      .catch((error: unknown) => {
        ports.warn('Progress could not be saved:', error);
        update({ session: reduceSession(state.session, { type: 'save-failed', message: SAVE_FAILED }) });
      });
    return saves;
  };

  // Every change that leaves the game ready with a new state queues a save, in order.
  function update(patch: Partial<ProgressState>): void {
    const previous = state;
    state = { ...state, ...patch };
    const ready = state.loading.status === 'ready';
    const fresh = previous.loading.status !== 'ready' || previous.session.game !== state.session.game;
    if (ready && fresh) void save(state.session.game);
    for (const listener of listeners) listener();
  }

  const send = (event: SessionAction): void => {
    const session = reduceSession(state.session, event);
    if (session !== state.session) update({ session });
  };

  const load = (): void => {
    const version = ++loadVersion;
    loadPending = true;
    void Promise.resolve()
      .then(async () => {
        if (version !== loadVersion) return null;
        return (await ports.read()) ?? (await ports.readLegacy());
      })
      .then((raw) => {
        if (version !== loadVersion) return;
        if (raw !== null) {
          const decoded = decodeGame(raw);
          if (!decoded.ok) {
            loadPending = false;
            update({ loading: { status: 'error', failure: decoded.failure } });
            return;
          }
          send({ type: 'restore', game: updateGame(decoded.game, { type: 'new-day', date: ports.today() }) });
          if (decoded.migrated)
            send({
              type: 'notice',
              message: Object.keys(decoded.game.bank).length
                ? 'the fruitlands grew: bags, gear, crafting and chests. your items are in the bank.'
                : 'welcome to the fruitlands. today’s steps are in your pouch.',
            });
        }
        loadPending = false;
        update({ loading: { status: 'ready' } });
      })
      .catch((error: unknown) => {
        if (version !== loadVersion) return;
        ports.warn('Progress could not be read:', error);
        loadPending = false;
        update({ loading: { status: 'error', failure: { kind: 'storage' } } });
      });
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    cancelLoad() {
      loadVersion += 1;
    },
    retryLoad() {
      if (state.loading.status !== 'error' || loadPending || resetPending) return;
      update({ resetError: null, loading: { status: 'loading' } });
      load();
    },
    play(action) {
      const { session, rejection } = playSession(state.session, action, ports.demo);
      if (session !== state.session) update({ session });
      return rejection;
    },
    send,
    refreshDay() {
      const date = ports.today();
      if (date !== state.today) update({ today: date });
      send({ type: 'play', action: { type: 'new-day', date }, demo: ports.demo });
    },
    retrySave() {
      if (state.loading.status !== 'ready' || retryPending) return;
      retryPending = true;
      update({ retryingSave: true });
      void save(state.session.game).then(() => {
        retryPending = false;
        update({ retryingSave: false });
      });
    },
    reset({ stopSteps, clearWalk }) {
      if (resetPending || loadPending) return;
      if (!clearWalk) {
        update({ resetError: 'your walk is still opening. try erasing it again.' });
        return;
      }
      resetPending = true;
      update({ resetting: true, resetError: null });
      void eraseJourney({
        stopSteps,
        clearWalk,
        resetGame: () => {
          const date = ports.today();
          send({ type: 'restore', game: ports.fresh(date) });
          update({ today: date, loading: { status: 'ready' } });
          send({
            type: 'notice',
            message: ports.demo
              ? 'a fresh demo. your bruh is ready.'
              : 'a new adventure. one step at a time.',
          });
        },
      })
        .then((result) => {
          if (!result.ok) update({ resetError: result.message });
        })
        .catch(() => update({ resetError: 'couldn’t erase your journey. try again.' }))
        .finally(() => {
          resetPending = false;
          update({ resetting: false });
        });
    },
  };
}
