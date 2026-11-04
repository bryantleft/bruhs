// Balance report: how long the game takes for a real walker, using the real rules.
// Run: node --experimental-strip-types scripts/balance.ts [steps-per-day]
import {
  ACTIVITIES,
  type Activity,
  BAG_UPGRADES,
  FIXED_MISSIONS,
  MISSION_PICKS,
  MISSION_POOLS,
  MISSION_PERIODS,
  getItem,
  METAL_STATS,
  METALS,
  QUESTS,
  SKILLS,
  type SkillId,
  STORE_STOCK,
  TOOL_SKILL,
  type ToolKind,
  toolId,
} from '../src/game/content.ts';
import {
  AGILITY_ROAD_STEPS,
  AGILITY_WORK_STEPS,
  agilityMultiplier,
  createGame,
  type Game,
  skillLevel,
  stepsPerAction,
  updateGame,
} from '../src/game/game.ts';
import { countOf, keyValue } from '../src/game/items.ts';
import { levelForXp, xpForLevel } from '../src/game/xp.ts';

const PER_DAY = Number(process.argv[2] ?? 7_000);
const days = (steps: number): string => (steps / PER_DAY).toFixed(steps < PER_DAY * 10 ? 1 : 0);

function toolKindFor(skill: SkillId): ToolKind | null {
  for (const [kind, owner] of Object.entries(TOOL_SKILL)) if (owner === skill) return kind as ToolKind;
  return null;
}

// The best tool a player at this level could wield.
function withTools(game: Game, level: number): Game {
  const tools = { ...game.tools };
  for (const kind of Object.keys(tools) as ToolKind[]) {
    const metal = [...METALS].reverse().find((m) => METAL_STATS[m].level <= level) ?? 'bronze';
    tools[kind] = toolId(metal, kind);
  }
  return { ...game, tools };
}

function at(level: number, skill: SkillId): Game {
  const base = createGame('2026-11-03');
  return withTools({ ...base, xp: { ...base.xp, [skill]: xpForLevel(level) } }, level);
}

// Best xp per step among activities this skill can do at this level (ignoring inputs).
function bestRate(skill: SkillId, level: number): { activity: Activity; perStep: number } | null {
  const game = at(level, skill);
  let best: { activity: Activity; perStep: number } | null = null;
  for (const activity of ACTIVITIES) {
    if (activity.skill !== skill || activity.level > level) continue;
    const perStep = activity.xp / stepsPerAction(game, activity);
    if (!best || perStep > best.perStep) best = { activity, perStep };
  }
  return best;
}

function stepsToLevel(skill: SkillId, target: number): number {
  let steps = 0;
  for (let level = 1; level < target; level += 1) {
    const rate = bestRate(skill, level);
    if (!rate) return Number.POSITIVE_INFINITY;
    steps += (xpForLevel(level + 1) - xpForLevel(level)) / rate.perStep;
  }
  return steps;
}

console.log(`\n# outside balance at ${PER_DAY.toLocaleString()} steps a day\n`);
console.log('## days to reach a level (best activity, best wieldable tool, no gear or buffs)\n');
const MARKS = [5, 10, 15, 20, 30, 40, 50, 70, 99];
console.log(`skill        ${MARKS.map((m) => String(m).padStart(6)).join('')}`);
for (const skill of SKILLS) {
  if (skill.id === 'agility') continue;
  const cells = MARKS.map((mark) => days(stepsToLevel(skill.id, mark)).padStart(6));
  console.log(`${skill.id.padEnd(13)}${cells.join('')}`);
}
// Agility trains passively on road and work steps (see agilityXp in game.ts).
function stepsToAgility(target: number, share: number): number {
  let steps = 0;
  for (let level = 1; level < target; level += 1) {
    const perStep =
      (share / AGILITY_ROAD_STEPS + (1 - share) / AGILITY_WORK_STEPS) * agilityMultiplier(level);
    steps += (xpForLevel(level + 1) - xpForLevel(level)) / perStep;
  }
  return steps;
}
for (const share of [0, 0.2, 0.5]) {
  const cells = MARKS.map((mark) => days(stepsToAgility(mark, share)).padStart(6));
  console.log(`${`agility ${share * 100}%`.padEnd(13)}${cells.join('')}   (share of steps on roads)`);
}
// Missions: the fixed walk plus the average of two pool draws, spread over the period.
const PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 30 } as const;
let missionCoins = 0;
for (const period of MISSION_PERIODS) {
  const pool = MISSION_POOLS[period];
  const average = pool.reduce((sum, mission) => sum + mission.coins, 0) / pool.length;
  missionCoins += (FIXED_MISSIONS[period].coins + average * MISSION_PICKS) / PERIOD_DAYS[period];
}
console.log(`\nmissions pay about ${Math.round(missionCoins)} coins a day, plus chests.`);
console.log(
  `backpack upgrades cost ${BAG_UPGRADES.reduce((a, b) => a + b, 0).toLocaleString()} coins in all (${BAG_UPGRADES.join(', ')}).`,
);

