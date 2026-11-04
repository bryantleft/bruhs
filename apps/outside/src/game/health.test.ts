import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, decodeGame, getDay, unspentSteps, updateGame } from './game.ts';

const TODAY = '2026-10-21';
const AT = '2026-10-21T18:00:00.000Z';

test('health totals replace sensor additions with one atomic, repeatable import', () => {
  const original = updateGame(createGame(TODAY), { type: 'add-steps', date: TODAY, steps: 1_000 });
  const action = {
    type: 'health-sync',
    date: TODAY,
    source: 'apple-health',
    at: AT,
    days: [{ date: TODAY, steps: 6_240 }],
  } as const;
  const synced = updateGame(original, action);
  assert.equal(getDay(synced, TODAY).steps, 6_240);
  assert.equal(unspentSteps(synced), 6_240);
  assert.equal(unspentSteps(updateGame(synced, action)), 6_240);
  assert.deepEqual(synced.health, { source: 'apple-health', enabled: true, syncedAt: AT, startedOn: TODAY });
  assert.equal(getDay(original, TODAY).steps, 1_000);
});

test('health backfill preserves goals and already-earned progress', () => {
  const yesterday = '2026-10-20';
  let game = updateGame(createGame(yesterday), { type: 'add-steps', date: yesterday, steps: 1_000 });
  game = updateGame(game, { type: 'goal', date: TODAY, goal: 4_000 });
  game = updateGame(game, { type: 'travel', to: 'pandan-woods', next: 'chop-pandan' });
  const synced = updateGame(game, {
    type: 'health-sync',
    date: TODAY,
    source: 'health-connect',
    at: AT,
    days: [
      { date: yesterday, steps: 8_000 },
      { date: TODAY, steps: 2_000 },
    ],
  });
  assert.equal(getDay(synced, yesterday).goal, 8_000);
  assert.equal(getDay(synced, TODAY).goal, 4_000);
  assert.equal(synced.spent, 10_000);
  const corrected = updateGame(synced, {
    type: 'health-sync',
    date: TODAY,
    source: 'health-connect',
    at: '2026-10-21T18:01:00.000Z',
    days: [
      { date: yesterday, steps: 0 },
      { date: TODAY, steps: 0 },
    ],
  });
  assert.deepEqual(corrected.xp, synced.xp);
  assert.deepEqual(corrected.bank, synced.bank);
});

test('health sync rejects a corrupt batch without importing part of it', () => {
  const game = createGame(TODAY);
  for (const days of [
    [
      { date: TODAY, steps: 10 },
      { date: TODAY, steps: 20 },
    ],
    [{ date: TODAY, steps: Number.NaN }],
    [{ date: TODAY, steps: -1 }],
    [{ date: '2026-02-31', steps: 4 }],
    [{ date: '2026-10-22', steps: 4 }],
  ]) {
    assert.equal(
      updateGame(game, { type: 'health-sync', date: TODAY, source: 'apple-health', at: AT, days }),
      game,
    );
  }
});

test('pause is persisted and progress still loads without a health connection', () => {
  const fresh = createGame(TODAY);
  assert.deepEqual(decodeGame(JSON.stringify(fresh), TODAY), { ok: true, game: fresh, migrated: false });
  const synced = updateGame(fresh, {
    type: 'health-sync',
    date: TODAY,
    source: 'health-connect',
    at: AT,
    days: [{ date: TODAY, steps: 2_000 }],
  });
  const paused = updateGame(synced, { type: 'health-pause' });
  assert.equal(paused.health?.enabled, false);
  assert.equal(getDay(paused, TODAY).steps, 2_000);
  assert.deepEqual(decodeGame(JSON.stringify(paused), TODAY), { ok: true, game: paused, migrated: false });
  const tampered = decodeGame(
    JSON.stringify({ ...paused, health: { source: 'made-up', enabled: true, syncedAt: AT } }),
    TODAY,
  );
  assert.equal(tampered.ok && tampered.game.health, undefined);
});
