import assert from 'node:assert/strict';
import test from 'node:test';
import { eraseJourney } from '../game/eraseJourney.ts';
import {
  createRecorder,
  EMPTY_EXPLORER,
  type ExplorerState,
  type LocationFailure,
  type LocationPermission,
  type RecorderPorts,
  type Subscription,
} from './recorder.ts';
import { decodeWalk, type Fix, finishWalk, startWalk } from './walk.ts';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
const fix: Fix = { latitude: 0, longitude: 0, accuracy: 5, timestamp: 1_000.25 };

function harness(overrides: Partial<RecorderPorts> = {}): {
  recorder: ReturnType<typeof createRecorder>;
  state: () => ExplorerState;
  emit: (value: Fix) => void;
  writes: string[];
  removed: () => number;
  time: (value: number) => void;
  failing: (value: boolean) => void;
} {
  let state = EMPTY_EXPLORER;
  let now = 0;
  let fail = false;
  let removed = 0;
  let receive: (value: unknown) => void = () => {};
  const writes: string[] = [];
  const recorder = createRecorder(
    {
      read: async () => null,
      write: async (raw) => {
        if (fail) throw new Error('full');
        writes.push(raw);
      },
      remove: async () => {},
      availability: async () => 'available',
      requestPermission: async () => ({ status: 'granted' }),
      watch: async (callback) => {
        receive = callback;
        return {
          remove: () => {
            removed += 1;
          },
        };
      },
      now: () => now,
      ...overrides,
    },
    (next) => {
      state = next;
    },
  );
  return {
    recorder,
    state: () => state,
    emit: (value) => receive(value),
    writes,
    removed: () => removed,
    time: (value) => {
      now = value;
    },
    failing: (value) => {
      fail = value;
    },
  };
}

test('canceling during permission prevents a late GPS subscription or walk', async () => {
  const permission = deferred<LocationPermission>();
  let watches = 0;
  const h = harness({
    requestPermission: () => permission.promise,
    watch: async () => {
      watches += 1;
      return { remove: () => {} };
    },
  });
  await h.recorder.load();
  const pending = h.recorder.start();
  await settle();
  assert.equal(h.state().location.status, 'requesting');
  await h.recorder.start();
  h.recorder.pause();
  permission.resolve({ status: 'granted' });
  await pending;
  assert.equal(watches, 0);
  assert.equal(h.state().walk, null);
  assert.equal(h.writes.length, 0);
});

test('pausing before watch startup finishes removes its late subscription', async () => {
  const subscription = deferred<Subscription>();
  const h = harness({ watch: () => subscription.promise });
  await h.recorder.load();
  const pending = h.recorder.start();
  await settle();
  h.time(2_000);
  h.recorder.pause();
  let removed = 0;
  subscription.resolve({
    remove: () => {
      removed += 1;
    },
  });
  await pending;
  assert.equal(removed, 1);
  assert.equal(h.state().walk, null);
});

test('save recovery writes the latest paused route and never rejoins a pause gap', async () => {
  const h = harness();
  await h.recorder.load();
  h.failing(true);
  await h.recorder.start();
  h.emit(fix);
  h.emit({ ...fix, latitude: 0.003, timestamp: 301_000.25 });
  await settle();
  assert.equal(h.state().save.status, 'error');
  h.time(302_000);
  h.recorder.pause();
  await settle();
  h.emit({ ...fix, latitude: 1, timestamp: 303_000 });
  assert.equal(h.state().walk?.segments[0]?.length, 2);
  h.failing(false);
  h.recorder.retrySave();
  await settle();
  assert.equal(h.writes.length, 1);
  assert.equal(h.state().save.status, 'saved');
  assert.deepEqual(decodeWalk(h.writes[0] ?? ''), { ok: true, walk: h.state().walk });
  h.time(500_000);
  await h.recorder.start();
  h.emit({ ...fix, latitude: 1, timestamp: 501_000 });
  assert.ok((h.state().walk?.distanceMeters ?? 0) < 334);
  assert.equal(h.state().walk?.segments.length, 2);
  h.time(502_000);
  h.recorder.finish();
  const finished = h.state().walk;
  h.emit({ ...fix, latitude: 2, timestamp: 503_000 });
  assert.equal(h.state().walk, finished);
  assert.equal(finished?.status, 'complete');
  h.recorder.dispose();
  await settle();
});

