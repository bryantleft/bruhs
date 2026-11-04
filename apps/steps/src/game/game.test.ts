import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVITIES,
  BAG_UPGRADES,
  FIXED_MISSIONS,
  getActivity,
  getItem,
  getQuest,
  ITEMS,
  LOCATIONS,
  MISSION_PERIODS,
  MISSION_POOLS,
  QUESTS,
  ROADS,
  SKILL_CHEST,
  START_LOCATION,
  STORE_STOCK,
} from './content.ts';
import {
  actionPreview,
  advance,
  capacityOf,
  createDemoGame,
  createGame,
  dayBefore,
  decodeGame,
  type Game,
  getDay,
  missionProgress,
  missionsFor,
  nextBagUpgrade,
  nextStep,
  periodDaysLeft,
  periodRange,
  readyMissions,
  route,
  runsLeft,
  skillLevel,
  stepsPerAction,
  streak,
  totalLevel,
  travelCost,
  unspentSteps,
  updateGame,
} from './game.ts';
import { countOf, keyMods, parseKey, slotsUsed } from './items.ts';
import { loadFailureCopy } from './session.ts';
import { levelForXp, XP_TABLE, xpForLevel } from './xp.ts';

const TODAY = '2026-11-02';

function walk(game: Game, steps: number): Game {
  return updateGame(game, { type: 'add-steps', date: TODAY, steps });
}

function at(location: string, patch: Partial<Game> = {}): Game {
  return { ...createGame(TODAY), inventory: {}, location, ...patch };
}

function withLevel(game: Game, skill: keyof Game['xp'], level: number): Game {
  return { ...game, xp: { ...game.xp, [skill]: xpForLevel(level) } };
}

test('the XP curve matches RuneScape', () => {
  assert.equal(xpForLevel(2), 83);
  assert.equal(xpForLevel(10), 1_154);
  assert.equal(xpForLevel(50), 101_333);
  assert.equal(xpForLevel(99), 13_034_431);
  assert.equal(XP_TABLE.length, 100);
  assert.equal(levelForXp(82), 1);
  assert.equal(levelForXp(200_000_000), 99);
});

test('idle steps wait in the pouch and pay for the next task', () => {
  const idle = walk(createGame(TODAY), 600);
  assert.equal(unspentSteps(idle), 600);
  const woods = updateGame(updateGame(idle, { type: 'travel', to: 'pandan-woods' }), {
    type: 'start',
    activity: 'chop-pandan',
  });
  assert.equal(woods.location, 'pandan-woods');
  // 500 road steps; then a bronze axe (+5% efficiency) chops in 58 steps: one log, 42 steps in.
  assert.equal(woods.inventory['pandan-logs'], 1);
  assert.equal(woods.task?.progress, 42);
  assert.equal(woods.xp.woodcutting, 15);
  // Agility: 500 road steps / 4 = 125 at level 1, then 100 work steps / 12 = 8 points at level 2 (×1.08).
  assert.equal(woods.xp.agility, 134);
  assert.ok(woods.seen.includes('pandan-logs'));
});

test('agility trains on every step and keeps pace with its level', () => {
  const road = (level: number): number => {
    const game = withLevel({ ...createGame(TODAY), inventory: {} }, 'agility', level);
    const walked = walk(updateGame(game, { type: 'travel', to: 'longan-lake' }), 900);
    return walked.xp.agility - game.xp.agility;
  };
  // 900 road steps are 225 points at level 1. Level 26 walks it in 819 steps (204 points), each
  // worth 8% more per level above 1: ×3.
  assert.equal(road(1), 225);
  assert.equal(road(26), 612);
  // Small syncs add up exactly: 12 work steps synced one at a time still earn their point.
  let game = updateGame(
    { ...createGame(TODAY), location: 'pandan-woods' },
    { type: 'start', activity: 'chop-pandan' },
  );
  for (let step = 0; step < 12; step += 1) game = walk(game, 1);
  assert.equal(game.xp.agility, 1);
});

test('a queued activity starts on arrival', () => {
  const game = updateGame(createGame(TODAY), { type: 'travel', to: 'pebble-hills', next: 'mine-copper' });
  const arrived = walk(game, 600 + 58 * 3);
  assert.equal(arrived.travel, null);
  assert.equal(arrived.task?.id, 'mine-copper');
  assert.equal(arrived.inventory['copper-ore'], 3);
});

test('steps are spent once, whatever the order of syncs', () => {
  let game = updateGame(createGame(TODAY), { type: 'travel', to: 'pandan-woods', next: 'chop-pandan' });
  game = updateGame(game, { type: 'sync-steps', date: TODAY, steps: 2_000 });
  assert.equal(updateGame(game, { type: 'sync-steps', date: TODAY, steps: 2_000 }), game);
  assert.equal(game.spent, 2_000);
  assert.ok((game.inventory['pandan-logs'] ?? 0) >= 25);
});

