const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { ConvexError } = require('convex/values');
const { getFunctionName } = require('convex/server');
const { api } = require('bruhs-api/api');
const { createPartySession, createPartyStorage, PartyAuthError } = require('./session.ts');
const model = require('./model.ts');
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'client.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled)(
  (name) => {
    if (name === 'bruhs-api/api') return { api };
    if (name === 'convex/values') return { ConvexError };
    if (name === './model') return model;
    if (name === './session') return { PartyAuthError };
    throw Error(`Unexpected import ${name}`);
  },
  loaded,
  loaded.exports,
);
const { createPartyService, readPartyQuery } = loaded.exports;
const signal = () => new AbortController().signal;
const user = 'jh7opaqueconvexuser';
const party = 'kn7opaqueconvexparty';
const home = {
  userId: user,
  home: {
    profile: { id: user, name: 'moss', skin: 'pandan' },
    party: {
      id: party,
      invite_code: 'a'.repeat(32),
      created_at: '2026-10-26T12:00:00Z',
      synced_at: null,
      member_count: 1,
    },
  },
};

function harness({ authenticated = true, cached = home, pending = false } = {}) {
  const calls = { mutations: [], queries: [], signIn: 0, signOut: 0, stops: 0, uploads: [] };
  const listeners = new Set();
  const signedOut = new Set();
  let value = pending ? undefined : cached;
  let error;
  const client = {
    watchQuery(reference, args) {
      calls.queries.push({ name: getFunctionName(reference), args });
      return {
        localQueryResult() {
          if (error) throw error;
          return value;
        },
        onUpdate(callback) {
          listeners.add(callback);
          return () => {
            calls.stops++;
            listeners.delete(callback);
          };
        },
      };
    },
    async mutation(reference, args) {
      assert.notEqual(
        getFunctionName(reference),
        'outside:submit',
        'Health uploads must not enter the WebSocket replay queue',
      );
      calls.mutations.push({ name: getFunctionName(reference), args });
      if (error) throw error;
      return getFunctionName(reference) === 'outside:enter' ? home : true;
    },
  };
  const auth = {
    ready: async () => authenticated,
    async signIn() {
      calls.signIn++;
      authenticated = true;
    },
    async signOut() {
      calls.signOut++;
      authenticated = false;
      for (const callback of signedOut) callback();
    },
    onSignedOut(callback) {
      signedOut.add(callback);
      return () => signedOut.delete(callback);
    },
  };
  return {
    client,
    auth,
    calls,
    listeners,
    service: createPartyService(client, auth, async (userId, days, signal) => {
      calls.uploads.push({ userId, days, signal });
      return true;
    }),
    emit(next) {
      value = next;
      for (const callback of listeners) callback();
    },
    fail(next) {
      error = next;
      for (const callback of listeners) callback();
    },
  };
}

test('a fresh guest does not authenticate until Create/Join, and retry keeps the same guest', async () => {
  const h = harness({ authenticated: false });
  assert.deepEqual(await h.service.home(signal(), () => true), {
    ok: true,
    value: { userId: null, home: { profile: null, party: null } },
  });
  assert.equal(h.calls.queries.length, 0);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await h.service.enter({ kind: 'create', name: ' moss ', skin: 'pandan' }, signal())).ok,
      true,
    );
  assert.equal(h.calls.signIn, 1);
  assert.deepEqual(h.calls.mutations[0], {
    name: 'outside:enter',
    args: { kind: 'create', name: 'moss', skin: 'pandan' },
  });
});

test('canceling a read unsubscribes immediately and cannot clear credentials on a late response', async () => {
  const h = harness({ pending: true });
  const controller = new AbortController();
  const result = h.service.home(controller.signal, () => {
    throw Error('canceled reset');
  });
  await Promise.resolve();
  assert.equal(h.listeners.size, 1);
  controller.abort();
  assert.deepEqual(await result, { ok: false, error: 'network' });
  assert.equal(h.listeners.size, 0);
  h.fail(new ConvexError('sign_in_required'));
  assert.equal(h.calls.signOut, 0);
  assert.equal(h.calls.stops, 1);
});

test('cached query values and query errors always release the subscription', async () => {
  const h = harness();
  assert.equal((await h.service.home(signal(), () => false)).ok, true);
  assert.equal(h.calls.stops, 1);
  h.fail(new ConvexError('invalid_week'));
  assert.deepEqual(await h.service.home(signal(), () => false), { ok: false, error: 'data' });
  assert.equal(h.listeners.size, 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readPartyQuery(h.client, api.outside.home, {}, controller.signal));
  assert.equal(h.calls.queries.length, 2);
});

test('stale-session cleanup requires the read owner and never runs after cancellation', async () => {
  const h = harness();
  h.fail(new ConvexError('sign_in_required'));
  await h.service.home(signal(), () => false);
  assert.equal(h.calls.signOut, 0);
  let events = 0;
  const stop = h.service.onSignedOut(() => events++);
  assert.deepEqual(await h.service.home(signal(), () => true), { ok: false, error: 'session' });
  assert.equal(h.calls.signOut, 1);
  assert.equal(events, 1);
  stop();
});

