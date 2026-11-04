const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const plain = (value) => JSON.parse(JSON.stringify(value));

// This harness exercises provider control flow with simulated hooks and native APIs.
// Browser and physical-device scheduling are separate validation layers.
function loadCompiled(name, mocks = {}, jsx = () => null) {
  const module = { exports: {} };
  const req = (raw) => {
    const id = raw.replace(/\.tsx?$/, '');
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id === './model') return model;
    if (id === './sharing') return sharing;
    if (id === './controller') return loadCompiled('controller', mocks);
    if (id === '../game/game') return require('../game/game.ts');
    throw Error(`Unmocked import ${id}`);
  };
  const file = path.join(__dirname, name + (name === 'PartyProvider' ? '.tsx' : '.ts'));
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      jsxFactory: '__jsx',
    },
  }).outputText;
  new Function('require', 'module', 'exports', '__jsx', code)(req, module, module.exports, jsx);
  return module.exports;
}
const model = loadCompiled('model');
const sharing = loadCompiled('sharing');
function deferred() {
  let resolve, reject;
  const promise = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}
function harness({ now = '2026-10-28T12:00:00Z', demo = false, read, board, home, hasSession = true } = {}) {
  let authenticated = hasSession;
  let time = Date.parse(now);
  const RealDate = Date;
  class ReviewDate extends RealDate {
    constructor(...a) {
      super(...(a.length ? a : [time]));
    }
    static now() {
      return time;
    }
  }
  const hooks = [],
    effects = [];
  let cursor = 0,
    dirty = false,
    destroyed = false,
    value,
    renderCount = 0;
  const listeners = new Set(),
    pauseListeners = new Set(),
    timers = new Map();
  let timerId = 0;
  const actor = '11111111-1111-4111-8111-111111111111',
    party = '22222222-2222-4222-8222-222222222222';
  const identity = {
    userId: actor,
    home: {
      profile: { id: actor, name: 'reviewer', skin: 'original' },
      party: { id: party, invite: 'a'.repeat(32), createdAt: now, syncedAt: null, members: 40 },
    },
  };
  const rows = Array.from({ length: 20 }, (_, i) => ({
    id: `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    name: `member ${i}`,
    skin: 'original',
    steps: i,
    place: 20 - i,
    tied: 1,
    syncedAt: now,
  }));
  const calls = { home: [], board: [], read: [], submit: [], foreground: [], depart: [] };
  let signedOut;
  const appState = {
    currentState: 'active',
    addEventListener(_type, fn) {
      listeners.add(fn);
      return {
        remove() {
          listeners.delete(fn);
        },
      };
    },
  };
  const game = {
    game: { health: { source: 'apple-health', enabled: true, startedOn: '2026-10-26', syncedAt: now } },
    demo,
    loading: { status: 'ready' },
    resetting: false,
    subscribeHealthPause(fn) {
      pauseListeners.add(fn);
      return () => pauseListeners.delete(fn);
    },
  };
  const service = {
    async home(signal, beginSessionReset) {
      calls.home.push({ aborted: signal.aborted });
      return home ? home(signal, identity, beginSessionReset) : { ok: true, value: identity };
    },
    async board(week, offset, signal) {
      calls.board.push({ week: plain(week), offset });
      return board ? board(week, offset, signal, rows) : { ok: true, value: { rows, total: 40 } };
    },
    async submit(userId, days, signal) {
      calls.submit.push({ userId, days: plain(days), aborted: signal.aborted });
      return { ok: true, value: true };
    },
    async enter() {
      return { ok: true, value: identity };
    },
    async depart(removeAccount, signal) {
      calls.depart.push({ removeAccount, aborted: signal.aborted });
      return { ok: true, value: true };
    },
    onSignedOut(fn) {
      signedOut = fn;
      return () => {
        signedOut = null;
      };
    },
    foreground(active) {
      calls.foreground.push(active);
    },
  };
  const readHealth = async (request) => {
    calls.read.push(plain(request));
    return read
      ? read(request)
      : {
          status: 'read',
          source: 'apple-health',
          at: new ReviewDate().toISOString(),
          days: [{ date: model.raceWeek(new ReviewDate()).start, steps: 50 }],
        };
  };
  const react = {
    useCallback(fn, deps) {
      return react.useMemo(() => fn, deps);
    },
    createContext() {
      return { Provider: 'Provider' };
    },
    useContext() {
      return value;
    },
    useState(init) {
      const i = cursor++;
      if (!hooks[i]) hooks[i] = { value: typeof init === 'function' ? init() : init };
      return [
        hooks[i].value,
        (next) => {
          if (destroyed) return;
          const v = typeof next === 'function' ? next(hooks[i].value) : next;
          if (!Object.is(v, hooks[i].value)) {
            hooks[i].value = v;
            dirty = true;
          }
        },
      ];
    },
    useRef(init) {
      const i = cursor++;
      if (!hooks[i]) hooks[i] = { ref: { current: init } };
      return hooks[i].ref;
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!hooks[i] || deps.some((d, n) => !Object.is(d, hooks[i].deps[n]))) {
        hooks[i] = { value: fn(), deps };
      }
      return hooks[i].value;
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      const i = cursor++;
      if (!hooks[i]) {
        hooks[i] = { cleanup: subscribe(() => (dirty = true)) };
      }
      return getSnapshot();
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!hooks[i] || !deps || deps.some((d, n) => !Object.is(d, hooks[i].deps[n]))) {
        const prev = hooks[i];
        hooks[i] = { deps, cleanup: prev?.cleanup };
        effects.push({ i, fn });
      }
    },
  };
  const orig = { Date: global.Date, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
  global.Date = ReviewDate;
  global.setTimeout = (fn, ms) => {
    const id = ++timerId;
    timers.set(id, { fn, at: time + ms });
    return id;
  };
  global.clearTimeout = (id) => timers.delete(id);
  const provider = loadCompiled(
    'PartyProvider',
    {
      react,
      'react-native': { AppState: appState },
      '../game/GameProvider': { useGame: () => game },
      '../health/native': { readHealthSteps: readHealth },
      './client': { getPartyService: () => service },
    },
    (_tag, props) => {
      value = props.value;
      return null;
    },
  );
  function render() {
    cursor = 0;
    dirty = false;
    renderCount++;
    assert.ok(renderCount < 200, 'unexpected render loop');
    provider.PartyProvider({ children: null, service, hasSession: authenticated });
    const queue = effects.splice(0);
    for (const { i } of queue) hooks[i].cleanup?.();
    for (const { i, fn } of queue) hooks[i].cleanup = fn();
  }
  async function settle() {
    for (let i = 0; i < 35; i++) {
      if (dirty) render();
      await Promise.resolve();
    }
    if (dirty) render();
  }
  render();
  return {
    calls,
    game,
    service,
    identity,
    rows,
    settle,
    get value() {
      return value;
    },
    pause() {
      for (const f of pauseListeners) f();
    },
    signOut() {
      authenticated = false;
      signedOut?.();
    },
    setSession(next) {
      authenticated = next;
      dirty = true;
    },
    app(next) {
      appState.currentState = next;
      for (const f of listeners) f(next);
    },
    touchHealth() {
      game.game.health = { ...game.game.health, syncedAt: new ReviewDate(time + 1000).toISOString() };
      dirty = true;
    },
    async advance(to) {
      time = Date.parse(to);
      const due = [...timers].filter(([, t]) => t.at <= time);
      for (const [id, t] of due) {
        timers.delete(id);
        t.fn();
      }
      await settle();
    },
    setClockOnly(to) {
      // A user task can run before a due rollover timer is delivered.
      time = Date.parse(to);
    },
    dispose() {
      destroyed = true;
      for (const h of hooks) h?.cleanup?.();
      global.Date = orig.Date;
      global.setTimeout = orig.setTimeout;
      global.clearTimeout = orig.clearTimeout;
      return { appListeners: listeners.size, pauseListeners: pauseListeners.size, timers: timers.size };
    },
  };
}

async function scenario(options, run) {
  const h = harness(options);
  try {
    await h.settle();
    await run(h);
  } finally {
    assert.deepEqual(h.dispose(), { appListeners: 0, pauseListeners: 0, timers: 0 });
  }
}

test('existing native membership shares once without a share/refresh loop', () =>
  scenario({}, async (h) => {
    assert.equal(h.calls.read.length, 1);
    assert.equal(h.calls.submit.length, 1);
    await h.settle();
    assert.equal(h.calls.submit.length, 1);
  }));

test('failed departures retain their action and clear it when recovery begins', () =>
  scenario({ demo: true }, async (h) => {
    const before = plain(h.value.state);
    h.service.depart = async () => ({ ok: false, error: 'network' });
    for (const [action, operation] of [
      ['leave', 'leave'],
      ['deleteProfile', 'delete'],
    ]) {
      const work = h.value[action]();
      await h.settle();
      assert.equal(await work, false);
      assert.equal(h.value.error, 'network');
      assert.equal(h.value.errorOperation, operation);
      assert.deepEqual(plain(h.value.state), before);
    }
    const home = deferred();
    h.service.home = () => home.promise;
    const recovery = h.value.refresh();
    await h.settle();
    assert.equal(h.value.operation, 'refresh');
    assert.equal(h.value.error, null);
    assert.equal(h.value.errorOperation, null);
    home.resolve({ ok: true, value: h.identity });
    await h.settle();
    assert.equal(await recovery, true);
  }));

test('a committed entry with a failed board read needs refresh rather than another departure', () =>
  scenario({ demo: true }, async (h) => {
    h.service.depart = async () => ({ ok: false, error: 'network' });
    const departure = h.value.deleteProfile();
    await h.settle();
    assert.equal(await departure, false);
    h.service.board = async () => ({ ok: false, error: 'network' });
    const entry = h.value.enter({ kind: 'profile', name: 'new name', skin: 'original' });
    await h.settle();
    assert.equal(await entry, true);
    assert.equal(h.value.errorOperation, 'refresh');
    assert.equal(h.value.error, 'network');
    assert.equal(h.value.state.identity.home.party.id, h.identity.home.party.id);
    h.service.enter = async () => ({ ok: false, error: 'invite' });
    const rejected = h.value.enter({
      kind: 'join',
      name: 'new name',
      skin: 'original',
      invite: 'b'.repeat(32),
    });
    await h.settle();
    assert.equal(await rejected, false);
    assert.equal(h.value.errorOperation, 'enter');
    assert.equal(h.value.error, 'invite');
  }));

test('an unjoined session failure can reconcile without another delete attempt', () =>
  scenario({ demo: true }, async (h) => {
    const leaving = h.value.leave();
    await h.settle();
    assert.equal(await leaving, true);
    let deletes = 0;
    h.service.depart = async () => {
      deletes++;
      return { ok: false, error: 'session' };
    };
    const deleting = h.value.deleteProfile();
    await h.settle();
    assert.equal(await deleting, false);
    assert.equal(h.value.state.identity.home.party, null);
    assert.equal(h.value.state.identity.userId, h.identity.userId);
    assert.equal(h.value.errorOperation, 'delete');
    let reads = 0;
    h.service.home = async () => {
      reads++;
      return { ok: true, value: { userId: null, home: { profile: null, party: null } } };
    };
    const recovery = h.value.refresh();
    await h.settle();
    assert.equal(await recovery, true);
    assert.equal(reads, 1);
    assert.equal(deletes, 1);
    assert.equal(h.value.state.identity.userId, null);
    assert.equal(h.value.error, null);
    assert.equal(h.value.errorOperation, null);
  }));

test('a failed delete finishing after sign-out cannot restore its error or identity', () =>
  scenario({ demo: true }, async (h) => {
    const wait = deferred();
    h.service.depart = () => wait.promise;
    const deletion = h.value.deleteProfile();
    await h.settle();
    h.signOut();
    await h.settle();
    wait.resolve({ ok: false, error: 'network' });
    await h.settle();
    assert.equal(await deletion, false);
    assert.equal(h.value.error, null);
    assert.equal(h.value.errorOperation, null);
    assert.equal(h.value.state.identity.userId, null);
    assert.equal(h.value.operation, null);
  }));

test('foreground sharing survives a simultaneous board refresh', () =>
  scenario({}, async (h) => {
    const before = h.calls.submit.length;
    h.app('background');
    await h.settle();
    h.app('active');
    await h.settle();
    assert.equal(h.calls.submit.length, before + 1);
    await h.settle();
    assert.equal(h.calls.submit.length, before + 1);
  }));

test('a Health update during foreground loading is shared after loading finishes', async () => {
  const wait = deferred();
  let blocked = false;
  await scenario(
    {
      board: async (_week, _offset, _signal, rows) =>
        blocked ? wait.promise : { ok: true, value: { rows, total: 40 } },
    },
    async (h) => {
      const before = h.calls.submit.length;
      blocked = true;
      h.app('background');
      await h.settle();
      h.app('active');
      await h.settle();
      h.touchHealth();
      await h.settle();
      blocked = false;
      wait.resolve({ ok: true, value: { rows: h.rows, total: 40 } });
      await h.settle();
      assert.equal(h.calls.submit.length, before + 1);
      assert.equal(h.value.operation, null);
    },
  );
});

test('Monday UTC rollover reads and shares the new week once', () =>
  scenario({ now: '2026-11-01T23:59:59Z' }, async (h) => {
    const before = h.calls.submit.length;
    await h.advance('2026-11-02T00:00:00Z');
    assert.equal(h.value.week.start, '2026-11-02');
    assert.equal(h.calls.board.at(-1).week.start, '2026-11-02');
    assert.equal(h.calls.read.at(-1).connection.startedOn, '2026-11-02');
    assert.equal(h.calls.submit.length, before + 1);
    await h.settle();
    assert.equal(h.calls.submit.length, before + 1);
  }));

test('failed first-page loading in a new week cannot skip its first members', async () => {
  let fail = false;
  await scenario(
    {
      now: '2026-11-01T23:59:59Z',
      demo: true,
      board: async (_week, offset, _signal, rows) =>
        fail
          ? { ok: false, error: 'network' }
          : {
              ok: true,
              value: {
                rows:
                  offset === 0
                    ? rows
                    : rows.map((row, i) => ({
                        ...row,
                        id: `30000000-0000-4000-8000-${String(i + offset).padStart(12, '0')}`,
                      })),
                total: 40,
              },
            },
    },
    async (h) => {
      assert.equal(h.value.state.offset, 20);
      fail = true;
      await h.advance('2026-11-02T00:00:00Z');
      assert.equal(h.value.state.week, '2026-11-02');
      assert.deepEqual([h.value.state.rows.length, h.value.state.offset, h.value.state.total], [0, 0, 0]);
      const before = h.calls.board.length;
      assert.equal(await h.value.loadMore(), false);
      assert.equal(h.calls.board.length, before);
      assert.equal(h.value.error, 'network');
      fail = false;
      const work = h.value.refresh();
      await h.settle();
      await work;
      await h.settle();
      assert.equal(h.calls.board.at(-1).offset, 0);
      assert.equal(h.value.state.rows[0].id.endsWith('000000000000'), true);
      assert.equal(h.value.error, null);
    },
  );
});

test('a board request crossing Monday is followed by the new week even with Health paused', async () => {
  const wait = deferred();
  let blocked = false;
  await scenario(
    {
      now: '2026-11-01T23:59:59Z',
      demo: true,
      board: async (_week, _offset, _signal, rows) =>
        blocked ? wait.promise : { ok: true, value: { rows, total: 40 } },
    },
    async (h) => {
      blocked = true;
      const oldRead = h.value.refresh();
      await h.settle();
      await h.advance('2026-11-02T00:00:00Z');
      blocked = false;
      wait.resolve({ ok: true, value: { rows: h.rows, total: 40 } });
      await h.settle();
      await oldRead;
      await h.settle();
      assert.equal(h.value.state.week, '2026-11-02');
      assert.equal(h.calls.board.at(-1).week.start, '2026-11-02');
      assert.equal(h.calls.submit.length, 0);
    },
  );
});

test('canceling initial loading permits retry without accepting a late identity', async () => {
  const oldHome = deferred();
  let signal;
  await scenario(
    {
      demo: true,
      home: (next) => {
        signal = next;
        return oldHome.promise;
      },
    },
    async (h) => {
      const requestId = h.value.readRequestId;
      assert.equal(h.value.state.status, 'loading');
      assert.equal(typeof requestId, 'number');
      assert.equal(h.value.cancelRead(requestId), true);
      await h.settle();
      assert.equal(signal.aborted, true);
      assert.equal(h.value.state.status, 'idle');
      assert.equal(h.value.operation, null);
      assert.equal(h.value.readRequestId, null);
      h.service.home = async () => ({ ok: true, value: h.identity });
      const retry = h.value.refresh();
      await h.settle();
      assert.equal(await retry, true);
      const recovered = plain(h.value.state);
      oldHome.resolve({ ok: true, value: { userId: null, home: { profile: null, party: null } } });
      await h.settle();
      assert.deepEqual(plain(h.value.state), recovered);
      assert.equal(h.value.error, null);
    },
  );
});

test('canceling a refresh clears queued work and cannot finish a newer request', () =>
  scenario({ demo: true }, async (h) => {
    const before = plain(h.value.state),
      first = deferred(),
      second = deferred();
    let signal;
    h.service.board = async (_week, _offset, next) => {
      signal = next;
      return first.promise;
    };
    const old = h.value.refresh();
    await h.settle();
    const firstId = h.value.readRequestId;
    h.app('active');
    await h.settle();
    const homeCount = h.calls.home.length;
    assert.equal(h.value.cancelRead(firstId), true);
    await h.settle();
    assert.equal(signal.aborted, true);
    assert.deepEqual(plain(h.value.state), before);
    assert.equal(h.calls.home.length, homeCount);
    h.service.board = async () => second.promise;
    const fresh = h.value.refresh();
    await h.settle();
    const secondId = h.value.readRequestId;
    assert.notEqual(secondId, firstId);
    assert.equal(h.value.cancelRead(firstId), false);
    first.resolve({ ok: true, value: { rows: [], total: 0 } });
    await h.settle();
    assert.equal(await old, false);
    assert.equal(h.value.operation, 'refresh');
    assert.equal(h.value.readRequestId, secondId);
    assert.deepEqual(plain(h.value.state), before);
    second.resolve({ ok: true, value: { rows: h.rows.map((r) => ({ ...r, steps: 99 })), total: 40 } });
    await h.settle();
    assert.equal(await fresh, true);
    assert.equal(h.value.state.rows[0].steps, 99);
    assert.equal(h.value.operation, null);
  }));

test('canceling pagination retries the same offset and ignores the abandoned page', () =>
  scenario({ demo: true }, async (h) => {
    const first = deferred(),
      before = plain(h.value.state),
      offsets = h.calls.board.map((call) => call.offset);
    h.service.board = async (_week, offset) => {
      offsets.push(offset);
      return first.promise;
    };
    const old = h.value.loadMore();
    await h.settle();
    assert.equal(h.value.operation, 'more');
    assert.equal(h.value.cancelRead(h.value.readRequestId), true);
    await h.settle();
    assert.deepEqual(plain(h.value.state), before);
    const page = h.rows.map((r, i) => ({
      ...r,
      id: `30000000-0000-4000-8000-${String(i + 20).padStart(12, '0')}`,
    }));
    h.service.board = async (_week, offset) => {
      offsets.push(offset);
      assert.equal(offset, 20);
      return { ok: true, value: { rows: page, total: 40 } };
    };
    const retry = h.value.loadMore();
    await h.settle();
    assert.equal(await retry, true);
    assert.equal(h.value.state.offset, 40);
    assert.equal(h.value.state.rows.length, 40);
    first.resolve({ ok: true, value: { rows: [], total: 100 } });
    await h.settle();
    assert.equal(await old, false);
    assert.equal(h.value.state.offset, 40);
    assert.equal(h.value.state.total, 40);
    assert.deepEqual(offsets, [0, 20, 20]);
  }));

test('a successful membership write settles before its cancellable board refresh', () =>
  scenario({ demo: true }, async (h) => {
    const board = deferred();
    h.service.board = async () => board.promise;
    const writing = h.value.enter({ kind: 'profile', name: 'moss', skin: 'original' });
    let settled = false;
    writing.then(() => {
      settled = true;
    });
    await h.settle();
    assert.equal(settled, true);
    assert.equal(await writing, true);
    assert.equal(h.value.operation, 'refresh');
    assert.equal(h.value.state.identity.home.party.id, h.identity.home.party.id);
    assert.equal(h.value.cancelRead(h.value.readRequestId), true);
    await h.settle();
    assert.equal(h.value.operation, null);
    assert.equal(h.value.state.identity.home.party.id, h.identity.home.party.id);
    board.resolve({ ok: false, error: 'network' });
    await h.settle();
    assert.equal(h.value.error, null);
  }));

test('read cancellation never aborts an entry, leave or profile deletion', async () => {
  for (const kind of ['enter', 'leave', 'deleteProfile'])
    await scenario({ demo: true }, async (h) => {
      const previousPage = deferred();
      h.service.board = async () => previousPage.promise;
      const previousRead = h.value.refresh();
      await h.settle();
      const previousReadId = h.value.readRequestId;
      previousPage.resolve({ ok: true, value: { rows: h.rows, total: 40 } });
      await h.settle();
      assert.equal(await previousRead, true);
      const wait = deferred();
      let signal;
      if (kind === 'enter')
        h.service.enter = async (_entry, next) => {
          signal = next;
          return wait.promise;
        };
      else
        h.service.depart = async (_remove, next) => {
          signal = next;
          return wait.promise;
        };
      const pending =
        kind === 'enter'
          ? h.value.enter({ kind: 'create', name: 'moss', skin: 'original' })
          : h.value[kind]();
      await h.settle();
      assert.equal(h.value.readRequestId, null);
      assert.equal(h.value.cancelRead(previousReadId), false);
      assert.equal(signal.aborted, false);
      assert.notEqual(h.value.operation, null);
      wait.resolve({ ok: false, error: 'network' });
      await h.settle();
      assert.equal(await pending, false);
    });
});

test('canceling queued sharing preserves consent and foreground resumes once', () =>
  scenario({}, async (h) => {
    const wait = deferred(),
      reads = h.calls.read.length,
      submits = h.calls.submit.length;
    h.service.board = async () => wait.promise;
    const pending = h.value.refresh();
    await h.settle();
    h.touchHealth();
    await h.settle();
    assert.equal(h.value.cancelRead(h.value.readRequestId), true);
    await h.settle();
    assert.equal(h.calls.read.length, reads);
    assert.equal(h.calls.submit.length, submits);
    assert.equal(h.game.game.health.enabled, true);
    wait.resolve({ ok: true, value: { rows: h.rows, total: 40 } });
    await h.settle();
    assert.equal(await pending, false);
    h.service.board = async () => ({ ok: true, value: { rows: h.rows, total: 40 } });
    h.app('background');
    await h.settle();
    h.app('active');
    await h.settle();
    assert.equal(h.calls.read.length, reads + 1);
    assert.equal(h.calls.submit.length, submits + 1);
  }));

test('confirmed session cleanup closes read cancellation before its write begins', () =>
  scenario({ demo: true }, async (h) => {
    const verification = deferred(),
      cleanup = deferred();
    let signal;
    h.service.home = async (next, beginSessionReset) => {
      signal = next;
      await verification.promise;
      assert.equal(beginSessionReset(), true);
      await cleanup.promise;
      return { ok: false, error: 'session' };
    };
    const pending = h.value.refresh();
    await h.settle();
    const reading = h.value.readRequestId;
    assert.notEqual(reading, null);
    verification.resolve();
    await h.settle();
    assert.equal(h.value.operation, 'session');
    assert.equal(h.value.readRequestId, null);
    assert.equal(h.value.cancelRead(reading), false);
    assert.equal(signal.aborted, false);
    h.signOut();
    cleanup.resolve();
    await h.settle();
    assert.equal(await pending, false);
    assert.equal(h.value.operation, null);
    assert.equal(h.value.state.identity.userId, null);
    assert.equal(h.value.error, null);
  }));

test('canceling across Monday clears old scores without restarting the abandoned read', () =>
  scenario({ now: '2026-11-01T23:59:59Z', demo: true }, async (h) => {
    const wait = deferred();
    h.service.board = async () => wait.promise;
    const pending = h.value.refresh();
    await h.settle();
    await h.advance('2026-11-02T00:00:00Z');
    const homeCount = h.calls.home.length;
    assert.equal(h.value.cancelRead(h.value.readRequestId), true);
    await h.settle();
    assert.equal(h.value.week.start, '2026-11-02');
    assert.equal(h.value.state.week, '2026-11-02');
    assert.deepEqual(h.value.state.rows, []);
    assert.equal(h.value.state.offset, 0);
    assert.equal(h.value.state.total, 0);
    assert.equal(h.calls.home.length, homeCount);
    wait.resolve({ ok: true, value: { rows: h.rows, total: 40 } });
    await h.settle();
    assert.equal(await pending, false);
    assert.deepEqual(h.value.state.rows, []);
    h.service.board = async (week) => {
      assert.equal(week.start, '2026-11-02');
      return { ok: true, value: { rows: h.rows, total: 40 } };
    };
    const retry = h.value.refresh();
    await h.settle();
    assert.equal(await retry, true);
    assert.equal(h.value.state.rows.length, 20);
  }));

for (const resume of ['refresh', 'foreground']) {
  test(`canceling before the Monday timer leaves sharing idle until ${resume}`, () =>
    scenario({ now: '2026-11-01T23:59:59Z' }, async (h) => {
      const wait = deferred();
      h.service.board = async () => wait.promise;
      const pending = h.value.refresh();
      await h.settle();
      const before = {
        home: h.calls.home.length,
        read: h.calls.read.length,
        submit: h.calls.submit.length,
      };
      h.setClockOnly('2026-11-02T00:00:00Z');
      assert.equal(h.value.cancelRead(h.value.readRequestId), true);
      await h.settle();
      assert.equal(h.value.operation, null);
      assert.equal(h.value.week.start, '2026-11-02');
      assert.equal(h.value.state.week, '2026-11-02');
      assert.deepEqual(h.value.state.rows, []);
      assert.equal(h.calls.home.length, before.home);
      assert.equal(h.calls.read.length, before.read);
      assert.equal(h.calls.submit.length, before.submit);
      wait.resolve({ ok: true, value: { rows: h.rows, total: 40 } });
      await h.settle();
      assert.equal(await pending, false);
      h.service.board = async (week) => {
        assert.equal(week.start, '2026-11-02');
        return { ok: true, value: { rows: h.rows, total: 40 } };
      };
      if (resume === 'refresh') {
        const retry = h.value.refresh();
        await h.settle();
        assert.equal(await retry, true);
      } else {
        h.app('background');
        await h.settle();
        h.app('active');
      }
      await h.settle();
      assert.equal(h.calls.read.length, before.read + 1);
      assert.equal(h.calls.submit.length, before.submit + 1);
      assert.equal(h.value.state.rows.length, 20);
      assert.equal(h.value.operation, null);
    }));
}

test('a failed first join exposes its authenticated guest for deletion without a profile or reload', () =>
  scenario(
    {
      demo: true,
      hasSession: false,
      home: async () => ({ ok: true, value: { userId: null, home: { profile: null, party: null } } }),
    },
    async (h) => {
      assert.equal(h.value.hasSession, false);
      h.service.enter = async () => {
        h.setSession(true);
        return { ok: false, error: 'invite' };
      };
      const attempt = h.value.enter({ kind: 'join', name: 'moss', skin: 'pandan', invite: '0'.repeat(32) });
      await h.settle();
      assert.equal(await attempt, false);
      assert.equal(h.value.hasSession, true);
      assert.equal(h.value.state.identity.userId, null);
      assert.equal(h.value.error, 'invite');
      assert.equal(h.value.errorOperation, 'enter');
      assert.equal(h.calls.read.length, 0);
      const deletion = h.value.deleteProfile();
      await h.settle();
      assert.equal(await deletion, true);
      assert.equal(h.calls.depart.length, 1);
      assert.equal(h.calls.depart[0].removeAccount, true);
      h.signOut();
      await h.settle();
      assert.equal(h.value.hasSession, false);
      assert.equal(h.value.state.identity.userId, null);
    },
  ));