test('work efficiency comes from tools, gear, food and levels, with a floor', () => {
  const chop = getActivity('chop-pandan');
  assert.ok(chop);
  const fresh = createGame(TODAY);
  assert.equal(stepsPerAction(fresh, chop), 58);
  assert.equal(stepsPerAction({ ...fresh, tools: { ...fresh.tools, axe: 'iron-axe' } }, chop), 53);
  assert.equal(stepsPerAction(withLevel(fresh, 'woodcutting', 99), chop), 47);
  const maxed = { ...withLevel(fresh, 'woodcutting', 99), tools: { ...fresh.tools, axe: 'mithril-axe' } };
  assert.equal(stepsPerAction(maxed, chop), 37);
  const stacked = { ...maxed, gear: { head: 'lumberjack-cap@4', legs: 'woodsman-trousers@4' } };
  assert.equal(stepsPerAction(stacked, chop), 31);
  // No amount of efficiency drops an action below half its base steps.
  assert.equal(stepsPerAction({ ...stacked, gear: { ...stacked.gear, neck: 'diamond-amulet@4' } }, chop), 30);
  const pick = getActivity('pick-rambutan');
  assert.ok(pick);
  assert.equal(stepsPerAction({ ...fresh, gear: { head: 'straw-hat' } }, pick), 55);
  assert.equal(stepsPerAction({ ...fresh, buff: { item: 'minnow', actions: 3 } }, pick), 56);
});

test('production uses the inventory, and the bank when standing at one', () => {
  let game = at('bruhbridge', { inventory: { 'copper-ore': 2, 'tin-ore': 3 } });
  game = walk(updateGame(game, { type: 'start', activity: 'smelt-bronze' }), 60 * 5);
  assert.equal(game.inventory['bronze-bar'], 2);
  assert.equal(game.inventory['tin-ore'], 1);
  assert.deepEqual(game.stopped, { activity: 'smelt-bronze', kind: 'missing', item: 'copper-ore' });
  assert.equal(unspentSteps(game), 180);
  let banked = at('bruhbridge', { bank: { 'copper-ore': 2, 'tin-ore': 2 } });
  banked = walk(updateGame(banked, { type: 'start', activity: 'smelt-bronze' }), 120);
  assert.equal(banked.inventory['bronze-bar'], 2);
  assert.deepEqual(banked.bank, {});
});

test('a full inventory stops gathering and keeps the steps', () => {
  let game = at('pandan-woods', { inventory: { 'pandan-logs': 25 * 27 + 24 } });
  game = walk(updateGame(game, { type: 'start', activity: 'chop-pandan' }), 1_000);
  assert.equal(game.inventory['pandan-logs'], 700);
  assert.deepEqual(game.stopped, { activity: 'chop-pandan', kind: 'bag-full' });
  assert.ok(unspentSteps(game) > 900);
});

test('backpacks add slots and gear swaps through the inventory', () => {
  let game = at('pandan-woods', { inventory: { 'wicker-pack': 1, 'straw-hat@2': 1, 'straw-hat': 1 } });
  game = updateGame(game, { type: 'wear', item: 'wicker-pack' });
  assert.equal(game.gear.back, 'wicker-pack');
  assert.equal(capacityOf(game), 32);
  game = updateGame(game, { type: 'wear', item: 'straw-hat@2' });
  game = updateGame(game, { type: 'wear', item: 'straw-hat' });
  assert.equal(game.gear.head, 'straw-hat');
  assert.equal(game.inventory['straw-hat@2'], 1);
  game = updateGame(game, { type: 'unwear', slot: 'head' });
  assert.equal(game.gear.head, undefined);
  assert.equal(game.inventory['straw-hat'], 1);
  // Taking the pack off with 30 slots in use would overflow a 28-slot bag away from a bank.
  const crowded = { ...game, inventory: { ...game.inventory, 'pandan-logs': 25 * 28 } };
  assert.equal(updateGame(crowded, { type: 'unwear', slot: 'back' }), crowded);
});

