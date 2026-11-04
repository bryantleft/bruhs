import {
  decodeWalk,
  type Fix,
  finishWalk,
  isFix,
  MAX_ROUTE_ACCURACY,
  pauseWalk,
  recordFix,
  resumeWalk,
  startWalk,
  type Walk,
} from './walk.ts';

export type LocationState =
  | Readonly<{ status: 'idle' | 'requesting' | 'watching' }>
  | Readonly<{ status: 'weak'; accuracy: number }>
  | Readonly<{ status: 'error'; message: string; settings: boolean }>;
export type SaveState =
  | Readonly<{ status: 'saved' | 'saving' }>
  | Readonly<{ status: 'error'; message: string }>;
export type ExplorerState = Readonly<{
  loading: 'loading' | 'ready' | 'error';
  loadError: string | null;
  walk: Walk | null;
  location: LocationState;
  save: SaveState;
}>;
export type Subscription = Readonly<{ remove: () => void }>;
export type LocationPermission =
  | Readonly<{ status: 'granted' | 'prompt' }>
  | Readonly<{ status: 'denied'; canAskAgain: boolean }>;
export type LocationFailure = 'permission' | 'unavailable';
export type LocationAvailability = 'available' | 'disabled' | 'unsupported';
export type RecorderPorts = Readonly<{
  read: () => Promise<string | null>;
  write: (raw: string) => Promise<void>;
  remove: () => Promise<void>;
  availability: () => Promise<LocationAvailability>;
  requestPermission: () => Promise<LocationPermission>;
  watch: (fix: (fix: unknown) => void, error: (reason: LocationFailure) => void) => Promise<Subscription>;
  now: () => number;
}>;
export type LocationPorts = Pick<RecorderPorts, 'availability' | 'requestPermission' | 'watch'>;
export type ClearWalkResult = Readonly<{ ok: true }> | Readonly<{ ok: false; message: string }>;

export const EMPTY_EXPLORER: ExplorerState = {
  loading: 'loading',
  loadError: null,
  walk: null,
  location: { status: 'idle' },
  save: { status: 'saved' },
};

export type Recorder = Readonly<{
  load: () => Promise<void>;
  start: () => Promise<void>;
  pause: () => void;
  finish: () => void;
  retrySave: () => void;
  clear: () => Promise<ClearWalkResult>;
  dispose: () => void;
}>;

// While recording, the route is written every few fixes instead of on each one: a whole-walk
// write per fix grows with the walk. Pause, finish, backgrounding and dispose always write.
export const SAVE_EVERY_FIXES = 10;
export const SAVE_EVERY_MS = 30_000;