console.log('\n## gathering at the requirement level: steps per action, xp/step, coins/step\n');
for (const activity of ACTIVITIES) {
  if (activity.inputs || !activity.tool) continue;
  const game = at(activity.level, activity.skill);
  const steps = stepsPerAction(game, activity);
  const value = keyValue(activity.output.item);
  console.log(
    `${activity.id.padEnd(20)} lvl ${String(activity.level).padStart(2)}  ${String(steps).padStart(4)} steps  ${(
      activity.xp / steps
    ).toFixed(2)} xp/step  ${((value / steps) * 1000).toFixed(0).padStart(4)} coins/1k steps  ${Math.floor(
      PER_DAY / steps,
    )} a day`,
  );
}

console.log('\n## store prices against a day of gathering at that tier\n');
for (const { item, price } of STORE_STOCK) {
  const tool = getItem(item)?.tool;
  if (!tool) continue;
  const activity = ACTIVITIES.find(
    (a) => a.tool === tool.kind && !a.inputs && a.level <= METAL_STATS[tool.metal].level,
  );
  if (!activity) continue;
  const game = at(METAL_STATS[tool.metal].level, activity.skill);
  const perDay = (PER_DAY / stepsPerAction(game, activity)) * keyValue(activity.output.item);
  console.log(`${item.padEnd(16)} ${String(price).padStart(5)} coins = ${(price / perDay).toFixed(1)} days of ${activity.id}`);
}

// --- quests: when they open and whether the reward is worth the trip ---------------------

function levelAt(quest: (typeof QUESTS)[number], skill: SkillId, fallback: number): number {
  return quest.requires.skills?.find((entry) => entry.skill === skill)?.level ?? fallback;
}

// Steps to make `qty` of an item from scratch at the quest's levels (gathering, then recipes).
function makeSteps(item: string, qty: number, quest: (typeof QUESTS)[number]): number {
  const options = ACTIVITIES.filter((activity) => activity.output.item === item);
  const activity = options.find((entry) => !entry.inputs) ?? options[0];
  if (!activity) {
    // Rare finds (gems, golden seeds): the cheapest activity that can turn one up.
    let best = Number.POSITIVE_INFINITY;
    for (const source of ACTIVITIES)
      for (const find of source.finds ?? [])
        if (find.item === item) {
          const level = Math.max(source.level, levelAt(quest, source.skill, source.level));
          best = Math.min(best, stepsPerAction(at(level, source.skill), source) / find.chance);
        }
    return best * qty;
  }
  const level = Math.max(activity.level, levelAt(quest, activity.skill, activity.level));
  const game = at(level, activity.skill);
  const burn = activity.burn ? Math.max(0, activity.burn.chance - (level - activity.level) * 0.02) : 0;
  const per = stepsPerAction(game, activity) / (1 - burn);
  const inputs = (activity.inputs ?? []).reduce(
    (sum, input) => sum + makeSteps(input.item, input.qty, quest) / (1 - burn),
    0,
  );
  return (per + inputs) * qty;
}