test('swapping to a smaller pack on a full bag is refused', () => {
  // 40 of 40 slots: a starwood pack (+12) worn, a wicker pack (+4) and 39 stacks of logs carried.
  const full = at('pandan-woods', {
    gear: { back: 'starwood-pack' },
    inventory: { 'wicker-pack': 1, 'pandan-logs': 25 * 39 },
  });
  assert.equal(capacityOf(full), 40);
  assert.equal(slotsUsed(full.inventory), 40);
  assert.equal(updateGame(full, { type: 'wear', item: 'wicker-pack', slot: 'back' }), full);
  // A bank takes the old pack, but 39 slots still overflow a 32-slot bag.
  const town = { ...full, location: 'bruhbridge' };
  assert.equal(updateGame(town, { type: 'wear', item: 'wicker-pack', slot: 'back' }), town);
  // With room for it, the swap goes through and the old pack lands in the bag.
  const roomy = { ...full, inventory: { 'wicker-pack': 1, 'pandan-logs': 25 * 30 } };
  const swapped = updateGame(roomy, { type: 'wear', item: 'wicker-pack', slot: 'back' });
  assert.equal(swapped.gear.back, 'wicker-pack');
  assert.equal(swapped.inventory['starwood-pack'], 1);
  assert.ok(slotsUsed(swapped.inventory) <= capacityOf(swapped));
  // At a bank, a swap that only fits without the old pack sends it to the bank.
  const snug = { ...town, inventory: { 'wicker-pack': 1, 'pandan-logs': 25 * 32 } };
  const banked = updateGame(snug, { type: 'wear', item: 'wicker-pack', slot: 'back' });
  assert.equal(banked.gear.back, 'wicker-pack');
  assert.equal(banked.inventory['starwood-pack'], undefined);
  assert.equal(banked.bank['starwood-pack'], 1);
  assert.equal(slotsUsed(banked.inventory), capacityOf(banked));
});

test('tools need a level to wield', () => {
  const game = at('pandan-woods', { inventory: { 'iron-axe': 1 } });
  assert.equal(updateGame(game, { type: 'wear', item: 'iron-axe' }), game);
  const wielded = updateGame(withLevel(game, 'woodcutting', 10), { type: 'wear', item: 'iron-axe' });
  assert.equal(wielded.tools.axe, 'iron-axe');
  assert.deepEqual(wielded.inventory, { 'bronze-axe': 1 });
});

test('quality multiplies every stat on a piece', () => {
  assert.deepEqual(keyMods('fisher-vest@4'), [
    { stat: 'efficiency', value: 0.1, skill: 'fishing' },
    { stat: 'doubleAction', value: 0.04, skill: 'fishing' },
  ]);
  assert.equal(keyMods('forager-pack@2')[0]?.value, 12);
  assert.deepEqual(parseKey('ruby-ring@3'), { id: 'ruby-ring', quality: 3 });
});

test('food buffs last a number of actions', () => {
  let game = at('pandan-woods', { inventory: { mangosteen: 2 } });
  game = updateGame(game, { type: 'eat', item: 'mangosteen' });
  assert.deepEqual(game.buff, { item: 'mangosteen', actions: 50 });
  assert.equal(game.inventory.mangosteen, 1);
  game = walk(updateGame(game, { type: 'start', activity: 'chop-pandan' }), 58 * 10);
  assert.equal(game.buff?.actions, 50 - game.actions);
  game = walk(game, 58 * 50);
  assert.equal(game.buff, null);
  assert.equal(updateGame(at('pandan-woods'), { type: 'eat', item: 'pandan-logs' }).buff, null);
});

test('chests open into coins and loot, deterministically', () => {
  const game = at('pandan-woods', { inventory: { 'bird-nest': 5 }, coins: 0 });
  const opened = updateGame(game, { type: 'open', item: 'bird-nest', count: 5 });
  assert.equal(opened.inventory['bird-nest'], undefined);
  assert.ok(opened.coins >= 50 && opened.coins <= 200);
  assert.ok(Object.keys(opened.inventory).length > 0);
  assert.equal(opened.stats.chestsOpened, 5);
  assert.deepEqual(updateGame(game, { type: 'open', item: 'bird-nest', count: 5 }), opened);
  assert.equal(updateGame(game, { type: 'open', item: 'bird-nest', count: 6 }), game);
  // Chests live in the treasury and never take inventory slots.
  assert.equal(slotsUsed({ 'bird-nest': 99, 'adventurer-chest': 3 }), 0);
});

test('long grinds find chests and gems', () => {
  let game = withLevel(at('durian-dunes'), 'mining', 40);
  game = updateGame(game, { type: 'start', activity: 'mine-iron' });
  game = walk(game, 60_000);
  const found = ['sapphire', 'emerald', 'ruby', 'diamond', 'miner-crate', 'adventurer-chest'].reduce(
    (sum, id) => sum + countOf(game.inventory, id),
    0,
  );
  assert.ok(found > 0);
  assert.equal((game.stats.chestsFound ?? 0) + (game.stats.finds ?? 0), found);
});