test('location denial and disabled services leave existing step data outside the recorder', async () => {
  let permissionRequests = 0;
  const off = harness({
    availability: async () => 'disabled',
    requestPermission: async () => {
      permissionRequests += 1;
      return { status: 'granted' };
    },
  });
  await off.recorder.load();
  await off.recorder.start();
  assert.equal(permissionRequests, 0);
  const offLocation = off.state().location;
  assert.ok(offLocation.status === 'error');
  assert.equal(offLocation.settings, true);
  assert.equal(off.writes.length, 0);
  const denied = harness({ requestPermission: async () => ({ status: 'denied', canAskAgain: false }) });
  await denied.recorder.load();
  await denied.recorder.start();
  assert.equal(denied.state().walk, null);
  assert.deepEqual(denied.state().location, {
    status: 'error',
    message: 'allow location access to draw your route. your step progress is safe.',
    settings: true,
  });
});

test('unsupported location preserves a saved recap without requesting permission or GPS', async () => {
  const recap = finishWalk(startWalk(0), 10);
  let permissionRequests = 0;
  let watches = 0;
  const h = harness({
    read: async () => JSON.stringify(recap),
    availability: async () => 'unsupported',
    requestPermission: async () => {
      permissionRequests += 1;
      return { status: 'granted' };
    },
    watch: async () => {
      watches += 1;
      return { remove: () => {} };
    },
  });
  await h.recorder.load();
  await h.recorder.start();
  assert.deepEqual(h.state().walk, recap);
  const unsupportedLocation = h.state().location;
  assert.ok(unsupportedLocation.status === 'error');
  assert.equal(unsupportedLocation.settings, false);
  assert.equal(permissionRequests, 0);
  assert.equal(watches, 0);
  assert.equal(h.writes.length, 0);
});

test('signal loss pauses recording and retry preserves the route without joining the gap', async () => {
  const fixes: ((value: unknown) => void)[] = [];
  let fail: (reason: LocationFailure) => void = () => {};
  let removed = 0;
  const h = harness({
    watch: async (receive, error) => {
      fixes.push(receive);
      fail = error;
      return {
        remove: () => {
          removed += 1;
        },
      };
    },
  });
  await h.recorder.load();
  await h.recorder.start();
  fixes[0]?.(fix);
  h.time(2_000);
  fail('unavailable');
  await settle();
  assert.equal(removed, 1);
  assert.equal(h.state().walk?.status, 'paused');
  const signalLocation = h.state().location;
  assert.ok(signalLocation.status === 'error');
  assert.equal(signalLocation.settings, false);
  const paused = h.state().walk;
  fixes[0]?.({ ...fix, latitude: 1, timestamp: 5_000 });
  assert.equal(h.state().walk, paused);
  await h.recorder.start();
  assert.equal(h.state().walk, paused);
  fixes[1]?.({ ...fix, latitude: 1, timestamp: 10_000 });
  assert.equal(h.state().walk?.status, 'recording');
  assert.equal(h.state().walk?.segments.length, 2);
  assert.equal(h.state().walk?.distanceMeters, 0);
  h.recorder.dispose();
  await settle();
});

test('a corrupt saved walk is preserved and never replaced on load', async () => {
  const h = harness({ read: async () => '{' });
  await h.recorder.load();
  await h.recorder.start();
  assert.equal(h.state().loading, 'error');
  assert.equal(h.writes.length, 0);
});

