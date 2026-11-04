import assert from 'node:assert/strict';
import test from 'node:test';
import { createPartyStorage } from './session.ts';
import {
  createMigratingTokenStorage,
  type LegacyStore,
  SECURE_VALUE_LIMIT,
  type TokenStore,
} from './tokenStorage.ts';

const JWT = '__convexAuthJWT_httpsearnestwren707convexcloud';
const REFRESH = '__convexAuthRefreshToken_httpsearnestwren707convexcloud';
const SAVE = 'bruhs-outside-game-v3';
type Op = 'get' | 'set' | 'remove' | 'keys';
type Fault = (op: Op, key: string) => 'fail' | 'crash' | undefined;

// A store over a Map that outlives the adapter, so a "relaunch" is a new adapter over
// the same data. A crash never settles, freezing the old adapter mid-step as a killed
// process would; a failure rejects.
function store(name: string, initial: Record<string, string> = {}, calls: string[] = []) {
  const data = new Map(Object.entries(initial));
  let fault: Fault = () => undefined;
  let corrupt = false;
  function run<T>(op: Op, key: string, body: () => T): Promise<T> {
    calls.push(`${name}.${op} ${key}`);
    const outcome = fault(op, key);
    if (outcome === 'crash') return new Promise(() => {});
    if (outcome === 'fail') return Promise.reject(new Error(`${name} ${op} failed`));
    return Promise.resolve(body());
  }
  const port: LegacyStore = {
    getItem: (key) => run('get', key, () => (corrupt && data.has(key) ? 'garbled' : (data.get(key) ?? null))),
    setItem: (key, value) => run('set', key, () => void data.set(key, value)),
    removeItem: (key) => run('remove', key, () => void data.delete(key)),
    getAllKeys: () => run('keys', '*', () => [...data.keys()]),
  };
  return {
    port,
    data,
    calls,
    setFault(next: Fault) {
      fault = next;
    },
    corruptReads() {
      corrupt = true;
    },
  };
}

function launch(secure: ReturnType<typeof store>, legacy: ReturnType<typeof store>) {
  const logs: string[] = [];
  const storage = createMigratingTokenStorage(secure.port as TokenStore, legacy.port, (message) => {
    logs.push(message);
  });
  return { storage, logs };
}

