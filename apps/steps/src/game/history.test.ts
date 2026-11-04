import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoGame, createGame, type Game } from './game.ts';
import { recentWeek } from './history.ts';

test('a first day with zero steps is distinct from six missing history entries', () => {
  const game = createGame('2026-03-09');
  const before = JSON.stringify(game);
  const week = recentWeek(game, '2026-03-09');
  assert.deepEqual(
    week.days.map((day) => day.date),
    ['2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09'],
  );
  assert.equal(week.days.filter((day) => day.entry === null).length, 6);
  assert.equal(week.days.at(-1)?.entry, game.days[0]);
  assert.deepEqual([week.total, week.logged, week.completed, week.scale], [0, 1, 0, 8_000]);
  assert.equal(JSON.stringify(game), before);
});

test('sparse history counts stored days and their own goals within the rolling week', () => {
  const game: Game = {
    ...createGame('2026-01-03'),
    goal: 4_000,
    days: [
      { date: '2025-12-27', steps: 100_000, goal: 4_000 },
      { date: '2025-12-29', steps: 6_000, goal: 4_000 },
      { date: '2025-12-30', steps: 5_000, goal: 10_000 },
      { date: '2026-01-03', steps: 0, goal: 4_000 },
      { date: '2026-01-04', steps: 20_000, goal: 4_000 },
    ],
  };
  const week = recentWeek(game, '2026-01-03');
  assert.equal(week.days[0]?.date, '2025-12-28');
  assert.equal(week.days.at(-1)?.date, '2026-01-03');
  assert.equal(week.days.filter((day) => day.entry === null).length, 4);
  assert.deepEqual([week.total, week.logged, week.completed, week.scale], [11_000, 3, 1, 6_000]);
});

test('a full demo week retains exact daily totals and its completed goals', () => {
  const game = createDemoGame('2026-10-21');
  const week = recentWeek(game, '2026-10-21');
  assert.deepEqual(
    week.days.map((day) => day.entry),
    game.days,
  );
  assert.deepEqual([week.total, week.logged, week.completed, week.scale], [58_290, 7, 5, 10_150]);
});