test('save materials and double actions come from gear', () => {
  let game = withLevel(at('bruhbridge', { bank: { 'copper-ore': 400, 'tin-ore': 400 } }), 'smithing', 30);
  game = { ...game, gear: { chest: 'forge-apron@4', neck: 'emerald-amulet@4' } };
  game = walk(updateGame(game, { type: 'start', activity: 'smelt-bronze' }), 60 * 200);
  assert.ok((game.stats.preserved ?? 0) > 30);
  assert.ok(countOf(game.inventory, 'bronze-bar') > 400 - countOf(game.bank, 'copper-ore'));
});

test('crafting rolls gear quality and better crafters roll better', () => {
  const craft = (level: number): Game => {
    let game = withLevel(at('bruhbridge', { bank: { linen: 400 } }), 'crafting', level);
    game = updateGame(game, { type: 'start', activity: 'make-straw-hat' });
    return walk(game, 400 * 60);
  };
  const share = (game: Game): number => {
    const hats = Object.entries(game.inventory).filter(([key]) => parseKey(key).id === 'straw-hat');
    const total = hats.reduce((sum, [, qty]) => sum + qty, 0);
    return hats.filter(([key]) => parseKey(key).quality >= 2).reduce((sum, [, qty]) => sum + qty, 0) / total;
  };
  const novice = craft(1);
  const master = craft(60);
  assert.ok(Object.keys(novice.inventory).some((key) => key.startsWith('straw-hat@')));
  assert.ok(share(master) > share(novice));
  const activity = getActivity('make-straw-hat');
  assert.ok(activity);
  const preview = actionPreview(master, activity);
  assert.ok(Math.abs(preview.quality.reduce((sum, chance) => sum + chance, 0) - 1) < 1e-9);
});

test('banking only works in bank towns', () => {
  const town = at('bruhbridge', { inventory: { 'pandan-logs': 30, minnow: 2, 'bird-nest': 1 } });
  const banked = updateGame(town, { type: 'deposit-all' });
  // Chests stay in the bag, ready to open; they take no slots.
  assert.deepEqual(banked.inventory, { 'bird-nest': 1 });
  assert.deepEqual(banked.bank, { 'pandan-logs': 30, minnow: 2 });
  const back = updateGame(banked, { type: 'withdraw', item: 'minnow', qty: 2 });
  assert.deepEqual(back.inventory, { 'bird-nest': 1, minnow: 2 });
  const away = { ...town, location: 'pandan-woods' };
  assert.equal(updateGame(away, { type: 'deposit-all' }), away);
  const crowded = { ...banked, inventory: { coal: 25 * 28 } };
  assert.equal(updateGame(crowded, { type: 'withdraw', item: 'minnow', qty: 1 }), crowded);
  assert.deepEqual(updateGame(away, { type: 'drop', item: 'minnow', qty: 2 }).inventory, {
    'pandan-logs': 30,
    'bird-nest': 1,
  });
});

test('stores trade in town from bag or bank', () => {
  const game = at('bruhbridge', { inventory: { 'pandan-logs': 6 }, bank: { 'pandan-logs': 4 }, coins: 0 });
  const sold = updateGame(game, { type: 'sell', item: 'pandan-logs', qty: 10 });
  assert.equal(sold.coins, 20);
  assert.deepEqual([sold.inventory, sold.bank], [{}, {}]);
  assert.equal(updateGame(game, { type: 'sell', item: 'pandan-logs', qty: 11 }), game);
  const away = { ...game, location: 'pandan-woods' };
  assert.equal(updateGame(away, { type: 'sell', item: 'pandan-logs', qty: 1 }), away);
  const bought = updateGame({ ...game, coins: 1_000 }, { type: 'buy', item: 'iron-axe' });
  assert.equal(bought.coins, 760);
  assert.equal(bought.inventory['iron-axe'], 1);
  const fine = updateGame(
    { ...game, coins: 0, inventory: { 'straw-hat@3': 1 } },
    { type: 'sell', item: 'straw-hat@3', qty: 1 },
  );
  assert.equal(fine.coins, 35);
});

test('travel follows the shortest road; agility and boots shorten it', () => {
  assert.deepEqual(route('bruhbridge', 'longan-lake'), {
    distance: 900,
    path: ['bruhbridge', 'longan-lake'],
  });
  assert.equal(route('bruhbridge', 'durian-dunes')?.distance, 1_500);
  const fresh = createGame(TODAY);
  assert.equal(travelCost(fresh, 1_000), 1_000);
  const agile = withLevel(fresh, 'agility', 99);
  assert.equal(travelCost(agile, 1_000), 719);
  assert.equal(travelCost({ ...agile, gear: { feet: 'seven-league-boots' } }, 1_000), 610);
  assert.equal(updateGame(fresh, { type: 'travel', to: 'dragonfruit-peak' }), fresh);
  assert.equal(updateGame(fresh, { type: 'travel', to: 'mangosteen-marsh' }), fresh);
});

