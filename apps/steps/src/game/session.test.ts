import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoGame, createGame, type Game, updateGame } from './game.ts';
import { createSession, reduceSession } from './session.ts';
import { xpForLevel } from './xp.ts';

const TODAY = '2026-10-20';

test('a real sync opens a loot report with xp, items and level-ups', () => {
  let game = updateGame(createGame(TODAY), { type: 'travel', to: 'pandan-woods', next: 'chop-pandan' });
  game = { ...game };
  const before = createSession(game);
  const after = reduceSession(before, {
    type: 'play',
    action: { type: 'sync-steps', date: TODAY, steps: 3_000 },
    demo: false,
  });
  const report = after.reward;
  assert.ok(report);
  assert.equal(report.steps, 3_000);
  assert.equal(report.arrived, 'pandan-woods');
  assert.ok(report.actions >= 40);
  assert.ok(report.levels.some((entry) => entry.skill === 'woodcutting' && entry.level > 5));
  assert.ok(report.gained.some((stack) => stack.item === 'pandan-logs' && stack.qty === report.actions));
  // Re-reading the same total is a no-op.
  assert.equal(
    reduceSession(after, {
      type: 'play',
      action: { type: 'sync-steps', date: TODAY, steps: 3_000 },
      demo: false,
    }),
    after,
  );
});

test('consecutive reports merge until dismissed', () => {
  const game = updateGame(
    { ...createGame(TODAY), location: 'pandan-woods' },
    { type: 'start', activity: 'chop-pandan' },
  );
  let session = createSession(game);
  for (const steps of [600, 1_200])
    session = reduceSession(session, {
      type: 'play',
      action: { type: 'sync-steps', date: TODAY, steps },
      demo: false,
    });
  assert.equal(session.reward?.steps, 1_200);
  session = reduceSession(session, { type: 'dismiss-reward' });
  assert.equal(session.reward, null);
});

test('a small demo walk flashes a gain instead of a report', () => {
  const game = updateGame(
    {
      ...createGame(TODAY),
      location: 'pandan-woods',
      xp: { ...createGame(TODAY).xp, woodcutting: xpForLevel(20) },
    },
    { type: 'start', activity: 'chop-pandan' },
  );
  const session = reduceSession(createSession(game), {
    type: 'play',
    action: { type: 'add-steps', date: TODAY, steps: 47 },
    demo: true,
  });
  assert.equal(session.reward, null);
  assert.equal(session.gain?.text, '+18 xp · +1 pandan logs'); // 15 woodcutting + 3 agility
});

test('quest completion is a milestone; claims and sales are notices', () => {
  let game: Game = { ...createGame(TODAY), bank: { minnow: 5, 'pandan-logs': 4 } };
  game = updateGame(game, { type: 'quest-start', quest: 'hungry-innkeeper' });
  const done = reduceSession(createSession(game), {
    type: 'play',
    action: { type: 'quest-complete', quest: 'hungry-innkeeper' },
    demo: false,
  });
  assert.equal(done.reward?.quest, 'hungry-innkeeper');
  assert.equal(done.reward?.coins, 100);
  const sold = reduceSession(done, {
    type: 'play',
    action: { type: 'sell', item: 'pandan-logs', qty: 4 },
    demo: false,
  });
  assert.equal(sold.notice?.message, 'sold 4 pandan logs for 8 coins.');
  const walked = reduceSession(sold, {
    type: 'play',
    action: { type: 'add-steps', date: TODAY, steps: 8_000 },
    demo: true,
  });
  const collected = reduceSession(walked, {
    type: 'play',
    action: { type: 'mission-claim', date: TODAY, period: 'daily', mission: 'daily-steps' },
    demo: false,
  });
  assert.equal(collected.notice?.message, 'daily walk complete. +150 coins.');
  assert.equal(collected.reward, walked.reward);
});

test('restoring progress and blocked actions do not trigger fresh rewards', () => {
  const initial = createSession(createGame(TODAY));
  const restored = reduceSession(initial, { type: 'restore', game: createDemoGame(TODAY) });
  assert.equal(restored.reward, null);
  assert.equal(restored.gain, null);
  const blocked = {
    type: 'play',
    action: { type: 'mission-claim', date: TODAY, period: 'daily', mission: 'daily-steps' },
    demo: true,
  } as const;
  assert.equal(reduceSession(initial, blocked), initial);
});

test('save failures stay visible until a later save succeeds', () => {
  let session = createSession(createGame(TODAY));
  session = reduceSession(session, { type: 'save-failed', message: 'unsaved progress. check storage.' });
  session = reduceSession(session, { type: 'notice', message: 'hello' });
  assert.equal(session.notice?.kind, 'error');
  session = reduceSession(session, { type: 'save-succeeded' });
  assert.equal(session.notice, null);
});

test('opening a chest opens a loot report', () => {
  const session = reduceSession(createSession(createGame(TODAY)), {
    type: 'play',
    action: { type: 'open', item: 'bird-nest', count: 1 },
    demo: true,
  });
  assert.equal(session.reward?.opened, 1);
  assert.ok((session.reward?.gained.length ?? 0) > 0 || (session.reward?.coins ?? 0) > 0);
  assert.equal(session.gain, null);
});

test('eating, banking and equipping post notices, not reports', () => {
  const session = reduceSession(createSession(createGame(TODAY)), {
    type: 'play',
    action: { type: 'eat', item: 'minnow' },
    demo: true,
  });
  assert.equal(session.reward, null);
  assert.equal(session.notice?.message, 'ate the minnow. its bonus lasts 40 actions.');
});