test('deleting a route waits for pending writes and stops late location events', async () => {
  const pending = deferred<void>();
  let deleted = false;
  const h = harness({
    write: () => pending.promise,
    remove: async () => {
      deleted = true;
    },
  });
  await h.recorder.load();
  await h.recorder.start();
  h.emit(fix);
  const clearing = h.recorder.clear();
  await settle();
  assert.equal(deleted, false);
  h.emit({ ...fix, latitude: 1, timestamp: 100_000 });
  pending.resolve();
  await clearing;
  assert.equal(deleted, true);
  assert.equal(h.state().walk, null);
  assert.equal(h.removed(), 1);
  assert.equal(h.state().loading, 'ready');
});

test('disposing during permission never publishes later state or starts GPS', async () => {
  const permission = deferred<LocationPermission>();
  const h = harness({ requestPermission: () => permission.promise });
  await h.recorder.load();
  const pending = h.recorder.start();
  await settle();
  const before = h.state();
  h.recorder.dispose();
  permission.resolve({ status: 'granted' });
  await pending;
  assert.equal(h.state(), before);
  assert.equal(h.writes.length, 0);
});

test('a failed first GPS fix preserves the previous recap even after permission was granted', async () => {
  const recap = finishWalk(startWalk(0), 10);
  let fail: (reason: LocationFailure) => void = () => {};
  const h = harness({
    read: async () => JSON.stringify(recap),
    watch: async (_, error) => {
      fail = error;
      return { remove: () => {} };
    },
  });
  await h.recorder.load();
  await h.recorder.start();
  assert.deepEqual(h.state().walk, recap);
  assert.equal(h.writes.length, 0);
  fail('permission');
  assert.deepEqual(h.state().walk, recap);
  assert.deepEqual(h.state().location, {
    status: 'error',
    message: 'allow location access to draw your route. your step progress is safe.',
    settings: true,
  });
});

test('a browser prompt waits for its first fix and cancellation removes the actual watch', async () => {
  const h = harness({ requestPermission: async () => ({ status: 'prompt' }) });
  await h.recorder.load();
  await h.recorder.start();
  assert.equal(h.state().location.status, 'requesting');
  assert.equal(h.state().walk, null);
  h.emit(fix);
  assert.equal(h.state().location.status, 'watching');
  assert.equal(h.state().walk?.segments[0]?.length, 1);
  assert.equal(h.state().walk?.startedAt, fix.timestamp);
  h.time(2_000);
  h.recorder.pause();
  assert.equal(h.removed(), 1);
  assert.equal(h.state().walk?.status, 'paused');
  const paused = h.state().walk;
  h.emit({ ...fix, latitude: 1, timestamp: 3_000 });
  assert.equal(h.state().walk, paused);
});

test('failed journey erasure stops GPS, keeps a paused route, and can be retried', async () => {
  let deleteFails = true;
  const h = harness({
    remove: async () => {
      if (deleteFails) throw new Error('storage locked');
    },
  });
  await h.recorder.load();
  await h.recorder.start();
  h.emit(fix);
  h.time(2_000);
  let gameSteps = 500;
  let healthPaused = false;
  const erase = () =>
    eraseJourney({
      stopSteps: () => {
        healthPaused = true;
      },
      clearWalk: h.recorder.clear,
      resetGame: () => {
        gameSteps = 0;
      },
    });
  const result = await erase();
  assert.equal(result.ok, false);
  assert.equal(healthPaused, true);
  assert.equal(gameSteps, 500);
  assert.equal(h.removed(), 1);
  assert.equal(h.state().walk?.status, 'paused');
  const retained = h.state().walk;
  h.emit({ ...fix, latitude: 1, timestamp: 3_000 });
  assert.equal(h.state().walk, retained);
  deleteFails = false;
  assert.deepEqual(await erase(), { ok: true });
  assert.equal(gameSteps, 0);
  assert.equal(h.state().walk, null);
});