test('quests are handed in where the giver lives', () => {
  const quest = QUESTS[0];
  assert.ok(quest);
  let game = at('bruhbridge', { inventory: { minnow: 3 }, bank: { minnow: 4 } });
  game = updateGame(game, { type: 'quest-start', quest: quest.id });
  game = updateGame(game, { type: 'quest-complete', quest: quest.id });
  assert.equal(game.quests[quest.id], 'done');
  assert.equal(countOf(game.inventory, 'minnow') + countOf(game.bank, 'minnow'), 2);
  assert.equal(game.coins, 125);
  let rocks = withLevel(
    at('bruhbridge', { inventory: { 'copper-ore': 10, 'tin-ore': 10, 'iron-ore': 5 } }),
    'mining',
    10,
  );
  rocks = updateGame(rocks, { type: 'quest-start', quest: 'rock-collector' });
  assert.equal(updateGame(rocks, { type: 'quest-complete', quest: 'rock-collector' }), rocks);
  const delivered = updateGame(
    { ...rocks, location: 'pebble-hills' },
    { type: 'quest-complete', quest: 'rock-collector' },
  );
  assert.equal(delivered.inventory['iron-pickaxe'], 1);
  const fashion = withLevel(
    at('blueberry-bay', { inventory: { 'straw-hat@4': 1, 'linen-gloves': 1, 'travel-boots@1': 1 } }),
    'crafting',
    12,
  );
  const shown = updateGame(updateGame(fashion, { type: 'quest-start', quest: 'fashion-show' }), {
    type: 'quest-complete',
    quest: 'fashion-show',
  });
  assert.equal(shown.quests['fashion-show'], 'done');
  assert.equal(shown.inventory['wicker-pack'], 1);
});

test('mission periods start on the day, the monday and the first of the month', () => {
  // 2026-11-02 is a Monday.
  assert.deepEqual(periodRange('daily', TODAY), { start: TODAY, end: TODAY });
  assert.deepEqual(periodRange('weekly', '2026-11-08'), { start: '2026-11-02', end: '2026-11-08' });
  assert.deepEqual(periodRange('weekly', '2026-11-09'), { start: '2026-11-09', end: '2026-11-15' });
  assert.deepEqual(periodRange('monthly', '2026-02-14'), { start: '2026-02-01', end: '2026-02-28' });
  assert.equal(periodDaysLeft('weekly', TODAY), 6);
  assert.equal(periodDaysLeft('monthly', '2026-11-30'), 0);
});

test('the daily walk pays once when the goal is met; drawn missions stay put all period', () => {
  const fresh = createGame(TODAY);
  const short = walk(fresh, 7_999);
  const claim = { type: 'mission-claim', date: TODAY, period: 'daily', mission: 'daily-steps' } as const;
  assert.equal(updateGame(short, claim), short);
  const walked = walk(short, 1);
  const paid = updateGame(walked, claim);
  assert.equal(paid.coins, walked.coins + 150);
  assert.equal(updateGame(paid, claim), paid);
  assert.equal(readyMissions(paid, TODAY).length, 0);
  // Three missions each period: the walk plus two draws, the same draws all week.
  const week = missionsFor(paid, 'weekly', TODAY).map((mission) => mission.id);
  assert.equal(week.length, 3);
  assert.equal(week[0], 'weekly-steps');
  const later = updateGame(paid, { type: 'new-day', date: '2026-11-05' });
  assert.deepEqual(
    missionsFor(later, 'weekly', '2026-11-05').map((mission) => mission.id),
    week,
  );
  // The weekly walk counts every day of the week against five daily goals.
  const walkWeek = missionsFor(later, 'weekly', '2026-11-05')[0];
  assert.ok(walkWeek);
  assert.deepEqual(missionProgress(later, walkWeek, '2026-11-05'), {
    value: 8_000,
    target: 40_000,
  });
});

test('a new save opens its missions at once, and the draw holds while the dice move', () => {
  const fresh = createGame(TODAY);
  assert.ok(fresh.missions.daily);
  const before = missionsFor(fresh, 'daily', TODAY).map((mission) => mission.id);
  // Spending the pouch without a sync rolls dice but must not redraw or reset missions.
  let game = { ...walk(fresh, 600), location: 'pandan-woods' };
  game = updateGame(game, { type: 'start', activity: 'chop-pandan' });
  assert.notEqual(game.seed, fresh.seed);
  assert.deepEqual(
    missionsFor(game, 'daily', TODAY).map((mission) => mission.id),
    before,
  );
  const lumber = MISSION_POOLS.weekly.find((entry) => entry.id === 'weekly-woodcutting');
  assert.ok(lumber);
  assert.ok(missionProgress(game, lumber, TODAY).value > 0);
});