// What a build that kept the login in AsyncStorage leaves behind. Both stores write
// to one call log, so the order of steps across them can be checked.
function oldBuild() {
  const calls: string[] = [];
  return {
    calls,
    secure: store('secure', {}, calls),
    legacy: store('legacy', { [JWT]: 'jwt-1', [REFRESH]: 'refresh-1', [SAVE]: '{"v":3}' }, calls),
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('first launch copies each login key, reads it back, then deletes the AsyncStorage copy', async () => {
  const { calls, secure, legacy } = oldBuild();
  const { storage, logs } = launch(secure, legacy);
  assert.equal(await storage.getItem(JWT), 'jwt-1');
  assert.equal(await storage.getItem(REFRESH), 'refresh-1');
  assert.deepEqual(Object.fromEntries(secure.data), { [JWT]: 'jwt-1', [REFRESH]: 'refresh-1' });
  assert.deepEqual(Object.fromEntries(legacy.data), { [SAVE]: '{"v":3}' });
  // Both keys move before the first read is answered, the game save is never touched,
  // and each key goes copy, read back, delete.
  assert.deepEqual(calls.slice(0, 9), [
    'legacy.keys *',
    `legacy.get ${JWT}`,
    `secure.set ${JWT}`,
    `secure.get ${JWT}`,
    `legacy.remove ${JWT}`,
    `legacy.get ${REFRESH}`,
    `secure.set ${REFRESH}`,
    `secure.get ${REFRESH}`,
    `legacy.remove ${REFRESH}`,
  ]);
  assert.equal(
    calls.some((call) => call.endsWith(SAVE)),
    false,
  );
  assert.deepEqual(logs, []);
});

test('a second launch finds nothing to move and leaves the game save alone', async () => {
  const { calls, secure, legacy } = oldBuild();
  await launch(secure, legacy).storage.getItem(JWT);
  calls.length = 0;
  const { storage, logs } = launch(secure, legacy);
  assert.equal(await storage.getItem(JWT), 'jwt-1');
  assert.deepEqual(calls, ['legacy.keys *', `secure.get ${JWT}`]);
  assert.equal(legacy.data.get(SAVE), '{"v":3}');
  assert.deepEqual(logs, []);
});

const crashes: readonly (readonly [string, 'secure' | 'legacy', Op])[] = [
  ['before reading AsyncStorage', 'legacy', 'get'],
  ['after the copy, before the read-back', 'secure', 'get'],
  ['after the read-back, before the delete', 'legacy', 'remove'],
];
for (const [step, where, crashOp] of crashes) {
  test(`a crash ${step} is finished by the next launch without losing the login`, async () => {
    const { secure, legacy } = oldBuild();
    (where === 'secure' ? secure : legacy).setFault((op, key) =>
      op === crashOp && key === REFRESH ? 'crash' : undefined,
    );
    const crashed = launch(secure, legacy);
    let settled = false;
    void crashed.storage.getItem(JWT).then(() => {
      settled = true;
    });
    await tick();
    assert.equal(settled, false, 'the old process stopped mid-migration');
    secure.setFault(() => undefined);
    legacy.setFault(() => undefined);
    const { storage, logs } = launch(secure, legacy);
    assert.equal(await storage.getItem(REFRESH), 'refresh-1');
    assert.equal(await storage.getItem(JWT), 'jwt-1');
    assert.deepEqual(Object.fromEntries(secure.data), { [JWT]: 'jwt-1', [REFRESH]: 'refresh-1' });
    assert.deepEqual(Object.fromEntries(legacy.data), { [SAVE]: '{"v":3}' });
    assert.deepEqual(logs, []);
  });
}

test('when SecureStore rejects the copy, the login stays in AsyncStorage, is logged, and moves later', async () => {
  const { secure, legacy } = oldBuild();
  secure.setFault((op) => (op === 'set' ? 'fail' : undefined));
  const first = launch(secure, legacy);
  assert.equal(await first.storage.getItem(JWT), 'jwt-1');
  assert.equal(await first.storage.getItem(REFRESH), 'refresh-1');
  assert.equal(legacy.data.get(JWT), 'jwt-1');
  assert.equal(legacy.data.get(REFRESH), 'refresh-1');
  assert.ok(first.logs.some((line) => line.includes('could not move to SecureStore')));
  secure.setFault(() => undefined);
  const second = launch(secure, legacy);
  assert.equal(await second.storage.getItem(REFRESH), 'refresh-1');
  assert.equal(secure.data.get(REFRESH), 'refresh-1');
  assert.equal(legacy.data.has(REFRESH), false);
});

test('a read-back that does not match keeps the AsyncStorage copy', async () => {
  const { secure, legacy } = oldBuild();
  secure.corruptReads();
  const { storage, logs } = launch(secure, legacy);
  assert.equal(await storage.getItem(REFRESH), 'refresh-1');
  assert.equal(legacy.data.get(REFRESH), 'refresh-1');
  assert.ok(logs.some((line) => line.includes('could not move to SecureStore')));
});

test('a failed delete after a good copy is logged and retried on the next launch', async () => {
  const { secure, legacy } = oldBuild();
  legacy.setFault((op) => (op === 'remove' ? 'fail' : undefined));
  const first = launch(secure, legacy);
  assert.equal(await first.storage.getItem(REFRESH), 'refresh-1');
  assert.equal(secure.data.get(REFRESH), 'refresh-1');
  assert.equal(legacy.data.get(REFRESH), 'refresh-1');
  assert.ok(first.logs.some((line) => line.includes('could not be deleted')));
  legacy.setFault(() => undefined);
  await launch(secure, legacy).storage.getItem(REFRESH);
  assert.equal(legacy.data.has(REFRESH), false);
});

test('if the key list cannot be read, each key still moves when Convex Auth reads it', async () => {
  const { secure, legacy } = oldBuild();
  legacy.setFault((op) => (op === 'keys' ? 'fail' : undefined));
  const { storage, logs } = launch(secure, legacy);
  assert.equal(await storage.getItem(JWT), 'jwt-1');
  assert.equal(secure.data.get(JWT), 'jwt-1');
  assert.equal(legacy.data.has(JWT), false);
  assert.ok(logs.some((line) => line.includes('could not be listed')));
});

test('an unreadable AsyncStorage login is never treated as missing', async () => {
  const { secure, legacy } = oldBuild();
  legacy.setFault((op, key) => (op === 'get' && key === JWT ? 'fail' : undefined));
  const { storage, logs } = launch(secure, legacy);
  await assert.rejects(storage.getItem(JWT), /legacy get failed/);
  assert.equal(legacy.data.get(JWT), 'jwt-1');
  assert.ok(logs.some((line) => line.includes('could not be read from AsyncStorage')));
  // The party screen's retry reads again once storage recovers.
  legacy.setFault(() => undefined);
  assert.equal(await storage.getItem(JWT), 'jwt-1');
  assert.equal(secure.data.get(JWT), 'jwt-1');
  assert.equal(legacy.data.has(JWT), false);
});

test('after the move, new tokens go to SecureStore only and never back to AsyncStorage', async () => {
  const { calls, secure, legacy } = oldBuild();
  const { storage } = launch(secure, legacy);
  await storage.getItem(JWT);
  calls.length = 0;
  await storage.setItem(JWT, 'jwt-2');
  await storage.setItem(REFRESH, 'refresh-2');
  assert.deepEqual(Object.fromEntries(secure.data), { [JWT]: 'jwt-2', [REFRESH]: 'refresh-2' });
  assert.deepEqual(
    calls.filter((call) => call.startsWith('legacy.')),
    [],
  );
  assert.equal(legacy.data.has(REFRESH), false);
  assert.equal(await storage.getItem(REFRESH), 'refresh-2');
});

test('a fresh install signs in straight into SecureStore', async () => {
  const secure = store('secure');
  const legacy = store('legacy');
  const { storage, logs } = launch(secure, legacy);
  assert.equal(await storage.getItem(JWT), null);
  await storage.setItem(JWT, 'jwt-1');
  await storage.setItem(REFRESH, 'refresh-1');
  assert.deepEqual(Object.fromEntries(secure.data), { [JWT]: 'jwt-1', [REFRESH]: 'refresh-1' });
  assert.equal(legacy.data.size, 0);
  assert.deepEqual(logs, []);
});

test('a token SecureStore rejects is kept in AsyncStorage, the older keychain copy is dropped, and it moves later', async () => {
  const { secure, legacy } = oldBuild();
  const first = launch(secure, legacy);
  await first.storage.getItem(REFRESH);
  secure.setFault((op) => (op === 'set' ? 'fail' : undefined));
  await first.storage.setItem(REFRESH, 'refresh-2');
  assert.equal(legacy.data.get(REFRESH), 'refresh-2');
  assert.equal(secure.data.has(REFRESH), false, 'a used refresh token must not survive in the keychain');
  assert.equal(await first.storage.getItem(REFRESH), 'refresh-2');
  assert.ok(first.logs.some((line) => line.includes('saved in AsyncStorage instead')));
  secure.setFault(() => undefined);
  const second = launch(secure, legacy);
  assert.equal(await second.storage.getItem(REFRESH), 'refresh-2');
  assert.equal(secure.data.get(REFRESH), 'refresh-2');
  assert.equal(legacy.data.has(REFRESH), false);
});

test('a token SecureStore rejects with AsyncStorage unwritable fails loudly instead of being dropped', async () => {
  const secure = store('secure');
  const legacy = store('legacy');
  const { storage } = launch(secure, legacy);
  await storage.getItem(REFRESH);
  secure.setFault((op) => (op === 'set' ? 'fail' : undefined));
  legacy.setFault((op) => (op === 'set' ? 'fail' : undefined));
  await assert.rejects(storage.setItem(REFRESH, 'refresh-2'), /legacy set failed/);
});

test('while AsyncStorage still holds a key, a refresh updates it first so no crash reads an older token', async () => {
  const { secure, legacy } = oldBuild();
  // The move failed this launch, so AsyncStorage holds the newest copy.
  secure.setFault((op) => (op === 'set' ? 'fail' : undefined));
  const first = launch(secure, legacy);
  await first.storage.getItem(REFRESH);
  // SecureStore recovers, and the process dies right after saving the new token there.
  secure.setFault(() => undefined);
  legacy.setFault((op, key) => (op === 'remove' && key === REFRESH ? 'crash' : undefined));
  void first.storage.setItem(REFRESH, 'refresh-2');
  await tick();
  assert.equal(legacy.data.get(REFRESH), 'refresh-2');
  assert.equal(secure.data.get(REFRESH), 'refresh-2');
  legacy.setFault(() => undefined);
  const second = launch(secure, legacy);
  assert.equal(await second.storage.getItem(REFRESH), 'refresh-2');
  assert.equal(legacy.data.has(REFRESH), false);
});

test('a crash after updating AsyncStorage but before SecureStore still reads the new token', async () => {
  const { secure, legacy } = oldBuild();
  secure.setFault((op) => (op === 'set' ? 'fail' : undefined));
  const first = launch(secure, legacy);
  await first.storage.getItem(REFRESH);
  secure.setFault((op) => (op === 'set' ? 'crash' : undefined));
  void first.storage.setItem(REFRESH, 'refresh-2');
  await tick();
  secure.setFault(() => undefined);
  const second = launch(secure, legacy);
  assert.equal(await second.storage.getItem(REFRESH), 'refresh-2');
  assert.equal(secure.data.get(REFRESH), 'refresh-2');
});

test('a token over the SecureStore size limit stays in AsyncStorage with a log', async () => {
  const secure = store('secure');
  const legacy = store('legacy');
  const { storage, logs } = launch(secure, legacy);
  const large = 'x'.repeat(SECURE_VALUE_LIMIT + 1);
  await storage.setItem(JWT, large);
  assert.equal(legacy.data.get(JWT), large);
  assert.equal(secure.data.has(JWT), false);
  assert.equal(await storage.getItem(JWT), large);
  assert.ok(logs.some((line) => line.includes(`over ${SECURE_VALUE_LIMIT} bytes`)));
  // A measured Convex Auth JWT (570 bytes, 589 with the hosted issuer) fits.
  await storage.setItem(REFRESH, 'y'.repeat(589));
  assert.equal(secure.data.get(REFRESH)?.length, 589);
});

test('sign-out clears both stores, and a SecureStore failure still clears AsyncStorage and throws', async () => {
  const { secure, legacy } = oldBuild();
  secure.setFault((op) => (op === 'set' ? 'fail' : undefined));
  const { storage } = launch(secure, legacy);
  await storage.getItem(JWT);
  secure.setFault(() => undefined);
  secure.data.set(JWT, 'jwt-old');
  await storage.removeItem(JWT);
  assert.equal(secure.data.has(JWT), false);
  assert.equal(legacy.data.has(JWT), false);
  assert.equal(await storage.getItem(JWT), null);
  secure.data.set(REFRESH, 'refresh-1');
  secure.setFault((op) => (op === 'remove' ? 'fail' : undefined));
  await assert.rejects(storage.removeItem(REFRESH), /secure remove failed/);
  assert.equal(legacy.data.has(REFRESH), false);
  assert.equal(legacy.data.get(SAVE), '{"v":3}');
});

test('a token saved while the move is still running is not overwritten by the old one', async () => {
  const { secure, legacy } = oldBuild();
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow = legacy.port.getItem;
  legacy.port = {
    ...legacy.port,
    async getItem(key) {
      await gate;
      return slow(key);
    },
  };
  const { storage } = launch(secure, legacy);
  const saved = storage.setItem(REFRESH, 'refresh-2');
  release();
  await saved;
  assert.equal(secure.data.get(REFRESH), 'refresh-2');
  assert.equal(legacy.data.has(REFRESH), false);
  assert.equal(await storage.getItem(REFRESH), 'refresh-2');
});

test('the party login gate reads a moved login and keeps an unreadable one pending for retry', async () => {
  const { secure, legacy } = oldBuild();
  legacy.setFault((op, key) => (op === 'get' && key === JWT ? 'fail' : undefined));
  const party = createPartyStorage(launch(secure, legacy).storage);
  const read = party.storage.getItem(JWT);
  await tick();
  assert.equal(party.failed(), true);
  legacy.setFault(() => undefined);
  party.retry();
  assert.equal(await read, 'jwt-1');
  assert.equal(secure.data.get(JWT), 'jwt-1');
});
