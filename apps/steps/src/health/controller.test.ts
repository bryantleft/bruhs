import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameAction } from '../game/game.ts';
import { createHealthSync } from './controller.ts';
import type { HealthRead, HealthReader, HealthTracking } from './model.ts';

const REQUEST = { connection: undefined, requestPermission: true } as const;
const READ: HealthRead = {
  status: 'read',
  source: 'apple-health',
  at: '2026-10-21T18:00:00.000Z',
  days: [{ date: '2026-10-21', steps: 6240 }],
};
function deferred(): Readonly<{ promise: Promise<HealthRead>; finish: (value: HealthRead) => void }> {
  let finish: ((value: HealthRead) => void) | undefined;
  const promise = new Promise<HealthRead>((resolve) => {
    finish = resolve;
  });
  return {
    promise,
    finish(value) {
      if (!finish) throw new Error('Reader was not initialized.');
      finish(value);
    },
  };
}

test('rapid sync requests share one native read and commit one batch', async () => {
  const wait = deferred();
  let reads = 0;
  const states: HealthTracking[] = [];
  const actions: GameAction[] = [];
  const sync = createHealthSync(
    () => {
      reads += 1;
      return wait.promise;
    },
    (state) => states.push(state),
    (action) => actions.push(action),
  );
  const first = sync.run(REQUEST);
  assert.equal(sync.run(REQUEST), first);
  await Promise.resolve();
  assert.equal(reads, 1);
  wait.finish(READ);
  await first;
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.type, 'health-sync');
  assert.equal(states.at(-1)?.status, 'ready');
});

test('pausing during a native permission/read operation prevents its late result from importing', async () => {
  const wait = deferred();
  const actions: GameAction[] = [];
  const states: HealthTracking[] = [];
  const sync = createHealthSync(
    () => wait.promise,
    (state) => states.push(state),
    (action) => actions.push(action),
  );
  const pending = sync.run(REQUEST);
  await Promise.resolve();
  sync.cancel();
  wait.finish(READ);
  await pending;
  assert.deepEqual(actions, []);
  assert.equal(states.at(-1)?.status, 'syncing');
});

test('empty Apple Health reads never claim that read permission was granted', async () => {
  const states: HealthTracking[] = [];
  const sync = createHealthSync(
    async () => ({ ...READ, status: 'read', source: 'apple-health', days: [] }),
    (state) => states.push(state),
    () => {},
  );
  await sync.run(REQUEST);
  assert.equal(states.at(-1)?.status, 'no-data');
});

test('denied and unavailable health reads do not change XP or health connection settings', async () => {
  for (const result of [
    { status: 'permission-required', source: 'health-connect' },
    { status: 'unavailable', reason: 'preview' },
  ] as const) {
    const actions: GameAction[] = [];
    const states: HealthTracking[] = [];
    const sync = createHealthSync(
      async () => result,
      (state) => states.push(state),
      (action) => actions.push(action),
    );
    await sync.run(REQUEST);
    assert.deepEqual(actions, []);
    assert.equal(states.at(-1)?.status, result.status);
  }
});

test('even a synchronous native failure releases the sync lock for a retry', async () => {
  let fail = true;
  const reader: HealthReader = () => {
    if (fail) throw new Error('Step access needs checking.');
    return Promise.resolve(READ);
  };
  const states: HealthTracking[] = [];
  const sync = createHealthSync(
    reader,
    (state) => states.push(state),
    () => {},
  );
  await sync.run(REQUEST);
  assert.equal(states.at(-1)?.status, 'error');
  fail = false;
  await sync.run(REQUEST);
  assert.equal(states.at(-1)?.status, 'ready');
});

test('pausing before a queued sync starts does not read health data at all', async () => {
  let reads = 0;
  const sync = createHealthSync(
    async () => {
      reads += 1;
      return READ;
    },
    () => {},
    () => {},
  );
  const pending = sync.run(REQUEST);
  sync.cancel();
  await pending;
  assert.equal(reads, 0);
});
