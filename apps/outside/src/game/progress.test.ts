import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClearWalkResult } from '../explore/recorder.ts';
import { createGame, type Game } from './game.ts';
import { createProgressStore, type ProgressPorts, SAVE_FAILED } from './progress.ts';

const TODAY = '2026-11-03';
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness(overrides: Partial<ProgressPorts> = {}) {
  const writes: string[] = [];
  const warnings: string[] = [];
  const store = createProgressStore({
    read: async () => null,
    readLegacy: async () => null,
    write: async (raw) => {
      writes.push(raw);
    },
    today: () => TODAY,
    fresh: (date) => createGame(date),
    demo: false,
    warn: (message) => warnings.push(message),
    ...overrides,
  });
  const saved = (): Game | null => {
    const raw = writes.at(-1);
    return raw ? (JSON.parse(raw) as Game) : null;
  };
  return { store, writes, warnings, saved };
}

test('a first launch is ready at once and saves the fresh game', async () => {
  const h = harness();
  assert.equal(h.store.getState().loading.status, 'loading');
  h.store.load();
  await settle();
  assert.equal(h.store.getState().loading.status, 'ready');
  assert.equal(h.writes.length, 1);
  assert.equal(h.saved()?.days[0]?.date, TODAY);
});

test('a v2 save restores, opens today and writes once', async () => {
  const stored = { ...createGame('2026-11-01'), coins: 77 };
  let legacyReads = 0;
  const h = harness({
    read: async () => JSON.stringify(stored),
    readLegacy: async () => {
      legacyReads += 1;
      return null;
    },
  });
  h.store.load();
  await settle();
  const { session, loading } = h.store.getState();
  assert.equal(loading.status, 'ready');
  assert.equal(session.game.coins, 77);
  assert.ok(session.game.days.some((day) => day.date === TODAY));
  assert.equal(session.notice, null);
  assert.equal(legacyReads, 0);
  assert.equal(h.writes.length, 1);
});

test('a v1 save is read from the legacy key and announces the migration', async () => {
  const v1 = {
    version: 1,
    goal: 6_000,
    equipped: 'original',
    days: [{ date: TODAY, steps: 900, goal: 6_000 }],
  };
  const h = harness({ readLegacy: async () => JSON.stringify(v1) });
  h.store.load();
  await settle();
  const { session } = h.store.getState();
  assert.equal(session.game.goal, 6_000);
  assert.equal(session.notice?.message, 'welcome to the fruitlands. today’s steps are in your pouch.');
  assert.equal(h.saved()?.version, 3);
});

test('an unreadable save keeps its data and never writes over it', async () => {
  const h = harness({ read: async () => JSON.stringify({ ...createGame(TODAY), version: 9 }) });
  h.store.load();
  await settle();
  assert.deepEqual(h.store.getState().loading, {
    status: 'error',
    failure: { kind: 'newer-version', version: 9 },
  });
  h.store.play({ type: 'travel', to: 'pandan-woods' });
  assert.equal(h.writes.length, 0);
});

test('a storage failure can be retried, and the retry loads the save', async () => {
  let fail = true;
  const h = harness({
    read: async () => {
      if (fail) throw new Error('locked');
      return JSON.stringify({ ...createGame(TODAY), coins: 5 });
    },
  });
  h.store.load();
  await settle();
  assert.deepEqual(h.store.getState().loading, { status: 'error', failure: { kind: 'storage' } });
  assert.deepEqual(h.warnings, ['Progress could not be read:']);
  fail = false;
  h.store.retryLoad();
  assert.equal(h.store.getState().loading.status, 'loading');
  await settle();
  assert.equal(h.store.getState().loading.status, 'ready');
  assert.equal(h.store.getState().session.game.coins, 5);
});

test('a cancelled load never applies its late result', async () => {
  const read = deferred<string | null>();
  const h = harness({ read: () => read.promise });
  h.store.load();
  await settle();
  h.store.cancelLoad();
  read.resolve(JSON.stringify({ ...createGame(TODAY), coins: 999 }));
  await settle();
  assert.equal(h.store.getState().loading.status, 'loading');
  assert.equal(h.store.getState().session.game.coins, 25);
  assert.equal(h.writes.length, 0);
});