test('action missions count only work done this period', () => {
  let game = { ...createGame(TODAY), location: 'pandan-woods', inventory: {} };
  game = updateGame(game, { type: 'start', activity: 'chop-pandan' });
  game = walk(game, 58 * 10);
  const mission = MISSION_POOLS.daily.find((entry) => entry.id === 'daily-woodcutting');
  assert.ok(mission);
  assert.deepEqual(missionProgress(game, mission, TODAY), { value: 10, target: 30 });
  const tomorrow = updateGame(game, { type: 'new-day', date: '2026-11-03' });
  assert.equal(missionProgress(tomorrow, mission, '2026-11-03').value, 0);
  assert.equal(tomorrow.stats['actions:woodcutting'], 10);
});

test('backpack upgrades are bought at a bank, two slots at a time', () => {
  const rich = { ...createGame(TODAY), coins: 2_500 };
  const once = updateGame(rich, { type: 'upgrade-bag' });
  assert.equal(once.coins, 2_000);
  assert.equal(capacityOf(once), 30);
  const twice = updateGame(once, { type: 'upgrade-bag' });
  assert.equal(twice.coins, 500);
  assert.equal(capacityOf(twice), 32);
  assert.equal(updateGame(twice, { type: 'upgrade-bag' }), twice);
  const away = { ...rich, location: 'pandan-woods' };
  assert.equal(updateGame(away, { type: 'upgrade-bag' }), away);
  assert.equal(nextBagUpgrade({ bagUpgrades: BAG_UPGRADES.length }), null);
});

test('the late game opens through quests: the grove, then the crater', () => {
  const fresh = createGame(TODAY);
  assert.equal(updateGame(fresh, { type: 'travel', to: 'moonlit-grove' }), fresh);
  const grove = updateGame(
    { ...fresh, quests: { 'moonlit-path': 'done' } },
    { type: 'travel', to: 'moonlit-grove' },
  );
  assert.equal(grove.travel?.to, 'moonlit-grove');
  const crater = { ...fresh, quests: { 'moonlit-path': 'done' as const } };
  assert.equal(updateGame(crater, { type: 'travel', to: 'starfall-crater' }), crater);
  // Every quest item can be made or found, and every quest reward exists.
  const made = new Set(
    ACTIVITIES.flatMap((activity) => [
      activity.output.item,
      ...(activity.finds ?? []).map((find) => find.item),
    ]),
  );
  for (const quest of QUESTS) {
    for (const stack of quest.deliver) assert.ok(made.has(stack.item), `${quest.id} needs ${stack.item}`);
    for (const stack of quest.rewards.items ?? []) assert.ok(getItem(stack.item), stack.item);
    for (const id of quest.requires.quests ?? []) assert.ok(getQuest(id), id);
  }
  for (const place of LOCATIONS)
    for (const id of place.activities) assert.ok(getActivity(id), `${place.id}: ${id}`);
});

test('the next step leads a new player through their first quest', () => {
  let game = createGame(TODAY);
  let step = nextStep(game);
  assert.equal(step?.kind, 'start-quest');
  assert.equal(step?.kind === 'start-quest' && step.quest.id, 'hungry-innkeeper');
  game = updateGame(game, { type: 'quest-start', quest: 'hungry-innkeeper' });
  // Five cooked minnows: there are three, cooking needs raw ones, so go fishing first.
  step = nextStep(game);
  assert.equal(step?.kind, 'travel');
  assert.equal(step?.kind === 'travel' && step.place.id, 'longan-lake');
  assert.equal(step?.kind === 'travel' && step.activity?.id, 'fish-minnow');
  // With raw fish in the bag back in town, cook them.
  game = { ...game, inventory: { ...game.inventory, 'raw-minnow': 6 } };
  step = nextStep(game);
  assert.equal(step?.kind === 'start' && step.activity.id, 'cook-minnow');
  // Enough cooked fish in the giver's town: hand it in.
  game = { ...game, inventory: { minnow: 5 } };
  assert.equal(nextStep(game)?.kind, 'hand-in');
});

test('without a quest, the next step is steady work rather than a one-off recipe', () => {
  const game = {
    ...createGame(TODAY),
    inventory: { linen: 2 },
    quests: Object.fromEntries(QUESTS.map((quest) => [quest.id, 'done' as const])),
  };
  const step = nextStep(game);
  // Two linen make one straw hat, so walk out to gather instead.
  assert.equal(step?.kind, 'travel');
  const hat = getActivity('make-straw-hat');
  assert.ok(hat);
  assert.equal(runsLeft(game, hat), 1);
});

