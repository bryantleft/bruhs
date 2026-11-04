import assert from 'node:assert/strict';
import test from 'node:test';
import type { HealthDay } from '../game/game.ts';
import type { HealthRead, HealthRequest } from '../health/model.ts';
import { raceWeek } from './model.ts';
import { createStepSharing, type SharingState } from './sharing.ts';

const week = raceWeek(new Date('2026-10-28T12:00:00Z'));
const connection = {
  source: 'apple-health',
  enabled: true,
  startedOn: '2026-10-28',
  syncedAt: '2026-10-28T11:00:00Z',
} as const;

test('shares current-week native totals with no permission request or fabricated missing days', async () => {
  const requests: HealthRequest[] = [];
  const uploads: (readonly HealthDay[])[] = [];
  const states: SharingState[] = [];
  const share = createStepSharing(
    async (request) => {
      requests.push(request);
      return {
        status: 'read',
        source: 'apple-health',
        at: '2026-10-28T12:00:00Z',
        days: [
          { date: '2026-10-26', steps: 0 },
          { date: '2026-10-28', steps: 1200 },
        ],
      };
    },
    async (days) => {
      uploads.push(days);
      return { ok: true, value: true };
    },
    (state) => states.push(state),
  );
  await share.run({ week, connection, demo: false });
  assert.deepEqual(uploads, [
    [
      { date: '2026-10-26', steps: 0 },
      { date: '2026-10-28', steps: 1200 },
    ],
  ]);
  assert.equal(requests[0].requestPermission, false);
  assert.equal(requests[0].connection?.startedOn, '2026-10-26');
  assert.equal(states.at(-1)?.status, 'shared');
});

test('demo and paused Health never read or submit steps', async () => {
  let reads = 0,
    writes = 0;
  const share = createStepSharing(
    async () => {
      reads++;
      throw Error('Unexpected Health read');
    },
    async () => {
      writes++;
      return { ok: true, value: true };
    },
    () => {},
  );
  await share.run({ week, connection, demo: true });
  await share.run({ week, connection: { ...connection, enabled: false }, demo: false });
  await share.run({ week, connection: undefined, demo: false });
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test('leaving or pausing while Health is pending discards its late result', async () => {
  let resolve: (value: HealthRead) => void = () => {};
  const pending = new Promise<HealthRead>((r) => {
    resolve = r;
  });
  let writes = 0;
  const states: SharingState[] = [];
  const share = createStepSharing(
    () => pending,
    async () => {
      writes++;
      return { ok: true, value: true };
    },
    (state) => states.push(state),
  );
  const work = share.run({ week, connection, demo: false });
  await Promise.resolve();
  share.cancel();
  resolve({
    status: 'read',
    source: 'apple-health',
    at: '2026-10-28T12:00:00Z',
    days: [{ date: '2026-10-28', steps: 999 }],
  });
  await work;
  assert.equal(writes, 0);
  assert.equal(
    states.some((state) => state.status === 'shared'),
    false,
  );
});

test('empty, denied or mismatched Health results cannot post a score', async () => {
  for (const result of [
    { status: 'read', source: 'apple-health', at: '2026-10-28T12:00:00Z', days: [] },
    { status: 'permission-required', source: 'apple-health' },
    {
      status: 'read',
      source: 'health-connect',
      at: '2026-10-28T12:00:00Z',
      days: [{ date: '2026-10-28', steps: 500 }],
    },
  ] satisfies HealthRead[]) {
    let writes = 0;
    const states: SharingState[] = [];
    const share = createStepSharing(
      async () => result,
      async () => {
        writes++;
        return { ok: true, value: true };
      },
      (state) => states.push(state),
    );
    await share.run({ week, connection, demo: false });
    assert.equal(writes, 0);
    assert.notEqual(states.at(-1)?.status, 'shared');
  }
});

test('a canceled upload is aborted and a fresh sync can recover', async () => {
  let signal: AbortSignal | undefined;
  let complete: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let finish: (value: { ok: true; value: true }) => void = () => {};
  const upload = new Promise<{ ok: true; value: true }>((resolve) => {
    finish = resolve;
  });
  const states: SharingState[] = [];
  const share = createStepSharing(
    async () => ({
      status: 'read',
      source: 'apple-health',
      at: '2026-10-28T12:00:00Z',
      days: [{ date: '2026-10-28', steps: 500 }],
    }),
    (_days, abort) => {
      signal = abort;
      complete();
      return upload;
    },
    (state) => states.push(state),
  );
  const work = share.run({ week, connection, demo: false });
  await started;
  share.cancel();
  assert.equal(signal?.aborted, true);
  finish({ ok: true, value: true });
  await work;
  assert.equal(
    states.some((state) => state.status === 'shared'),
    false,
  );
  await share.run({ week, connection, demo: false });
  assert.equal(states.at(-1)?.status, 'shared');
});