test('slow storage catches up to the latest whole walk without replaying intermediate snapshots', async () => {
  const pending = deferred<void>();
  const calls: string[] = [];
  const h = harness({
    write: async (raw) => {
      calls.push(raw);
      if (calls.length === 1) await pending.promise;
    },
  });
  await h.recorder.load();
  await h.recorder.start();
  h.emit(fix);
  await settle();
  assert.equal(calls.length, 1);
  h.emit({ ...fix, latitude: 0.001, timestamp: 10_000 });
  h.emit({ ...fix, latitude: 0.002, timestamp: 20_000 });
  h.time(21_000);
  h.recorder.pause();
  await h.recorder.start();
  h.emit({ ...fix, latitude: 10, timestamp: 30_000 });
  h.emit({ ...fix, latitude: 10.001, timestamp: 40_000 });
  h.time(41_000);
  h.recorder.finish();
  const latest = h.state().walk;
  assert.equal(latest?.status, 'complete');
  assert.deepEqual(
    latest?.segments.map((s) => s.length),
    [3, 2],
  );
  assert.ok((latest?.distanceMeters ?? 0) < 400);
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(h.state().save.status, 'saving');
  pending.resolve();
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(calls.at(-1), JSON.stringify(latest));
  assert.deepEqual(decodeWalk(calls.at(-1) ?? ''), { ok: true, walk: latest });
  assert.equal(h.state().save.status, 'saved');
  h.recorder.dispose();
});

test('a failed busy-storage drain exposes the latest failure and retry preserves the newest route', async () => {
  const pending = deferred<void>();
  const calls: string[] = [];
  let failing = true;
  const h = harness({
    write: async (raw) => {
      calls.push(raw);
      if (calls.length === 1) await pending.promise;
      if (failing) throw Error('full');
    },
  });
  await h.recorder.load();
  await h.recorder.start();
  h.emit(fix);
  await settle();
  h.emit({ ...fix, latitude: 0.003, timestamp: 10_000 });
  h.time(11_000);
  h.recorder.pause();
  const latest = h.state().walk;
  pending.resolve();
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(h.state().save.status, 'error');
  failing = false;
  h.recorder.retrySave();
  await settle();
  assert.equal(calls.length, 3);
  assert.equal(calls.at(-1), JSON.stringify(latest));
  assert.equal(h.state().save.status, 'saved');
  h.recorder.dispose();
});

test('erasure drains the final coalesced route before removal and ignores late fixes', async () => {
  const first = deferred<void>();
  const latest = deferred<void>();
  const calls: string[] = [];
  let deleted = false;
  const h = harness({
    write: async (raw) => {
      calls.push(raw);
      await (calls.length === 1 ? first.promise : latest.promise);
    },
    remove: async () => {
      deleted = true;
    },
  });
  await h.recorder.load();
  await h.recorder.start();
  h.emit(fix);
  await settle();
  h.emit({ ...fix, latitude: 0.003, timestamp: 10_000 });
  h.time(11_000);
  const clearing = h.recorder.clear();
  h.emit({ ...fix, latitude: 1, timestamp: 12_000 });
  first.resolve();
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(deleted, false);
  assert.equal(h.state().loading, 'loading');
  const saved = decodeWalk(calls.at(-1) ?? '');
  assert.equal(saved.ok, true);
  if (saved.ok) {
    assert.equal(saved.walk.status, 'paused');
    assert.equal(saved.walk.segments[0]?.length, 2);
  }
  latest.resolve();
  assert.deepEqual(await clearing, { ok: true });
  assert.equal(deleted, true);
  assert.equal(h.state().walk, null);
  h.emit({ ...fix, latitude: 2, timestamp: 13_000 });
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(h.state().walk, null);
  h.recorder.dispose();
});