test('streaks and goals still work', () => {
  let game = createGame(dayBefore(TODAY));
  game = updateGame(game, { type: 'add-steps', date: dayBefore(TODAY), steps: 8_000 });
  game = updateGame(game, { type: 'new-day', date: TODAY });
  assert.equal(streak(game, TODAY), 1);
  game = updateGame(game, { type: 'goal', date: TODAY, goal: 4_000 });
  assert.equal(getDay(game, TODAY).goal, 4_000);
});

test('saves round-trip and reject tampering', () => {
  let game = updateGame(createGame(TODAY), { type: 'travel', to: 'pandan-woods', next: 'chop-pandan' });
  game = walk(game, 5_000);
  game = {
    ...game,
    gear: { head: 'straw-hat@3', ring1: 'gold-ring' },
    buff: { item: 'trout', actions: 9 },
    seen: [...game.seen, 'straw-hat', 'gold-ring'],
  };
  const decoded = decodeGame(JSON.stringify(game), TODAY);
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.ok && decoded.game, game);
  assert.equal(decodeGame('nope').ok, false);
  assert.equal(decodeGame(JSON.stringify({ ...game, spent: 99_999 })).ok, false);
  assert.equal(decodeGame(JSON.stringify({ ...game, coins: -1 })).ok, false);
  assert.equal(decodeGame(JSON.stringify({ ...game, location: 'atlantis' })).ok, false);
  const odd = decodeGame(
    JSON.stringify({
      ...game,
      inventory: { 'moon-rock': 3, 'pandan-logs@2': 1 },
      gear: { head: 'gold-ring' },
    }),
    TODAY,
  );
  assert.ok(odd.ok);
  assert.deepEqual(odd.ok && [odd.game.inventory, odd.game.gear], [{}, {}]);
});

test('a failed load says why, and a save from a newer build is not called corrupt', () => {
  const game = createGame(TODAY);
  assert.deepEqual(decodeGame('nope'), { ok: false, failure: { kind: 'invalid-json' } });
  assert.deepEqual(decodeGame(JSON.stringify({ ...game, version: 4, days: 'changed' })), {
    ok: false,
    failure: { kind: 'newer-version', version: 4 },
  });
  assert.deepEqual(decodeGame(JSON.stringify({ ...game, coins: -1 })), {
    ok: false,
    failure: { kind: 'invalid', field: 'coins' },
  });
  assert.deepEqual(decodeGame(JSON.stringify({ ...game, version: 'three' })), {
    ok: false,
    failure: { kind: 'invalid', field: 'version' },
  });
  // Only a storage failure offers a retry; the copy stays in the lowercase game voice.
  assert.equal(loadFailureCopy({ kind: 'storage' }).retry, true);
  const newer = loadFailureCopy({ kind: 'newer-version', version: 4 });
  assert.deepEqual(newer, {
    message: 'this save is from a newer version of outside. update the app to keep playing.',
    retry: false,
  });
  for (const failure of [{ kind: 'invalid-json' }, { kind: 'invalid', field: 'coins' }] as const) {
    const copy = loadFailureCopy(failure);
    assert.equal(copy.retry, false);
    assert.equal(copy.message, copy.message.toLowerCase());
  }
});

test('older stop reasons and unknown counters still decode', () => {
  const game = { ...createGame(TODAY), stats: { chestsFound: 2, 'actions:mining': 5 } };
  const decode = (patch: Record<string, unknown>) => {
    const decoded = decodeGame(JSON.stringify({ ...game, ...patch }), TODAY);
    assert.ok(decoded.ok);
    return decoded.ok ? decoded.game : game;
  };
  const stop = (missing: string) => decode({ stopped: { activity: 'chop-pandan', missing } }).stopped;
  assert.deepEqual(stop('inventory'), { activity: 'chop-pandan', kind: 'bag-full' });
  assert.deepEqual(stop('woodcutting-level'), {
    activity: 'chop-pandan',
    kind: 'level',
    skill: 'woodcutting',
  });
  assert.deepEqual(stop('copper-ore'), { activity: 'chop-pandan', kind: 'missing', item: 'copper-ore' });
  assert.equal(stop('moon-rock'), null);
  // The new shape round-trips, and counters from a newer build are dropped.
  const typed = { activity: 'chop-pandan', kind: 'missing', item: 'copper-ore' } as const;
  assert.deepEqual(decode({ stopped: typed }).stopped, typed);
  assert.deepEqual(decode({ stats: { ...game.stats, dancesDone: 3 } }).stats, game.stats);
});