// What a reward is worth in steps: xp at the quest's training rate, coins and items at the
// best gathering coin rate for that stage.
function rewardSteps(quest: (typeof QUESTS)[number]): number {
  const stage = Math.max(1, ...(quest.requires.skills ?? []).map((entry) => entry.level));
  let coinRate = 0;
  for (const activity of ACTIVITIES) {
    if (activity.inputs || !activity.tool || activity.level > stage) continue;
    const game = at(stage, activity.skill);
    coinRate = Math.max(coinRate, keyValue(activity.output.item) / stepsPerAction(game, activity));
  }
  let steps = 0;
  for (const { skill, amount } of quest.rewards.xp ?? []) {
    const rate = bestRate(skill, levelAt(quest, skill, stage));
    if (rate) steps += amount / rate.perStep;
  }
  const items = (quest.rewards.items ?? []).reduce((sum, stack) => sum + keyValue(stack.item) * stack.qty, 0);
  return steps + ((quest.rewards.coins ?? 0) + items) / coinRate;
}

console.log('\n## quests: day they open (focused training), effort and reward in steps\n');
console.log('quest              opens   effort   reward   ratio');
const opened = new Map<string, number>();
for (const quest of QUESTS) {
  const skills = quest.requires.skills ?? [];
  // Active skills train one at a time; agility trains alongside them (20% road share).
  const active = skills
    .filter((entry) => entry.skill !== 'agility')
    .reduce((sum, { skill, level }) => sum + stepsToLevel(skill, level), 0);
  const agility = skills.find((entry) => entry.skill === 'agility');
  const own = Math.max(active, agility ? stepsToAgility(agility.level, 0.2) : 0) / PER_DAY;
  const after = Math.max(own, ...(quest.requires.quests ?? []).map((id) => opened.get(id) ?? 0));
  opened.set(quest.id, after);
  const effort = quest.deliver.reduce((sum, stack) => sum + makeSteps(stack.item, stack.qty, quest), 0);
  const reward = rewardSteps(quest);
  console.log(
    `${quest.id.padEnd(18)} ${after.toFixed(0).padStart(5)}  ${Math.round(effort).toLocaleString().padStart(7)}  ${Math.round(reward).toLocaleString().padStart(7)}   ${(reward / effort).toFixed(1).padStart(4)}×`,
  );
}

// Real engine runs: one gathering spot, walking PER_DAY a day, banking in bruhbridge when full.
console.log('\n## 14 days at one spot with the real engine (chests and rare finds)\n');
const SPOTS: readonly [string, string][] = [
  ['pandan-woods', 'chop-pandan'],
  ['pebble-hills', 'mine-copper'],
  ['longan-lake', 'fish-minnow'],
  ['pandan-woods', 'pick-rambutan'],
];
for (const [place, id] of SPOTS) {
  let game: Game = { ...createGame('2026-11-03', 7), location: place, inventory: {} };
  game = updateGame(game, { type: 'start', activity: id });
  let trips = 0;
  for (let day = 0; day < 14; day += 1) {
    game = updateGame(game, { type: 'add-steps', date: '2026-11-03', steps: PER_DAY });
    // A full bag sends the walker to the nearest bank and back, paid from the same pouch.
    for (let guard = 0; guard < 4 && (game.stopped || game.travel === null) && !game.task; guard += 1) {
      if (game.location === place) {
        game = updateGame(game, { type: 'travel', to: 'bruhbridge' });
        trips += 1;
      } else if (game.location === 'bruhbridge') {
        game = updateGame(game, { type: 'deposit-all' });
        game = updateGame(game, { type: 'travel', to: place, next: id });
      }
    }
  }
  const activity = ACTIVITIES.find((a) => a.id === id);
  const level = activity ? skillLevel(game, activity.skill) : 0;
  const hoard = { ...game.bank };
  for (const [key, qty] of Object.entries(game.inventory)) hoard[key] = (hoard[key] ?? 0) + qty;
  const chests = ['bird-nest', 'miner-crate', 'bottle', 'adventurer-chest']
    .map((chest) => `${chest} ${countOf(hoard, chest)}`)
    .join(', ');
  const rare = ['sapphire', 'emerald', 'ruby', 'diamond', 'golden-seed']
    .map((gem) => countOf(hoard, gem))
    .reduce((a, b) => a + b, 0);
  console.log(
    `${id.padEnd(16)} level ${level} (${activity ? game.xp[activity.skill] : 0} xp), ${game.actions} actions, ${chests}, ${rare} rare finds, ${trips} bank trips, agility ${skillLevel(game, 'agility')}${game.stopped ? `, stopped: ${game.stopped.missing}` : ''}`,
  );
}
console.log(`\nlevel check: 13,034,431 xp is level ${levelForXp(13_034_431)}`);