test('saves run in order; a failure shows until a retry succeeds', async () => {
  let fail = false;
  const h = harness({
    write: async (raw) => {
      if (fail) throw new Error('full');
      h.writes.push(raw);
    },
  });
  h.store.load();
  await settle();
  fail = true;
  h.store.play({ type: 'travel', to: 'pandan-woods' });
  await settle();
  assert.deepEqual(h.store.getState().session.notice, { kind: 'error', message: SAVE_FAILED });
  fail = false;
  h.store.retrySave();
  assert.equal(h.store.getState().retryingSave, true);
  // A second retry while one is running is ignored.
  h.store.retrySave();
  await settle();
  assert.equal(h.store.getState().retryingSave, false);
  assert.equal(h.store.getState().session.notice, null);
  assert.equal(h.writes.length, 2);
  assert.equal(h.saved()?.travel?.to, 'pandan-woods');
});

test('play answers with the rules’ rejection from the same state it reduces', async () => {
  const h = harness();
  h.store.load();
  await settle();
  assert.equal(h.store.play({ type: 'travel', to: 'pandan-woods' }), null);
  // The second travel sees the first one at once, before any render.
  assert.deepEqual(h.store.play({ type: 'travel', to: 'longan-lake' }), { kind: 'travelling' });
});

test('erasing stops steps, clears the walk, then saves a fresh game', async () => {
  const order: string[] = [];
  const h = harness({ read: async () => JSON.stringify({ ...createGame(TODAY), coins: 300 }) });
  h.store.load();
  await settle();
  const clear = deferred<ClearWalkResult>();
  h.store.reset({
    stopSteps: () => order.push('stop'),
    clearWalk: () => {
      order.push('clear');
      return clear.promise;
    },
  });
  assert.equal(h.store.getState().resetting, true);
  // A second erase while one runs is ignored.
  h.store.reset({ stopSteps: () => order.push('again'), clearWalk: () => clear.promise });
  clear.resolve({ ok: true });
  await settle();
  assert.deepEqual(order, ['stop', 'clear']);
  const state = h.store.getState();
  assert.equal(state.resetting, false);
  assert.equal(state.session.game.coins, 25);
  assert.equal(state.session.notice?.message, 'a new adventure. one step at a time.');
  assert.equal(h.saved()?.coins, 25);
});

test('erasing waits for the walk and the load, and reports a failed clear', async () => {
  const read = deferred<string | null>();
  const h = harness({ read: () => read.promise });
  h.store.load();
  let cleared = 0;
  const clearWalk = async (): Promise<ClearWalkResult> => {
    cleared += 1;
    return { ok: false, message: 'couldn’t delete this walk. try deleting it again.' };
  };
  // Erasing while the save is still loading does nothing.
  h.store.reset({ stopSteps: () => {}, clearWalk });
  assert.equal(cleared, 0);
  read.resolve(null);
  await settle();
  h.store.reset({ stopSteps: () => {}, clearWalk: null });
  assert.equal(h.store.getState().resetError, 'your walk is still opening. try erasing it again.');
  h.store.reset({ stopSteps: () => {}, clearWalk });
  await settle();
  assert.equal(cleared, 1);
  assert.equal(h.store.getState().resetError, 'couldn’t delete this walk. try deleting it again.');
});

test('erasing from the load-error screen makes the game ready', async () => {
  const h = harness({ read: async () => 'nope' });
  h.store.load();
  await settle();
  assert.equal(h.store.getState().loading.status, 'error');
  h.store.reset({ stopSteps: () => {}, clearWalk: async () => ({ ok: true }) });
  await settle();
  assert.equal(h.store.getState().loading.status, 'ready');
  assert.equal(h.writes.length, 1);
});

test('a new day rolls over today and opens the day in the save', async () => {
  let today = TODAY;
  const h = harness({ today: () => today });
  h.store.load();
  await settle();
  today = '2026-11-04';
  h.store.refreshDay();
  assert.equal(h.store.getState().today, '2026-11-04');
  assert.ok(h.store.getState().session.game.days.some((day) => day.date === '2026-11-04'));
});