test('version 2 saves move into the bank; version 1 saves keep their history', () => {
  const v2 = {
    ...createGame(TODAY),
    version: 2,
    bank: { 'pandan-logs': 40, bottle: 1 },
    inventory: undefined,
    gear: undefined,
    buff: undefined,
    seen: undefined,
    stats: undefined,
  };
  const decoded = decodeGame(JSON.stringify(v2), TODAY);
  assert.ok(decoded.ok);
  if (!decoded.ok) return;
  assert.equal(decoded.migrated, true);
  assert.deepEqual(decoded.game.bank, { 'pandan-logs': 40, bottle: 1 });
  assert.deepEqual(decoded.game.inventory, {});
  assert.ok(decoded.game.seen.includes('bottle'));
  const v1 = {
    version: 1,
    goal: 6_000,
    equipped: 'pandan',
    days: [
      { date: dayBefore(TODAY), steps: 9_000, goal: 6_000, claimed: ['grass', 'scenic'] },
      { date: TODAY, steps: 2_500, goal: 6_000, claimed: ['grass'] },
    ],
  };
  const old = decodeGame(JSON.stringify(v1), TODAY);
  assert.ok(old.ok);
  assert.equal(old.ok && unspentSteps(old.game), 2_500);
  assert.equal(old.ok && totalLevel(old.game), 8);
});

test('the demo starts with today’s sample steps in the pouch', () => {
  const demo = createDemoGame(TODAY);
  assert.equal(unspentSteps(demo), 6_240);
  assert.equal(skillLevel(demo, 'woodcutting'), 1);
});

test('a huge backlog stops when the bag fills and stays consistent', () => {
  let game = at('pandan-woods');
  game = walk(updateGame(game, { type: 'start', activity: 'chop-pandan' }), 1_000_000);
  assert.equal(game.stopped?.kind, 'bag-full');
  assert.ok(unspentSteps(game) > 900_000);
  assert.equal(advance(game), game);
});

test('every item id is unique and every loot and recipe item exists', () => {
  const ids = ITEMS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of ITEMS)
    for (const entry of item.loot?.table ?? [])
      assert.ok(ids.includes(entry.item), `${item.id} drops ${entry.item}`);
  for (const quest of QUESTS) for (const stack of quest.deliver) assert.ok(ids.includes(stack.item));
});

test('every content reference points at something that exists', () => {
  const items = new Set(ITEMS.map((item) => item.id));
  const activities = new Set(ACTIVITIES.map((activity) => activity.id));
  const places = new Set(LOCATIONS.map((place) => place.id));
  const quests = new Set(QUESTS.map((quest) => quest.id));
  const item = (id: string, where: string) => assert.ok(items.has(id), `${where} names item ${id}`);
  assert.equal(activities.size, ACTIVITIES.length, 'activity ids are unique');
  assert.equal(places.size, LOCATIONS.length, 'place ids are unique');
  assert.equal(quests.size, QUESTS.length, 'quest ids are unique');
  for (const activity of ACTIVITIES) {
    item(activity.output.item, `${activity.id} output`);
    for (const input of activity.inputs ?? []) item(input.item, `${activity.id} input`);
    for (const find of activity.finds ?? []) item(find.item, `${activity.id} find`);
    if (activity.burn) item(activity.burn.item, `${activity.id} burn`);
  }
  for (const place of LOCATIONS) {
    for (const id of place.activities) assert.ok(activities.has(id), `${place.id} offers ${id}`);
    if (place.requires?.type === 'quest')
      assert.ok(quests.has(place.requires.quest), `${place.id} needs quest ${place.requires.quest}`);
  }
  for (const [from, to, cost] of ROADS) {
    assert.ok(places.has(from) && places.has(to), `road ${from} to ${to}`);
    assert.ok(Number.isSafeInteger(cost) && cost > 0, `road ${from} to ${to} costs ${cost}`);
  }
  for (const place of LOCATIONS) assert.ok(route(START_LOCATION, place.id), `${place.id} is reachable`);
  for (const quest of QUESTS) {
    assert.ok(places.has(quest.location), `${quest.id} is handed in at ${quest.location}`);
    for (const stack of quest.rewards.items ?? []) item(stack.item, `${quest.id} reward`);
    for (const id of quest.requires.quests ?? []) assert.ok(quests.has(id), `${quest.id} needs ${id}`);
  }
  for (const offer of STORE_STOCK) item(offer.item, 'store stock');
  for (const chest of Object.values(SKILL_CHEST)) if (chest) item(chest, 'skill chest');
  for (const period of MISSION_PERIODS)
    for (const mission of [FIXED_MISSIONS[period], ...MISSION_POOLS[period]])
      for (const stack of mission.items ?? []) item(stack.item, `${mission.id} reward`);
});