export function createRecorder(ports: RecorderPorts, changed: (state: ExplorerState) => void): Recorder {
  let state = EMPTY_EXPLORER;
  let alive = true;
  let epoch = 0;
  let subscription: Subscription | null = null;
  let writes = Promise.resolve();
  let writing = false;
  let pending: Readonly<{ id: number; walk: Walk }> | null = null;
  let writeId = 0;
  let loadId = 0;
  // Fixes recorded since the last write, and the walk time that write covered.
  let unsaved = 0;
  let savedAt = 0;
  const publish = (next: ExplorerState): void => {
    state = next;
    if (alive) changed(state);
  };
  const persist = (walk: Walk): void => {
    unsaved = 0;
    savedAt = walk.updatedAt;
    const id = ++writeId;
    pending = { id, walk };
    publish({ ...state, save: { status: 'saving' } });
    if (writing) return;
    writing = true;
    // Keep one in-flight write and the newest whole route while storage is busy.
    writes = writes.then(async () => {
      while (pending) {
        const next = pending;
        pending = null;
        try {
          await ports.write(JSON.stringify(next.walk));
          if (next.id === writeId) publish({ ...state, save: { status: 'saved' } });
        } catch (error: unknown) {
          console.warn('Walk could not be saved:', error);
          if (next.id === writeId)
            publish({
              ...state,
              save: {
                status: 'error',
                message: 'couldn’t save your walk. free up space on this device, then retry.',
              },
            });
        }
      }
      writing = false;
    });
  };
  const commit = (walk: Walk): void => {
    publish({ ...state, walk });
    persist(walk);
  };
  const stop = (): void => {
    epoch += 1;
    subscription?.remove();
    subscription = null;
  };
  const pause = (): void => {
    stop();
    publish({ ...state, location: { status: 'idle' } });
    if (state.walk?.status === 'recording') commit(pauseWalk(state.walk, ports.now()));
  };
  const locationError = (message: string, settings = false): void => {
    pause();
    publish({ ...state, location: { status: 'error', message, settings } });
  };
  return {
    async load(): Promise<void> {
      if (!alive || state.walk?.status === 'recording') return;
      const request = ++loadId;
      publish({ ...state, loading: 'loading' });
      try {
        const raw = await ports.read();
        if (!alive || request !== loadId) return;
        const decoded = raw === null ? null : decodeWalk(raw);
        if (decoded && !decoded.ok) {
          publish({ ...state, loading: 'error', loadError: decoded.message });
          return;
        }
        publish({ ...state, loading: 'ready', loadError: null, walk: decoded?.ok ? decoded.walk : null });
      } catch (error: unknown) {
        console.warn('Walk could not be read:', error);
        if (alive && request === loadId)
          publish({
            ...state,
            loading: 'error',
            loadError: 'couldn’t open this device’s storage. try opening your walk again.',
          });
      }
    },
    async start(): Promise<void> {
      if (
        !alive ||
        state.loading !== 'ready' ||
        state.location.status === 'requesting' ||
        state.walk?.status === 'recording'
      )
        return;
      const request = ++epoch;
      publish({ ...state, location: { status: 'requesting' } });
      try {
        const availability = await ports.availability();
        if (!alive || request !== epoch) return;
        if (availability === 'unsupported') {
          locationError('location isn’t available here. try another browser or the mobile app.');
          return;
        }
        if (availability === 'disabled') {
          locationError('location services are off. turn them on, then start your walk again.', true);
          return;
        }
        const permission = await ports.requestPermission();
        if (!alive || request !== epoch) return;
        if (permission.status === 'denied') {
          locationError(
            'allow location access to draw your route. your step progress is safe.',
            !permission.canAskAgain,
          );
          return;
        }
        const begin = (at: number): void => {
          publish({ ...state, location: { status: 'watching' } });
          commit(state.walk?.status === 'paused' ? resumeWalk(state.walk, at) : startWalk(at));
        };
        // Keep the previous recap until a real fix confirms access. Permission
        // can be revoked between its check and the watch starting.
        const watcher = await ports.watch(
          (value) => {
            if (!alive || request !== epoch || !isFix(value)) return;
            const fix: Fix = value;
            if (state.location.status === 'requesting') begin(fix.timestamp);
            if (!state.walk || state.walk.status !== 'recording') return;
            publish({
              ...state,
              location:
                fix.accuracy > MAX_ROUTE_ACCURACY
                  ? { status: 'weak', accuracy: fix.accuracy }
                  : { status: 'watching' },
            });
            // A segment's first point is written at once, so a new or resumed walk is never
            // only in memory; later points wait for the next batch.
            const first = (state.walk.segments.at(-1)?.length ?? 0) === 0;
            const walk = recordFix(state.walk, fix);
            if (walk === state.walk) return;
            unsaved += 1;
            if (first || unsaved >= SAVE_EVERY_FIXES || walk.updatedAt - savedAt >= SAVE_EVERY_MS)
              commit(walk);
            else publish({ ...state, walk });
          },
          (reason) => {
            if (!alive || request !== epoch) return;
            if (reason === 'permission')
              locationError('allow location access to draw your route. your step progress is safe.', true);
            else locationError('GPS couldn’t find your location. try again.');
          },
        );
        if (!alive || request !== epoch) watcher.remove();
        else subscription = watcher;
      } catch (error: unknown) {
        console.warn('Location could not start:', error);
        if (alive && request === epoch) locationError('couldn’t start location. try again.');
      }
    },
    pause,
    finish(): void {
      if (state.loading !== 'ready') return;
      stop();
      publish({ ...state, location: { status: 'idle' } });
      if (state.walk && state.walk.status !== 'complete') commit(finishWalk(state.walk, ports.now()));
    },
    retrySave(): void {
      if (state.loading === 'ready' && state.walk && state.save.status !== 'saving') persist(state.walk);
    },
    async clear(): Promise<ClearWalkResult> {
      if (!alive || state.loading === 'loading')
        return { ok: false, message: 'your walk is still opening. try erasing it again.' };
      pause();
      loadId += 1;
      publish({ ...state, loading: 'loading', location: { status: 'idle' } });
      await writes;
      try {
        await ports.remove();
        if (alive) publish({ ...EMPTY_EXPLORER, loading: 'ready' });
        return { ok: true };
      } catch (error: unknown) {
        console.warn('Walk could not be deleted:', error);
        const message = 'couldn’t delete this walk. try deleting it again.';
        if (alive)
          publish({
            ...state,
            loading: state.walk ? 'ready' : 'error',
            loadError: message,
          });
        return { ok: false, message };
      }
    },
    dispose(): void {
      alive = false;
      pause();
    },
  };
}