test('disposing behind a busy write saves the latest paused route without publishing after cleanup', async () => {
  const pending = deferred<void>();
  const calls: string[] = [];
  const h = harness({
    write: async (raw) => {
      calls.push(raw);
      if (calls.length === 1) await pending.promise;
    },
  });
  await h.recorder.load();
  await h.recorder.start();
  h.emit(fix);
  await settle();
  h.emit({ ...fix, latitude: 0.003, timestamp: 10_000 });
  h.time(11_000);
  const published = h.state();
  h.recorder.dispose();
  h.emit({ ...fix, latitude: 1, timestamp: 12_000 });
  pending.resolve();
  await settle();
  assert.equal(calls.length, 2);
  const saved = decodeWalk(calls.at(-1) ?? '');
  assert.equal(saved.ok, true);
  if (saved.ok) {
    assert.equal(saved.walk.status, 'paused');
    assert.equal(saved.walk.segments[0]?.length, 2);
  }
  assert.equal(h.state(), published);
  assert.equal(h.removed(), 1);
});

test('busy storage defers serialization of superseded route snapshots', async () => {
  const pending = deferred<void>();
  const calls: string[] = [];
  let serializations = 0;
  // This point remains in every full route, so its JSON hook counts route
  // serializations without replacing the global JSON implementation.
  const countedFix = {
    ...fix,
    toJSON: () => {
      serializations += 1;
      return fix;
    },
  };
  const h = harness({
    write: async (raw) => {
      calls.push(raw);
      if (calls.length === 1) await pending.promise;
    },
  });
  try {
    await h.recorder.load();
    await h.recorder.start();
    h.emit(countedFix);
    await settle();
    assert.equal(serializations, 1);
    h.emit({ ...fix, latitude: 0.001, timestamp: 10_000 });
    h.emit({ ...fix, latitude: 0.002, timestamp: 20_000 });
    h.time(21_000);
    h.recorder.finish();
    assert.equal(serializations, 1);
    pending.resolve();
    await settle();
    assert.equal(serializations, 2);
    assert.equal(calls.length, 2);
    const saved = decodeWalk(calls.at(-1) ?? '');
    assert.equal(saved.ok, true);
    if (saved.ok) {
      assert.equal(saved.walk.status, 'complete');
      assert.deepEqual(
        saved.walk.segments[0]?.map((point) => point.latitude),
        [0, 0.001, 0.002],
      );
    }
    assert.equal(h.state().save.status, 'saved');
  } finally {
    pending.resolve();
    h.recorder.dispose();
    await settle();
  }
});

test('a long walk writes its route in batches and always on pause', async () => {
  const h = harness();
  await h.recorder.load();
  await h.recorder.start();
  // 25 fixes, one second and about 11 m apart: the first point, then every tenth.
  for (let index = 0; index < 25; index += 1) {
    h.emit({ ...fix, latitude: index * 0.0001, timestamp: 1_000 + index * 1_000 });
    await settle();
  }
  const points = (raw: string | undefined): number => {
    const saved = decodeWalk(raw ?? '');
    return saved.ok ? saved.walk.segments.flat().length : -1;
  };
  assert.deepEqual(h.writes.map(points), [1, 11, 21]);
  assert.equal(h.state().walk?.segments[0]?.length, 25);
  h.time(30_000);
  h.recorder.pause();
  await settle();
  assert.equal(points(h.writes.at(-1)), 25);
  assert.equal(h.writes.length, 4);
  // A slow trickle of fixes still writes at least every 30 seconds.
  await h.recorder.start();
  for (const [latitude, timestamp] of [
    [1, 40_000],
    [1.0001, 45_000],
  ]) {
    h.emit({ ...fix, latitude, timestamp });
    await settle();
  }
  const written = h.writes.length;
  h.emit({ ...fix, latitude: 1.0002, timestamp: 75_000 });
  await settle();
  assert.equal(h.writes.length, written + 1);
  assert.equal(points(h.writes.at(-1)), 28);
  h.recorder.dispose();
});