test('only expected mutation fields are sent; Health submissions pin the captured user', async () => {
  const h = harness();
  const days = [{ date: '2026-10-26', steps: 123 }];
  assert.equal((await h.service.submit(user, days, signal())).ok, true);
  assert.equal(h.calls.uploads.length, 1);
  assert.equal(h.calls.uploads[0].userId, user);
  assert.deepEqual(h.calls.uploads[0].days, days);
  const controller = new AbortController();
  controller.abort();
  assert.equal((await h.service.submit(user, days, controller.signal)).ok, false);
  assert.equal(h.calls.uploads.length, 1);
  assert.equal((await h.service.depart(false, signal())).ok, true);
  assert.equal(h.calls.signOut, 0);
  assert.equal((await h.service.depart(true, signal())).ok, true);
  assert.equal(h.calls.signOut, 1);
});

test('invalid invites and membership errors retain their actionable UI meaning', async () => {
  for (const [message, expected] of [
    ['invite_not_found', 'invite'],
    ['already_in_party', 'membership'],
    ['not_in_party', 'session'],
    ['party_full', 'full'],
    ['rate_limited', 'busy'],
    ['invalid_profile', 'data'],
    ['invite_collision', 'unknown'],
  ]) {
    const h = harness();
    h.fail(new ConvexError(message));
    assert.deepEqual(
      await h.service.enter({ kind: 'join', name: 'moss', skin: 'pandan', invite: 'a'.repeat(32) }, signal()),
      { ok: false, error: expected },
    );
  }
});

test('server bugs are not reported as a lost connection, and their cause is logged', async () => {
  const warn = console.warn;
  const logged = [];
  console.warn = (...args) => logged.push(args);
  try {
    for (const [error, expected] of [
      [new Error('[CONVEX M(outside:enter)] Server Error'), 'unknown'],
      [new ConvexError('quota_exceeded'), 'unknown'],
      [new TypeError('Network request failed'), 'network'],
    ]) {
      const h = harness();
      h.fail(error);
      assert.deepEqual(await h.service.enter({ kind: 'create', name: 'moss', skin: 'pandan' }, signal()), {
        ok: false,
        error: expected,
      });
      assert.equal(logged.at(-1)?.[1], error);
    }
  } finally {
    console.warn = warn;
  }
  assert.equal(
    model.partyErrorCopy('unknown'),
    'the party server hit a problem. try again in a little while.',
  );
});

test('board decoding preserves the page total and rejects mismatched identities or malformed rows', async () => {
  const h = harness({
    cached: {
      rows: [{ user_id: user, name: 'moss', skin: 'pandan', steps: 0, place: 1, tied: 1, synced_at: null }],
      total: 21,
    },
  });
  const week = model.raceWeek(new Date('2026-10-27T12:00:00Z'));
  const page = await h.service.board(week, 20, signal());
  assert.equal(page.ok, true);
  assert.equal(page.value.total, 21);
  assert.equal(page.value.rows[0].steps, 0);
  assert.deepEqual(h.calls.queries[0].args, { start: week.start, end: week.end, offset: 20 });
  h.emit({ rows: [], total: -1 });
  assert.deepEqual(await h.service.board(week, 0, signal()), { ok: false, error: 'data' });
  h.emit({ ...home, userId: 'another-user' });
  assert.deepEqual(await h.service.home(signal(), () => false), { ok: false, error: 'data' });
});

function storageBase(read) {
  return {
    getItem: read,
    setItem: async () => {
      throw Error('unexpected credential write');
    },
    removeItem: async () => {
      throw Error('unexpected credential deletion');
    },
  };
}

test('an unreadable saved token is reported, then the same pending SDK read recovers without writes', async () => {
  let unavailable = true;
  let reads = 0;
  const store = createPartyStorage(
    storageBase(async () => {
      reads++;
      if (unavailable) throw Error('storage unavailable');
      return 'original-token';
    }),
  );
  const session = createPartySession(
    {
      signIn: async () => {
        throw Error('must not create a guest');
      },
      signOut: async () => {},
    },
    store,
  );
  const originalRead = store.storage.getItem('__convexAuthJWT_test');
  const first = session.ready(signal());
  await assert.rejects(first, PartyAuthError);
  assert.equal(store.failed(), true);
  assert.equal(reads, 1);
  unavailable = false;
  const second = session.ready(signal());
  assert.equal(await originalRead, 'original-token');
  session.update({ isLoading: false, isAuthenticated: true });
  assert.equal(await second, true);
  assert.equal(reads, 2);
});

test('sign-in waits for server confirmation and canceled waiters do not activate later', async () => {
  const store = createPartyStorage(storageBase(async () => null));
  const session = createPartySession(
    { signIn: async () => ({ signingIn: true }), signOut: async () => {} },
    store,
  );
  session.update({ isLoading: false, isAuthenticated: false });
  const controller = new AbortController();
  const canceled = session.signIn(controller.signal);
  await Promise.resolve();
  controller.abort();
  await assert.rejects(canceled, /canceled/);
  let finished = false;
  const fresh = session.signIn(signal()).then(() => {
    finished = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(finished, false);
  session.update({ isLoading: false, isAuthenticated: true });
  await fresh;
  assert.equal(finished, true);
  let signOuts = 0;
  const stop = session.onSignedOut(() => signOuts++);
  session.update({ isLoading: true, isAuthenticated: false });
  assert.equal(signOuts, 0);
  session.update({ isLoading: false, isAuthenticated: true });
  session.update({ isLoading: false, isAuthenticated: false });
  assert.equal(signOuts, 1);
  stop();
});
