// Party login storage for native builds: Convex Auth's tokens live in SecureStore
// (iOS keychain, Android Keystore-encrypted SharedPreferences), and logins saved by
// earlier builds move there from AsyncStorage.
//
// Convex Auth: "In React Native we recommend wrapping expo-secure-store."
//   https://labs.convex.dev/auth/api_reference/react#tokenstorage
// SecureStore (SDK 58): https://docs.expo.dev/versions/v58.0.0/sdk/securestore/
//
// A guest login cannot be recovered, and Convex Auth rotates the refresh token on
// every refresh, so an older copy is worse than none. One rule keeps the newest copy
// readable through any crash or failure: while AsyncStorage still holds a key, its
// value is at least as new as SecureStore's. Reads therefore prefer AsyncStorage,
// and writes update it before SecureStore whenever it may hold the key.

export type TokenStore = Readonly<{
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}>;
export type LegacyStore = TokenStore & Readonly<{ getAllKeys: () => Promise<readonly string[]> }>;
type Log = (message: string, error?: unknown) => void;

// Every key Convex Auth writes starts with this (`__convexAuthJWT_<namespace>`,
// `__convexAuthRefreshToken_<namespace>`, ...), and its namespace keeps only
// letters and digits, so the keys fit SecureStore's alphabet.
const AUTH_PREFIX = '__convexAuth';
const SECURE_KEY = /^[A-Za-z0-9._-]+$/;
// SecureStore docs: "some iOS releases refused values above roughly 2048 bytes."
// Measured locally, the JWT is 570 bytes and the refresh token 65 (RS256 signature
// plus fixed-length Convex ids), so this guard is not expected to fire.
export const SECURE_VALUE_LIMIT = 2048;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function createMigratingTokenStorage(
  secure: TokenStore,
  legacy: LegacyStore,
  log: Log = (message, error) => console.error(message, error),
): TokenStore {
  // Keys AsyncStorage may still hold. Until its key list has been read, assume any.
  let legacyKeys: Set<string> | null = null;
  const mayHoldLegacy = (key: string): boolean => legacyKeys === null || legacyKeys.has(key);
  const legacyCleared = (key: string): void => {
    legacyKeys?.delete(key);
  };
  const legacyHeld = (key: string): void => {
    legacyKeys?.add(key);
  };

  // Copy, read back, then delete. Each step leaves the AsyncStorage value in place
  // until SecureStore is known to hold the same value, so a crash or failure at any
  // point is finished by the next launch.
  async function migrate(key: string, value: string): Promise<void> {
    if (!SECURE_KEY.test(key) || byteLength(value) > SECURE_VALUE_LIMIT) {
      log(`Party login ${key} stays in AsyncStorage: SecureStore cannot hold it.`);
      return;
    }
    try {
      await secure.setItem(key, value);
      if ((await secure.getItem(key)) !== value) throw new Error('SecureStore read back a different value.');
    } catch (error) {
      log(
        `Party login ${key} could not move to SecureStore. It stays in AsyncStorage and moves on a later launch.`,
        error,
      );
      return;
    }
    try {
      await legacy.removeItem(key);
      legacyCleared(key);
    } catch (error) {
      // Both copies match, so either may be read; the next launch deletes this one.
      log(`Party login ${key} moved to SecureStore, but its AsyncStorage copy could not be deleted.`, error);
    }
  }

  async function migrateAll(): Promise<void> {
    let keys: readonly string[];
    try {
      keys = await legacy.getAllKeys();
    } catch (error) {
      log('Saved party logins could not be listed. They move when each one is read.', error);
      return;
    }
    const held = new Set(keys.filter((key) => key.startsWith(AUTH_PREFIX)));
    legacyKeys = held;
    for (const key of held) {
      let value: string | null;
      try {
        value = await legacy.getItem(key);
      } catch (error) {
        log(`Party login ${key} could not be read from AsyncStorage. It moves on a later launch.`, error);
        continue;
      }
      if (value === null) legacyCleared(key);
      else await migrate(key, value);
    }
  }

  // Convex Auth awaits each storage call in turn, but a mount read can overlap a
  // refresh. One queue keeps the migration ahead of every call and calls in order.
  let queue: Promise<unknown> = migrateAll();
  function serial<T>(run: () => Promise<T>): Promise<T> {
    const next = queue.then(run);
    queue = next.catch(() => {});
    return next;
  }

  async function read(key: string): Promise<string | null> {
    if (mayHoldLegacy(key)) {
      // A read error propagates: without it there is no telling which copy is newest.
      const value = await legacy.getItem(key);
      if (value !== null) {
        await migrate(key, value);
        return value;
      }
      legacyCleared(key);
    }
    return secure.getItem(key);
  }

  async function keepInLegacy(key: string, value: string, reason: string, cause?: unknown): Promise<void> {
    log(`Party login ${key} is saved in AsyncStorage instead: ${reason}`, cause);
    // A failure here leaves neither store with the new value, so it must reach Convex Auth.
    await legacy.setItem(key, value);
    legacyHeld(key);
    // Drop the older SecureStore copy so a reinstall cannot restore a used refresh token.
    await secure.removeItem(key).catch(() => {});
  }

  async function write(key: string, value: string): Promise<void> {
    if (!SECURE_KEY.test(key)) return keepInLegacy(key, value, 'SecureStore does not accept this key.');
    if (byteLength(value) > SECURE_VALUE_LIMIT)
      return keepInLegacy(key, value, `the value is over ${SECURE_VALUE_LIMIT} bytes.`);
    // Keep the rule: while AsyncStorage holds the key, it holds the newest value.
    let legacyFirst = mayHoldLegacy(key);
    if (legacyFirst)
      try {
        await legacy.setItem(key, value);
      } catch (error) {
        // An older value must not stay where reads look first. If it cannot be
        // deleted either, the error reaches Convex Auth and the old login stays as it was.
        await legacy.removeItem(key);
        legacyCleared(key);
        legacyFirst = false;
        log(`Party login ${key} could not be updated in AsyncStorage, so that copy was deleted.`, error);
      }
    try {
      await secure.setItem(key, value);
    } catch (error) {
      if (legacyFirst) {
        legacyHeld(key);
        log(`Party login ${key} could not be saved to SecureStore. It stays in AsyncStorage.`, error);
        await secure.removeItem(key).catch(() => {});
        return;
      }
      return keepInLegacy(key, value, 'SecureStore rejected it.', error);
    }
    if (!legacyFirst) return;
    try {
      await legacy.removeItem(key);
      legacyCleared(key);
    } catch (error) {
      legacyHeld(key);
      log(`Party login ${key} is in SecureStore, but its AsyncStorage copy could not be deleted.`, error);
    }
  }

  // SecureStore first: if the second delete fails, the remaining copy is the newest
  // one rather than an older SecureStore value. Both are tried; the first error throws.
  async function remove(key: string): Promise<void> {
    let failure: unknown = null;
    try {
      await secure.removeItem(key);
    } catch (error) {
      failure = error;
    }
    try {
      await legacy.removeItem(key);
      legacyCleared(key);
    } catch (error) {
      failure ??= error;
    }
    if (failure !== null) throw failure;
  }

  return {
    getItem: (key) => serial(() => read(key)),
    setItem: (key, value) => serial(() => write(key, value)),
    removeItem: (key) => serial(() => remove(key)),
  };
}
