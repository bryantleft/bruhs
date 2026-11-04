import assert from 'node:assert/strict';
import test from 'node:test';
import type { HealthConnection } from '../game/game.ts';
import { parseHealthDays, syncStart } from './model.ts';

test('first connection reads today, while resumed sync catches missed days and late watch records', () => {
  const now = new Date(2026, 9, 21, 13);
  assert.equal(syncStart(undefined, 'apple-health', now).getTime(), new Date(2026, 9, 21).getTime());
  const connection: HealthConnection = {
    source: 'apple-health',
    enabled: true,
    startedOn: '2026-10-18',
    syncedAt: new Date(2026, 9, 19, 13).toISOString(),
  };
  assert.equal(syncStart(connection, 'apple-health', now).getTime(), new Date(2026, 9, 19).getTime());
  const current = { ...connection, syncedAt: now.toISOString() };
  assert.equal(syncStart(current, 'apple-health', now).getTime(), new Date(2026, 9, 20).getTime());
  assert.equal(
    syncStart({ ...current, startedOn: '2026-10-21' }, 'apple-health', now).getTime(),
    new Date(2026, 9, 21).getTime(),
  );
  assert.equal(
    syncStart({ ...connection, enabled: false }, 'apple-health', now).getTime(),
    new Date(2026, 9, 21).getTime(),
  );
  assert.equal(syncStart(connection, 'health-connect', now).getTime(), new Date(2026, 9, 21).getTime());
});

test('calendar-day sync starts at local midnight across daylight saving transitions', () => {
  const now = new Date(2026, 10, 2, 13);
  const connection: HealthConnection = {
    source: 'health-connect',
    enabled: true,
    startedOn: '2026-10-30',
    syncedAt: now.toISOString(),
  };
  assert.equal(syncStart(connection, 'health-connect', now).getTime(), new Date(2026, 10, 1).getTime());
});

test('step snapshots validate dates and counts before they can award game progress', () => {
  const start = new Date(2026, 9, 21);
  const end = new Date(2026, 9, 21, 23);
  assert.deepEqual(parseHealthDays([{ start, steps: 1234.6 }], start, end), [
    { date: '2026-10-21', steps: 1235 },
  ]);
  assert.deepEqual(parseHealthDays([{ start, steps: undefined }], start, end), []);
  for (const rows of [
    [{ start, steps: Number.NaN }],
    [{ start, steps: -1 }],
    [{ start: new Date('broken'), steps: 5 }],
    [{ start: new Date(2026, 9, 22), steps: 5 }],
    [
      { start, steps: 1 },
      { start, steps: 2 },
    ],
  ]) {
    assert.throws(() => parseHealthDays(rows, start, end));
  }
});

test('HealthKit overlap buckets keep the requested day without rejecting crossing samples', async () => {
  const { parseHealthKitDays } = await import('./model.ts');
  const start = new Date(2026, 9, 21);
  const end = new Date(2026, 9, 21, 12);
  assert.deepEqual(
    parseHealthKitDays(
      [
        { startDate: new Date(2026, 9, 20), sumQuantity: { quantity: 15 } },
        { startDate: start, sumQuantity: { quantity: 25 } },
        { startDate: new Date(2026, 9, 22), sumQuantity: { quantity: 5 } },
      ],
      start,
      end,
    ),
    [{ date: '2026-10-21', steps: 25 }],
  );
});

test('timezone travel cannot put a saved start day after the query end', () => {
  const now = new Date(2026, 9, 21, 17);
  const connection: HealthConnection = {
    source: 'apple-health',
    enabled: true,
    startedOn: '2026-10-22',
    syncedAt: new Date(2026, 9, 21, 16).toISOString(),
  };
  assert.equal(syncStart(connection, 'apple-health', now).getTime(), new Date(2026, 9, 21).getTime());
  assert.ok(syncStart(connection, 'apple-health', now) <= now);
});
