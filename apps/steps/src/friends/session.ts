export class PartyAuthError extends Error {}
type Storage = Readonly<{
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}>;
export type PartyStorage = Readonly<{
  storage: Storage;
  failed: () => boolean;
  retry: () => void;
  subscribe: (callback: () => void) => () => void;
}>;

// Convex Auth starts this read from an unawaited effect. Keep its original read
// pending on failure, expose the error to the party UI, and retry the same read
// on Refresh. Never treat unreadable saved credentials as a new guest.
export function createPartyStorage(base: Storage): PartyStorage {
  const listeners = new Set<() => void>();
  let status: 'idle' | 'reading' | 'ready' | 'error' = 'idle';
  let key: string | null = null;
  let pending: Promise<string | null> | null = null;
  let resolve: ((value: string | null) => void) | null = null;
  const publish = (): void => {
    for (const listener of listeners) listener();
  };
  const read = (): void => {
    if (!key || status === 'reading' || status === 'ready') return;
    status = 'reading';
    publish();
    void base.getItem(key).then(
      (value) => {
        status = 'ready';
        resolve?.(value);
        publish();
      },
      () => {
        status = 'error';
        publish();
      },
    );
  };
  return {
    storage: {
      ...base,
      getItem(next) {
        if (!next.startsWith('__convexAuthJWT_') || status === 'ready') return base.getItem(next);
        if (!pending) {
          key = next;
          pending = new Promise((complete) => {
            resolve = complete;
          });
          read();
        }
        return pending;
      },
    },
    failed: () => status === 'error',
    retry: () => {
      if (status === 'error') read();
    },
    subscribe(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
}

export type PartySession = Readonly<{
  ready: (signal: AbortSignal) => Promise<boolean>;
  signIn: (signal: AbortSignal) => Promise<void>;
  signOut: () => Promise<void>;
  onSignedOut: (callback: () => void) => () => void;
}>;
type AuthState = Readonly<{ isLoading: boolean; isAuthenticated: boolean }>;

export function createPartySession(
  actions: Readonly<{ signIn: () => Promise<{ signingIn: boolean }>; signOut: () => Promise<void> }>,
  storage: PartyStorage,
): PartySession & Readonly<{ update: (state: AuthState) => void }> {
  let state: AuthState = { isLoading: true, isAuthenticated: false };
  const listeners = new Set<() => void>();
  const signedOut = new Set<() => void>();
  function wait(signal: AbortSignal, requireAuthentication = false): Promise<boolean> {
    storage.retry();
    return new Promise((resolve, reject) => {
      const finish = (error?: Error): void => {
        listeners.delete(check);
        unsubscribe();
        signal.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(state.isAuthenticated);
      };
      const abort = (): void => finish(new Error('Party login canceled.'));
      const check = (): void => {
        if (signal.aborted) abort();
        else if (storage.failed()) finish(new PartyAuthError('Saved party login could not be read.'));
        else if (!state.isLoading && (!requireAuthentication || state.isAuthenticated)) finish();
      };
      const unsubscribe = storage.subscribe(check);
      listeners.add(check);
      signal.addEventListener('abort', abort, { once: true });
      check();
    });
  }
  return {
    ready: wait,
    async signIn(signal) {
      try {
        const result = await actions.signIn();
        if (!result.signingIn) throw new PartyAuthError('Party guest login was not created.');
      } catch (error) {
        throw new PartyAuthError('Party login could not open.', { cause: error });
      }
      await wait(signal, true);
    },
    signOut: actions.signOut,
    onSignedOut(callback) {
      signedOut.add(callback);
      return () => {
        signedOut.delete(callback);
      };
    },
    update(next) {
      const wasSignedIn = state.isAuthenticated;
      state = next;
      for (const listener of listeners) listener();
      if (wasSignedIn && !next.isLoading && !next.isAuthenticated)
        for (const callback of signedOut) callback();
    },
  };
}
