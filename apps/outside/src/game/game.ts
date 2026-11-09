import {
  ACTIVITIES,
  type Activity,
  ADVENTURER_CHANCE,
  BAG_UPGRADE_SLOTS,
  BAG_UPGRADES,
  CHEST_CHANCE,
  GEAR_SLOTS,
  type GearSlot,
  getActivity,
  getItem,
  getLocation,
  getQuest,
  type Item,
  LOCATIONS,
  METAL_STATS,
  type MissionPeriod,
  type Place,
  QUESTS,
  type QualityIndex,
  type Quest,
  ROADS,
  SKILL_CHEST,
  SKILL_IDS,
  SKINS,
  type SkillId,
  type Skin,
  type SkinId,
  START_LOCATION,
  STORE_STOCK,
  slotFits,
  TOOL_SKILL,
  type ToolKind,
  toolId,
} from './content.ts';
import { Dice } from './dice.ts';
import {
  add,
  BASE_SLOTS,
  type Bag,
  countOf,
  fits,
  isKnownKey,
  itemCount,
  itemKey,
  keyItem,
  keyValue,
  type Loadout,
  parseKey,
  slotsUsed,
  type Totals,
  takeId,
  totalsFor,
} from './items.ts';
import { missionClaimed, missionProgress, missionsFor, rollMissions } from './missions.ts';
import { isDateKey, isHealthConnection, type SAVE_VERSION } from './save.ts';
import { levelForXp } from './xp.ts';

export { SKINS, type Skin, type SkinId } from './content.ts';
// The game is split by concern; these re-exports keep `game.ts` the one import for callers.
export {
  type ItemSource,
  itemSource,
  itemSourceText,
  type NextStep,
  nearestBank,
  nextStep,
  orList,
  ownedCount,
  questsNeeding,
  runsLeft,
  sourceOf,
  townsWith,
  unlocksBetween,
} from './guidance.ts';
export {
  getMission,
  missionClaimed,
  missionProgress,
  missionsFor,
  periodDaysLeft,
  periodKey,
  periodRange,
  readyMissions,
  rollMissions,
} from './missions.ts';
export { decodeGame, type LoadFailure, migrateV1, SAVE_VERSION } from './save.ts';

export const GOALS = [4_000, 6_000, 8_000, 10_000] as const;
export type Goal = (typeof GOALS)[number];

export type Day = Readonly<{
  date: string;
  steps: number;
  goal: Goal;
}>;

export type HealthSource = 'apple-health' | 'health-connect';
export type HealthConnection = Readonly<{
  source: HealthSource;
  enabled: boolean;
  syncedAt: string;
  startedOn: string;
}>;
export type HealthDay = Readonly<{ date: string; steps: number }>;

export type Travel = Readonly<{
  from: string;
  to: string;
  cost: number;
  progress: number;
  next: string | null;
  // The started quest the queued activity works for; it stops once the quest has enough.
  quest?: string;
}>;
// `quest` is set when the next-step button started the work for a quest: the bruh stops once
// that quest has enough, so the rest of the pouch waits for the next step.
export type Task = Readonly<{ id: string; progress: number; quest?: string }>;
// Why the current task stopped: the bag filled, an input ran out, the quest it worked for has
// enough, or the skill level is too low (only reachable from an edited save).
export type StopReason = Readonly<
  { activity: string } & (
    | { kind: 'bag-full' }
    | { kind: 'missing'; item: string }
    | { kind: 'enough'; quest: string }
    | { kind: 'level'; skill: SkillId }
  )
>;
// Lifetime counters on the character sheet; mission counters read the chest and action ones.
export const STAT_KEYS = [
  'chestsFound',
  'chestsOpened',
  'crafted',
  'finds',
  'doubleActions',
  'doubleResults',
  'preserved',
  'eaten',
  'burnt',
  'missions',
  ...SKILL_IDS.map((skill) => `actions:${skill}` as const),
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Buff = Readonly<{ item: string; actions: number }>;
// One period's missions: which were drawn, the counters when the period began, and claims.
export type MissionState = Readonly<{
  key: string;
  picks: readonly string[];
  base: Readonly<Record<string, number>>;
  claimed: readonly string[];
}>;

export type Game = Readonly<{
  version: typeof SAVE_VERSION;
  days: readonly Day[];
  goal: Goal;
  equipped: SkinId;
  health?: HealthConnection;
  // Lifetime steps already paid for travel, work or skipped history. Unspent = total − spent.
  spent: number;
  walked: number;
  worked: number;
  seed: number;
  location: string;
  task: Task | null;
  travel: Travel | null;
  stopped: StopReason | null;
  xp: Readonly<Record<SkillId, number>>;
  // The inventory travels with you; the bank only opens in towns.
  inventory: Bag;
  bank: Bag;
  tools: Readonly<Record<ToolKind, string>>;
  gear: Readonly<Partial<Record<GearSlot, string>>>;
  buff: Buff | null;
  coins: number;
  quests: Readonly<Record<string, 'started' | 'done'>>;
  actions: number;
  // Collection log: every item id ever obtained.
  seen: readonly string[];
  // Lifetime counters (chests opened, items crafted, doubles, actions per skill, ...).
  stats: Readonly<Partial<Record<StatKey, number>>>;
  // Backpack upgrades bought at a bank, two slots each.
  bagUpgrades: number;
  missions: Readonly<Partial<Record<MissionPeriod, MissionState>>>;
  // Set on a new save until the welcome screens are done. Saves from before onboarding never had it.
  onboarding?: true;
}>;

export type GameAction =
  | Readonly<{ type: 'new-day'; date: string }>
  | Readonly<{ type: 'add-steps'; date: string; steps: number }>
  | Readonly<{ type: 'sync-steps'; date: string; steps: number }>
  | Readonly<{ type: 'mission-claim'; date: string; period: MissionPeriod; mission: string }>
  | Readonly<{ type: 'upgrade-bag' }>
  | Readonly<{ type: 'goal'; date: string; goal: Goal }>
  | Readonly<{ type: 'equip'; skin: SkinId }>
  | Readonly<{ type: 'start'; activity: string; quest?: string }>
  | Readonly<{ type: 'stop' }>
  | Readonly<{ type: 'travel'; to: string; next?: string; quest?: string }>
  | Readonly<{ type: 'cancel-travel' }>
  | Readonly<{ type: 'wear'; item: string; slot?: GearSlot }>
  | Readonly<{ type: 'unwear'; slot: GearSlot }>
  | Readonly<{ type: 'eat'; item: string }>
  | Readonly<{ type: 'open'; item: string; count: number }>
  | Readonly<{ type: 'deposit'; item: string; qty: number }>
  | Readonly<{ type: 'deposit-all' }>
  | Readonly<{ type: 'withdraw'; item: string; qty: number }>
  | Readonly<{ type: 'drop'; item: string; qty: number }>
  | Readonly<{ type: 'sell'; item: string; qty: number }>
  | Readonly<{ type: 'buy'; item: string }>
  | Readonly<{ type: 'quest-start'; quest: string }>
  | Readonly<{ type: 'quest-complete'; quest: string }>
  | Readonly<{ type: 'health-pause' }>
  | Readonly<{ type: 'onboarded' }>
  | Readonly<{
      type: 'health-sync';
      date: string;
      source: HealthSource;
      at: string;
      days: readonly HealthDay[];
    }>;

export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dayBefore(key: string): string {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

export function getDay(game: Pick<Game, 'days' | 'goal'>, date: string): Day {
  return game.days.find((day) => day.date === date) ?? { date, steps: 0, goal: game.goal };
}

export const STARTER_TOOLS: Readonly<Record<ToolKind, string>> = {
  axe: toolId('bronze', 'axe'),
  pickaxe: toolId('bronze', 'pickaxe'),
  harpoon: toolId('bronze', 'harpoon'),
  shears: toolId('bronze', 'shears'),
};
// A small starter kit so the bag, food buffs and crafting are discoverable from minute one.
const STARTER_INVENTORY: Bag = { minnow: 3, linen: 2, 'bird-nest': 1 };

export function emptyXp(): Record<SkillId, number> {
  return Object.fromEntries(SKILL_IDS.map((skill) => [skill, 0])) as Record<SkillId, number>;
}

export function createGame(date: string, seed = 0x5eed): Game {
  // Missions open with the save, so work done before the first sync still counts.
  return rollMissions(newGame(date, seed), date);
}

function newGame(date: string, seed: number): Game {
  return {
    version: 3,
    goal: 8_000,
    equipped: 'original',
    days: [{ date, steps: 0, goal: 8_000 }],
    spent: 0,
    walked: 0,
    worked: 0,
    seed: seed >>> 0,
    location: START_LOCATION,
    task: null,
    travel: null,
    stopped: null,
    xp: emptyXp(),
    inventory: STARTER_INVENTORY,
    bank: {},
    tools: STARTER_TOOLS,
    gear: {},
    buff: null,
    coins: 25,
    quests: {},
    actions: 0,
    seen: [...Object.keys(STARTER_INVENTORY), ...Object.values(STARTER_TOOLS)],
    stats: {},
    bagUpgrades: 0,
    missions: {},
    onboarding: true,
  };
}

export function createDemoGame(date: string): Game {
  const steps = [8_400, 10_150, 7_200, 8_800, 9_300, 8_200, 6_240];
  const keys = [date];
  for (let index = 1; index < steps.length; index += 1) keys.unshift(dayBefore(keys[0] ?? date));
  const days = keys.map((key, index) => ({
    date: key,
    steps: steps[index] ?? 0,
    goal: 8_000 as Goal,
  }));
  const game = { ...createGame(date), days };
  // Earlier sample days are history; today's sample steps fill the starting pouch.
  return { ...game, spent: totalSteps(game) - (steps.at(-1) ?? 0) };
}

// --- reading the game -----------------------------------------------------------------

export function totalSteps(game: Pick<Game, 'days'>): number {
  return game.days.reduce((sum, day) => sum + day.steps, 0);
}

export function unspentSteps(game: Game): number {
  return Math.max(0, totalSteps(game) - game.spent);
}

export function skillLevel(game: Pick<Game, 'xp'>, skill: SkillId): number {
  return levelForXp(game.xp[skill] ?? 0);
}

export function totalLevel(game: Pick<Game, 'xp'>): number {
  return SKILL_IDS.reduce((sum, skill) => sum + skillLevel(game, skill), 0);
}

export function totalXp(game: Pick<Game, 'xp'>): number {
  return SKILL_IDS.reduce((sum, skill) => sum + (game.xp[skill] ?? 0), 0);
}

export function questPoints(game: Pick<Game, 'quests'>): number {
  return QUESTS.reduce((sum, quest) => sum + (game.quests[quest.id] === 'done' ? quest.points : 0), 0);
}

export function getSkin(id: SkinId): Skin {
  return SKINS.find((skin) => skin.id === id) ?? SKINS[0];
}

export function unlockedSkins(game: Pick<Game, 'xp'>): readonly Skin[] {
  const total = totalLevel(game);
  return SKINS.filter((skin) => skin.total <= total);
}

export function streak(game: Game, date: string): number {
  let key = getDay(game, date).steps >= getDay(game, date).goal ? date : dayBefore(date);
  let count = 0;
  const days = new Map(game.days.map((day) => [day.date, day]));
  while (true) {
    const day = days.get(key);
    if (!day || day.steps < day.goal) return count;
    count += 1;
    key = dayBefore(key);
  }
}

export function atBank(game: Pick<Game, 'location' | 'travel'>): boolean {
  return !game.travel && !!getLocation(game.location)?.bank;
}

export function atStore(game: Pick<Game, 'location' | 'travel'>): boolean {
  return !game.travel && !!getLocation(game.location)?.store;
}

export function capacityOf(game: Loadout & { readonly bagUpgrades?: number }): number {
  return BASE_SLOTS + totalsFor(game, null).slots + (game.bagUpgrades ?? 0) * BAG_UPGRADE_SLOTS;
}

// The next backpack upgrade's price, or null once every upgrade is bought.
export function nextBagUpgrade(game: Pick<Game, 'bagUpgrades'>): number | null {
  return BAG_UPGRADES[game.bagUpgrades] ?? null;
}

// What you can use right now: the inventory, plus the bank when standing in a bank town.
export function available(
  game: Pick<Game, 'inventory' | 'bank' | 'location' | 'travel'>,
  id: string,
): number {
  return countOf(game.inventory, id) + (atBank(game) ? countOf(game.bank, id) : 0);
}

// --- action math ---------------------------------------------------------------------------

// Each level above an activity's requirement adds 1.25% work efficiency, up to 25%.
export function levelEfficiency(game: Pick<Game, 'xp'>, activity: Activity): number {
  return Math.min(0.25, Math.max(0, skillLevel(game, activity.skill) - activity.level) * 0.0125);
}

export function stepsPerAction(game: Pick<Game, 'xp'> & Loadout, activity: Activity): number {
  const efficiency = totalsFor(game, activity.skill).efficiency + levelEfficiency(game, activity);
  // Efficiency adds work per step; no action drops below half its base steps.
  return Math.max(Math.ceil(activity.steps * 0.5), Math.ceil(activity.steps / (1 + efficiency)));
}

export function burnChance(game: Pick<Game, 'xp'>, activity: Activity): number {
  if (!activity.burn) return 0;
  const above = skillLevel(game, activity.skill) - activity.level;
  return Math.max(0, activity.burn.chance - above * 0.02);
}

// How many more of `item` a started quest needs: the delivery itself, or what recipes turn into
// it, up to two steps back (ore to bar to gear, raw fish to cooked). Bank and bag both count.
// Inputs to a recipe that burns carry a 25% margin over the expected burns, so one trip to the
// water is nearly always enough.
export function questShortfall(
  game: Pick<Game, 'quests' | 'inventory' | 'bank' | 'xp'>,
  questId: string,
  item: string,
): number {
  const quest = getQuest(questId);
  if (!quest || game.quests[quest.id] !== 'started') return 0;
  const owned = (id: string): number => countOf(game.inventory, id) + countOf(game.bank, id);
  const need = (target: string, short: number, depth: number): number => {
    if (short <= 0) return 0;
    if (target === item) return short;
    if (depth >= 2) return 0;
    const recipe = ACTIVITIES.filter((entry) => entry.output.item === target && entry.inputs?.length).sort(
      (a, b) => a.level - b.level,
    )[0];
    if (!recipe?.inputs) return 0;
    const runs = Math.ceil(short / recipe.output.qty);
    const margin = recipe.burn ? 1.25 / (1 - burnChance(game, recipe)) : 1;
    return Math.max(
      0,
      ...recipe.inputs.map((input) =>
        need(input.item, Math.ceil(runs * input.qty * margin) - owned(input.item), depth + 1),
      ),
    );
  };
  return Math.max(0, ...quest.deliver.map((stack) => need(stack.item, stack.qty - owned(stack.item), 0)));
}

// Chance of each quality tier for a crafted item, normal first.
export function qualityOdds(game: Pick<Game, 'xp'> & Loadout, activity: Activity): readonly number[] {
  if (!activity.quality) return [1, 0, 0, 0, 0];
  const shift =
    Math.min(0.4, Math.max(0, skillLevel(game, activity.skill) - activity.level) * 0.01) +
    totalsFor(game, activity.skill).quality;
  const perfect = Math.min(0.2, 0.01 + shift * 0.05);
  const excellent = Math.min(0.25, 0.04 + shift * 0.15);
  const great = Math.min(0.3, 0.12 + shift * 0.3);
  const good = Math.min(0.4, 0.3 + shift * 0.3);
  return [Math.max(0, 1 - perfect - excellent - great - good), good, great, excellent, perfect];
}

export type Preview = Readonly<{
  steps: number;
  totals: Totals;
  levelEfficiency: number;
  xp: number;
  burn: number;
  finds: readonly Readonly<{ item: string; chance: number }>[];
  quality: readonly number[];
}>;

// Everything the activity sheet shows: steps, chances and the drop table.
export function actionPreview(game: Game, activity: Activity): Preview {
  const totals = totalsFor(game, activity.skill);
  const findScale = 1 + totals.find;
  const chestScale = 1 + totals.chest;
  const chest = SKILL_CHEST[activity.skill];
  return {
    steps: stepsPerAction(game, activity),
    totals,
    levelEfficiency: levelEfficiency(game, activity),
    xp: Math.round(activity.xp * (1 + totals.xp)),
    burn: burnChance(game, activity),
    finds: [
      ...(activity.finds ?? []).map((find) => ({ item: find.item, chance: find.chance * findScale })),
      ...(chest ? [{ item: chest, chance: CHEST_CHANCE * chestScale }] : []),
      { item: 'adventurer-chest', chance: ADVENTURER_CHANCE * chestScale },
    ],
    quality: qualityOdds(game, activity),
  };
}

// What stands between the player and a place, activity, quest or tool. Typed, so rules can
// refuse with a reason and screens can explain it in the same words.
export type Requirement =
  | Readonly<{ kind: 'level'; skill: SkillId; level: number }>
  | Readonly<{ kind: 'quest'; quest: string }>
  | Readonly<{ kind: 'item'; item: string; qty: number }>;

export function requirementText(requirement: Requirement): string {
  switch (requirement.kind) {
    case 'level':
      return `needs ${requirement.skill} ${requirement.level}`;
    case 'quest':
      return `needs quest: ${getQuest(requirement.quest)?.name ?? requirement.quest}`;
    case 'item':
      return `needs ${itemCount(requirement.qty, requirement.item)}`;
  }
}

export function locationRequirement(game: Pick<Game, 'xp' | 'quests'>, place: Place): Requirement | null {
  const requirement = place.requires;
  if (!requirement) return null;
  if (requirement.type === 'skill')
    return skillLevel(game, requirement.skill) >= requirement.level
      ? null
      : { kind: 'level', skill: requirement.skill, level: requirement.level };
  return game.quests[requirement.quest] === 'done' ? null : { kind: 'quest', quest: requirement.quest };
}

export function locationBlocker(game: Pick<Game, 'xp' | 'quests'>, place: Place): string | null {
  const requirement = locationRequirement(game, place);
  return requirement ? requirementText(requirement) : null;
}

export function activityRequirement(game: Game, activity: Activity): Requirement | null {
  if (skillLevel(game, activity.skill) < activity.level)
    return { kind: 'level', skill: activity.skill, level: activity.level };
  const missing = activity.inputs?.find((input) => available(game, input.item) < input.qty);
  return missing ? { kind: 'item', item: missing.item, qty: missing.qty } : null;
}

export function activityBlocker(game: Game, activity: Activity): string | null {
  const requirement = activityRequirement(game, activity);
  return requirement ? requirementText(requirement) : null;
}

export function travelCost(game: Pick<Game, 'xp'> & Loadout, base: number): number {
  const agility = Math.min(0.4, (skillLevel(game, 'agility') - 1) * 0.004);
  return Math.max(1, Math.ceil(base / (1 + agility + totalsFor(game, null).travel)));
}

// Shortest road distance between two places, before travel bonuses.
export function route(
  from: string,
  to: string,
): Readonly<{ distance: number; path: readonly string[] }> | null {
  if (!getLocation(from) || !getLocation(to)) return null;
  const distance = new Map<string, number>(LOCATIONS.map((place) => [place.id, Number.POSITIVE_INFINITY]));
  const previous = new Map<string, string>();
  const open = new Set(LOCATIONS.map((place) => place.id));
  distance.set(from, 0);
  while (open.size) {
    let current: string | null = null;
    for (const id of open)
      if (current === null || (distance.get(id) ?? 0) < (distance.get(current) ?? 0)) current = id;
    if (current === null || distance.get(current) === Number.POSITIVE_INFINITY) break;
    open.delete(current);
    if (current === to) break;
    for (const [a, b, cost] of ROADS) {
      const next = a === current ? b : b === current ? a : null;
      if (!next || !open.has(next)) continue;
      const candidate = (distance.get(current) ?? 0) + cost;
      if (candidate < (distance.get(next) ?? Number.POSITIVE_INFINITY)) {
        distance.set(next, candidate);
        previous.set(next, current);
      }
    }
  }
  const total = distance.get(to) ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(total)) return null;
  const path = [to];
  while (path[0] !== from) {
    const step = previous.get(path[0] ?? '');
    if (!step) break;
    path.unshift(step);
  }
  return { distance: total, path };
}

export function questState(game: Pick<Game, 'quests'>, id: string): 'new' | 'started' | 'done' {
  return game.quests[id] ?? 'new';
}

export function questRequirement(game: Pick<Game, 'xp' | 'quests'>, quest: Quest): Requirement | null {
  for (const required of quest.requires.quests ?? [])
    if (game.quests[required] !== 'done') return { kind: 'quest', quest: required };
  for (const { skill, level } of quest.requires.skills ?? [])
    if (skillLevel(game, skill) < level) return { kind: 'level', skill, level };
  return null;
}

export function questBlocker(game: Pick<Game, 'xp' | 'quests'>, quest: Quest): string | null {
  const requirement = questRequirement(game, quest);
  if (requirement?.kind === 'quest')
    return `complete ${getQuest(requirement.quest)?.name ?? requirement.quest}`;
  return requirement ? requirementText(requirement) : null;
}

export function canHandIn(game: Game, quest: Quest): boolean {
  return quest.deliver.every((stack) => available(game, stack.item) >= stack.qty);
}

// --- mutable working copy for rules and the step engine ----------------------------------

type Draft = Omit<{ -readonly [K in keyof Game]: Game[K] }, 'seen'> & { seen: string[] };

function draft(game: Game): Draft {
  return { ...game, xp: { ...game.xp }, seen: [...game.seen] };
}

function freeze(work: Draft): Game {
  return { ...work, seen: [...new Set(work.seen)] };
}

function count(work: Draft, stat: StatKey, amount = 1): void {
  work.stats = { ...work.stats, [stat]: (work.stats[stat] ?? 0) + amount };
}

function gain(work: Draft, key: string, qty: number): void {
  if (qty <= 0) return;
  work.inventory = add(work.inventory, key, qty);
  const id = parseKey(key).id;
  if (!work.seen.includes(id)) work.seen.push(id);
}

// Takes from the inventory first, then the bank when standing at one. False if short.
function spend(work: Draft, id: string, qty: number): boolean {
  const fromBag = Math.min(qty, countOf(work.inventory, id));
  const rest = qty - fromBag;
  if (rest > 0 && (!atBank(work) || countOf(work.bank, id) < rest)) return false;
  if (fromBag > 0) work.inventory = takeId(work.inventory, id, fromBag) ?? work.inventory;
  if (rest > 0) work.bank = takeId(work.bank, id, rest) ?? work.bank;
  return true;
}

function placeOffers(location: string, activity: string): boolean {
  return getLocation(location)?.activities.includes(activity) ?? false;
}

function rollQuality(dice: Dice, odds: readonly number[]): QualityIndex {
  let value = dice.next();
  for (let tier = 4; tier >= 1; tier -= 1) {
    const chance = odds[tier] ?? 0;
    if (value < chance) return tier as QualityIndex;
    value -= chance;
  }
  return 0;
}

function rollLoot(work: Draft, dice: Dice, item: Item): void {
  const loot = item.loot;
  if (!loot) return;
  work.coins += dice.between(loot.coins[0], loot.coins[1]);
  const rolls = 1 + (dice.chance(0.25) ? 1 : 0);
  const weight = loot.table.reduce((sum, entry) => sum + entry.weight, 0);
  for (let index = 0; index < rolls; index += 1) {
    let pick = dice.next() * weight;
    for (const entry of loot.table) {
      pick -= entry.weight;
      if (pick < 0) {
        gain(work, entry.item, dice.between(entry.min, entry.max));
        break;
      }
    }
  }
}

// --- the step engine ---------------------------------------------------------------------

const MAX_ACTIONS_PER_ADVANCE = 200_000;

// One completed action: inputs, xp, loot, doubles, finds and chests.
function completeAction(work: Draft, dice: Dice, activity: Activity): void {
  const totals = totalsFor(work, activity.skill);
  work.actions += 1;
  count(work, `actions:${activity.skill}`);
  const times = dice.chance(totals.doubleAction) ? 2 : 1;
  if (times === 2) count(work, 'doubleActions');
  if (activity.inputs?.length) {
    if (dice.chance(totals.preserve)) count(work, 'preserved');
    else for (const input of activity.inputs) spend(work, input.item, input.qty);
  }
  const odds = qualityOdds(work, activity);
  for (let time = 0; time < times; time += 1) {
    if (activity.burn && dice.chance(burnChance(work, activity))) {
      gain(work, activity.burn.item, 1);
      count(work, 'burnt');
    } else {
      work.xp = {
        ...work.xp,
        [activity.skill]: work.xp[activity.skill] + Math.round(activity.xp * (1 + totals.xp)),
      };
      const results = dice.chance(totals.doubleResult) ? 2 : 1;
      if (results === 2) count(work, 'doubleResults');
      for (let result = 0; result < results; result += 1) {
        const quality = activity.quality ? rollQuality(dice, odds) : 0;
        gain(work, itemKey(activity.output.item, quality), activity.output.qty);
        if (activity.quality) count(work, 'crafted');
      }
    }
    for (const find of activity.finds ?? [])
      if (dice.chance(find.chance * (1 + totals.find))) {
        gain(work, find.item, 1);
        count(work, 'finds');
      }
    const chest = SKILL_CHEST[activity.skill];
    if (chest && dice.chance(CHEST_CHANCE * (1 + totals.chest))) {
      gain(work, chest, 1);
      count(work, 'chestsFound');
    }
    if (dice.chance(ADVENTURER_CHANCE * (1 + totals.chest))) {
      gain(work, 'adventurer-chest', 1);
      count(work, 'chestsFound');
    }
  }
  if (work.buff) work.buff = work.buff.actions > 1 ? { ...work.buff, actions: work.buff.actions - 1 } : null;
}

// Agility trains on every step: 1 point per 4 road steps and per 12 working steps, counted on
// lifetime totals so small syncs lose nothing. Each agility level adds 8% to the points, so the
// passive skill keeps pace with the gathering tiers instead of stalling for years.
export const AGILITY_ROAD_STEPS = 4;
export const AGILITY_WORK_STEPS = 12;
export function agilityMultiplier(level: number): number {
  return 1 + (level - 1) * 0.08;
}
function agilityXp(
  before: Pick<Game, 'walked' | 'worked' | 'xp'>,
  after: Pick<Game, 'walked' | 'worked'>,
): number {
  const points =
    Math.floor(after.walked / AGILITY_ROAD_STEPS) -
    Math.floor(before.walked / AGILITY_ROAD_STEPS) +
    Math.floor(after.worked / AGILITY_WORK_STEPS) -
    Math.floor(before.worked / AGILITY_WORK_STEPS);
  return Math.round(points * agilityMultiplier(skillLevel(before, 'agility')));
}

// Spends pouch steps on travel, then on repeated actions of the current task.
export function advance(game: Game): Game {
  let pouch = totalSteps(game) - game.spent;
  if (pouch <= 0 || (!game.travel && !game.task)) return game;
  const work = draft(game);
  const dice = new Dice(game.seed);
  let guard = 0;
  while (pouch > 0 && guard < MAX_ACTIONS_PER_ADVANCE) {
    guard += 1;
    if (work.travel) {
      const use = Math.min(work.travel.cost - work.travel.progress, pouch);
      pouch -= use;
      work.spent += use;
      work.walked += use;
      work.travel = { ...work.travel, progress: work.travel.progress + use };
      if (work.travel.progress < work.travel.cost) break;
      work.location = work.travel.to;
      const next = work.travel.next ? getActivity(work.travel.next) : undefined;
      const quest = work.travel.quest;
      work.travel = null;
      work.task =
        next && placeOffers(work.location, next.id) && !activityBlocker(freeze(work), next)
          ? { id: next.id, progress: 0, ...(quest ? { quest } : {}) }
          : null;
      continue;
    }
    if (!work.task) break;
    const activity = getActivity(work.task.id);
    if (!activity) {
      work.task = null;
      break;
    }
    const quest = work.task.quest;
    if (quest && questShortfall(work, quest, activity.output.item) <= 0) {
      work.stopped = { activity: activity.id, kind: 'enough', quest };
      work.task = null;
      break;
    }
    const missing = activity.inputs?.find((input) => available(work, input.item) < input.qty);
    const full = !fits(work.inventory, activity.output.item, activity.output.qty, capacityOf(work));
    if (missing || full || levelForXp(work.xp[activity.skill]) < activity.level) {
      work.stopped = missing
        ? { activity: activity.id, kind: 'missing', item: missing.item }
        : full
          ? { activity: activity.id, kind: 'bag-full' }
          : { activity: activity.id, kind: 'level', skill: activity.skill };
      work.task = null;
      break;
    }
    const need = Math.max(0, stepsPerAction(work, activity) - work.task.progress);
    if (pouch < need) {
      work.spent += pouch;
      work.worked += pouch;
      work.task = { ...work.task, progress: work.task.progress + pouch };
      pouch = 0;
      break;
    }
    pouch -= need;
    work.spent += need;
    work.worked += need;
    work.task = { ...work.task, progress: 0 };
    completeAction(work, dice, activity);
    // Checked after each action too, so the stop shows in this report even if the pouch ran out.
    if (quest && questShortfall(work, quest, activity.output.item) <= 0) {
      work.stopped = { activity: activity.id, kind: 'enough', quest };
      work.task = null;
      break;
    }
  }
  work.xp = { ...work.xp, agility: work.xp.agility + agilityXp(game, work) };
  work.seed = dice.seed;
  return freeze(work);
}

// --- rules ---------------------------------------------------------------------------------

// Why the rules refused an action. `no-change` is a request already satisfied (stop while idle,
// re-equip the worn outfit, re-read the same step total) and needs no explanation; `invalid`
// is a malformed or unknown action that no screen should send. Everything else is the
// player's to fix, and the session explains it.
export type Rejection =
  | Readonly<{ kind: 'no-change' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'bag-full' }>
  | Readonly<{ kind: 'not-at-bank' }>
  | Readonly<{ kind: 'not-at-store' }>
  | Readonly<{ kind: 'travelling' }>
  | Readonly<{ kind: 'not-here'; place: string | null }>
  | Readonly<{ kind: 'too-poor'; price: number }>
  | Readonly<{ kind: 'requires'; requirement: Requirement }>
  | Readonly<{ kind: 'mission-unfinished' }>
  | Readonly<{ kind: 'outfit-locked'; total: number }>
  | Readonly<{ kind: 'clock-behind' }>;

export type RuleResult = Readonly<{ ok: true; game: Game }> | Readonly<{ ok: false; reason: Rejection }>;

function accept(game: Game): RuleResult {
  return { ok: true, game };
}

function refuse(reason: Rejection): RuleResult {
  return { ok: false, reason };
}

const NO_CHANGE: RuleResult = refuse({ kind: 'no-change' });
const INVALID: RuleResult = refuse({ kind: 'invalid' });

function isQty(value: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= max;
}

// How far a bag runs past its capacity; 0 when everything fits.
function overflow(game: Pick<Game, 'inventory' | 'bagUpgrades'> & Loadout): number {
  return Math.max(0, slotsUsed(game.inventory) - capacityOf(game));
}

function wear(game: Game, key: string, slot?: GearSlot): RuleResult {
  const item = keyItem(key);
  if (!item || !isKnownKey(key)) return INVALID;
  const inBag = (game.inventory[key] ?? 0) > 0;
  const inBank = atBank(game) && (game.bank[key] ?? 0) > 0;
  if (!inBag && !inBank)
    return refuse({ kind: 'requires', requirement: { kind: 'item', item: key, qty: 1 } });
  const before = overflow(game);
  // Swapped-out gear goes where the new piece came from. A smaller pack can shrink the bag, so a
  // swap must still fit afterwards; at a bank the old piece may go there instead, as in `unwear`.
  const swap = (old: string | undefined, equip: (next: Draft) => void): RuleResult => {
    for (const stowInBag of atBank(game) && inBag ? [true, false] : [inBag]) {
      const next = draft(game);
      if (inBag) next.inventory = add(next.inventory, key, -1);
      else next.bank = add(next.bank, key, -1);
      if (old && stowInBag) next.inventory = add(next.inventory, old, 1);
      else if (old) next.bank = add(next.bank, old, 1);
      equip(next);
      // A bag already over capacity (from an older build) may swap as long as it gets no worse.
      if (overflow(next) <= before) return accept(freeze(next));
    }
    return refuse({ kind: 'bag-full' });
  };
  if (item.tool) {
    const { kind, metal } = item.tool;
    if (game.tools[kind] === key) return NO_CHANGE;
    const level = METAL_STATS[metal].level;
    if (levelForXp(game.xp[TOOL_SKILL[kind]]) < level)
      return refuse({ kind: 'requires', requirement: { kind: 'level', skill: TOOL_SKILL[kind], level } });
    return swap(game.tools[kind], (next) => {
      next.tools = { ...next.tools, [kind]: key };
    });
  }
  const itemSlot = item.slot;
  if (!itemSlot) return INVALID;
  const target =
    slot && slotFits(slot, itemSlot)
      ? slot
      : (GEAR_SLOTS.find((entry) => slotFits(entry, itemSlot) && !game.gear[entry]) ??
        GEAR_SLOTS.find((entry) => slotFits(entry, itemSlot)));
  if (!target) return INVALID;
  return swap(game.gear[target], (next) => {
    next.gear = { ...next.gear, [target]: key };
  });
}

function applyRules(game: Game, action: GameAction): RuleResult {
  switch (action.type) {
    case 'onboarded': {
      if (!game.onboarding) return NO_CHANGE;
      const { onboarding: _done, ...rest } = game;
      return accept(rest);
    }
    case 'health-pause':
      return game.health?.enabled
        ? accept({ ...game, health: { ...game.health, enabled: false } })
        : NO_CHANGE;
    case 'health-sync':
      return healthSync(game, action);
    case 'equip': {
      const skin = getSkin(action.skin);
      if (skin.id !== action.skin) return INVALID;
      if (game.equipped === skin.id) return NO_CHANGE;
      return totalLevel(game) >= skin.total
        ? accept({ ...game, equipped: skin.id })
        : refuse({ kind: 'outfit-locked', total: skin.total });
    }
    case 'start': {
      const activity = getActivity(action.activity);
      if (!activity) return INVALID;
      if (game.travel) return refuse({ kind: 'travelling' });
      if (!placeOffers(game.location, activity.id)) return refuse({ kind: 'not-here', place: null });
      const requirement = activityRequirement(game, activity);
      if (requirement) return refuse({ kind: 'requires', requirement });
      const quest = action.quest && getQuest(action.quest) ? action.quest : undefined;
      if (game.task?.id === activity.id && game.task.quest === quest) return NO_CHANGE;
      return accept({
        ...game,
        task: { id: activity.id, progress: 0, ...(quest ? { quest } : {}) },
        stopped: null,
      });
    }
    case 'stop':
      return game.task || game.stopped ? accept({ ...game, task: null, stopped: null }) : NO_CHANGE;
    case 'travel': {
      const place = getLocation(action.to);
      if (!place) return INVALID;
      if (game.travel) return refuse({ kind: 'travelling' });
      if (place.id === game.location) return NO_CHANGE;
      const requirement = locationRequirement(game, place);
      if (requirement) return refuse({ kind: 'requires', requirement });
      const path = route(game.location, place.id);
      if (!path) return INVALID;
      const next = action.next && placeOffers(place.id, action.next) ? action.next : null;
      const quest = next && action.quest && getQuest(action.quest) ? action.quest : undefined;
      return accept({
        ...game,
        task: null,
        stopped: null,
        travel: {
          from: game.location,
          to: place.id,
          cost: travelCost(game, path.distance),
          progress: 0,
          next,
          ...(quest ? { quest } : {}),
        },
      });
    }
    case 'cancel-travel':
      return game.travel ? accept({ ...game, travel: null }) : NO_CHANGE;
    case 'wear':
      return wear(game, action.item, action.slot);
    case 'unwear': {
      const key = game.gear[action.slot];
      if (!key) return NO_CHANGE;
      const gear = { ...game.gear };
      delete gear[action.slot];
      // Taking off a pack shrinks the bag, so check space without it.
      if (fits(game.inventory, key, 1, capacityOf({ ...game, gear })))
        return accept({ ...game, gear, inventory: add(game.inventory, key, 1) });
      if (atBank(game)) return accept({ ...game, gear, bank: add(game.bank, key, 1) });
      return refuse({ kind: 'bag-full' });
    }
    case 'eat': {
      const item = getItem(action.item);
      if (!item?.buff) return INVALID;
      const work = draft(game);
      if (!spend(work, item.id, 1))
        return refuse({ kind: 'requires', requirement: { kind: 'item', item: item.id, qty: 1 } });
      work.buff = { item: item.id, actions: item.buff.actions };
      count(work, 'eaten');
      return accept(freeze(work));
    }
    case 'open': {
      const item = getItem(action.item);
      if (!item?.loot || !isQty(action.count, game.inventory[action.item] ?? 0)) return INVALID;
      const work = draft(game);
      const dice = new Dice(game.seed);
      work.inventory = add(work.inventory, item.id, -action.count);
      for (let index = 0; index < action.count; index += 1) rollLoot(work, dice, item);
      count(work, 'chestsOpened', action.count);
      work.seed = dice.seed;
      return accept(freeze(work));
    }
    case 'deposit': {
      if (!atBank(game)) return refuse({ kind: 'not-at-bank' });
      if (!isQty(action.qty, game.inventory[action.item] ?? 0)) return INVALID;
      return accept({
        ...game,
        inventory: add(game.inventory, action.item, -action.qty),
        bank: add(game.bank, action.item, action.qty),
      });
    }
    case 'deposit-all': {
      if (!atBank(game)) return refuse({ kind: 'not-at-bank' });
      // Chests stay in the bag: they take no slots there, and they open from the bag.
      const keep = (key: string): boolean => keyItem(key)?.kind === 'chest';
      const moving = Object.entries(game.inventory).filter(([key]) => !keep(key));
      if (moving.length === 0) return NO_CHANGE;
      let bank: Bag = game.bank;
      for (const [key, qty] of moving) bank = add(bank, key, qty);
      const inventory = Object.fromEntries(Object.entries(game.inventory).filter(([key]) => keep(key)));
      return accept({ ...game, inventory, bank });
    }
    case 'withdraw': {
      if (!atBank(game)) return refuse({ kind: 'not-at-bank' });
      if (!isQty(action.qty, game.bank[action.item] ?? 0)) return INVALID;
      if (!fits(game.inventory, action.item, action.qty, capacityOf(game)))
        return refuse({ kind: 'bag-full' });
      return accept({
        ...game,
        inventory: add(game.inventory, action.item, action.qty),
        bank: add(game.bank, action.item, -action.qty),
      });
    }
    case 'drop': {
      if (!isQty(action.qty, game.inventory[action.item] ?? 0)) return INVALID;
      return accept({ ...game, inventory: add(game.inventory, action.item, -action.qty) });
    }
    case 'sell': {
      if (!isKnownKey(action.item)) return INVALID;
      if (!atStore(game)) return refuse({ kind: 'not-at-store' });
      const inBag = game.inventory[action.item] ?? 0;
      // The bank only sells from a town that also has one.
      const inBank = atBank(game) ? (game.bank[action.item] ?? 0) : 0;
      if (!isQty(action.qty, inBag + inBank)) return INVALID;
      const fromBag = Math.min(inBag, action.qty);
      return accept({
        ...game,
        inventory: add(game.inventory, action.item, -fromBag),
        bank: add(game.bank, action.item, -(action.qty - fromBag)),
        coins: game.coins + keyValue(action.item) * action.qty,
      });
    }
    case 'buy': {
      const offer = STORE_STOCK.find((entry) => entry.item === action.item);
      if (!offer) return INVALID;
      if (!atStore(game)) return refuse({ kind: 'not-at-store' });
      if (game.coins < offer.price) return refuse({ kind: 'too-poor', price: offer.price });
      const work = draft(game);
      work.coins -= offer.price;
      if (fits(work.inventory, offer.item, 1, capacityOf(work))) gain(work, offer.item, 1);
      else {
        work.bank = add(work.bank, offer.item, 1);
        if (!work.seen.includes(offer.item)) work.seen.push(offer.item);
      }
      return accept(freeze(work));
    }
    case 'upgrade-bag': {
      const price = nextBagUpgrade(game);
      if (price === null) return NO_CHANGE;
      if (!atBank(game)) return refuse({ kind: 'not-at-bank' });
      if (game.coins < price) return refuse({ kind: 'too-poor', price });
      return accept({ ...game, coins: game.coins - price, bagUpgrades: game.bagUpgrades + 1 });
    }
    case 'mission-claim': {
      const mission = missionsFor(game, action.period, action.date).find(
        (entry) => entry.id === action.mission,
      );
      if (!mission) return INVALID;
      if (missionClaimed(game, mission, action.date)) return NO_CHANGE;
      const { value, target } = missionProgress(game, mission, action.date);
      if (value < target) return refuse({ kind: 'mission-unfinished' });
      const work = draft(game);
      const state = work.missions[mission.period];
      if (!state) return INVALID;
      work.missions = {
        ...work.missions,
        [mission.period]: { ...state, claimed: [...state.claimed, mission.id] },
      };
      work.coins += mission.coins;
      for (const stack of mission.items ?? []) gain(work, stack.item, stack.qty);
      count(work, 'missions');
      return accept(freeze(work));
    }
    case 'quest-start': {
      const quest = getQuest(action.quest);
      if (!quest) return INVALID;
      if (questState(game, quest.id) !== 'new') return NO_CHANGE;
      const requirement = questRequirement(game, quest);
      if (requirement) return refuse({ kind: 'requires', requirement });
      return accept({ ...game, quests: { ...game.quests, [quest.id]: 'started' } });
    }
    case 'quest-complete': {
      const quest = getQuest(action.quest);
      if (!quest) return INVALID;
      if (questState(game, quest.id) !== 'started') return NO_CHANGE;
      if (game.travel) return refuse({ kind: 'travelling' });
      if (game.location !== quest.location) return refuse({ kind: 'not-here', place: quest.location });
      const requirement = questRequirement(game, quest);
      if (requirement) return refuse({ kind: 'requires', requirement });
      const short = quest.deliver.find((stack) => available(game, stack.item) < stack.qty);
      if (short) return refuse({ kind: 'requires', requirement: { kind: 'item', ...short } });
      const work = draft(game);
      for (const stack of quest.deliver) spend(work, stack.item, stack.qty);
      for (const stack of quest.rewards.items ?? []) gain(work, stack.item, stack.qty);
      const xp = { ...work.xp };
      for (const { skill, amount } of quest.rewards.xp ?? []) xp[skill] += amount;
      work.xp = xp;
      work.coins += quest.rewards.coins ?? 0;
      work.quests = { ...work.quests, [quest.id]: 'done' };
      return accept(freeze(work));
    }
    default:
      return dayRules(game, action);
  }
}

function dayRules(
  game: Game,
  action: Extract<GameAction, { type: 'new-day' | 'add-steps' | 'sync-steps' | 'goal' }>,
): RuleResult {
  const day = getDay(game, action.date);
  let updated = day;
  let goal = game.goal;
  switch (action.type) {
    case 'new-day':
      if (game.days.some((entry) => entry.date === action.date)) return NO_CHANGE;
      break;
    case 'add-steps':
      if (
        !Number.isSafeInteger(action.steps) ||
        action.steps <= 0 ||
        !Number.isSafeInteger(day.steps + action.steps)
      )
        return INVALID;
      updated = { ...day, steps: day.steps + action.steps };
      break;
    case 'sync-steps':
      if (!Number.isSafeInteger(action.steps)) return INVALID;
      if (action.steps <= day.steps) return NO_CHANGE;
      updated = { ...day, steps: action.steps };
      break;
    case 'goal':
      if (!GOALS.includes(action.goal)) return INVALID;
      if (
        action.goal === game.goal &&
        day.goal === action.goal &&
        game.days.some((entry) => entry.date === action.date)
      )
        return NO_CHANGE;
      goal = action.goal;
      updated = { ...day, goal };
      break;
  }
  return accept({
    ...game,
    goal,
    days: [...game.days.filter((entry) => entry.date !== action.date), updated].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
  });
}

// Why a Health batch would be refused, or null when it can be applied.
export function healthSyncRejection(
  game: Pick<Game, 'health'>,
  action: Extract<GameAction, { type: 'health-sync' }>,
): Rejection | null {
  if (
    !isHealthConnection({
      source: action.source,
      enabled: true,
      syncedAt: action.at,
      startedOn: action.date,
    }) ||
    !isDateKey(action.date) ||
    dateKey(new Date(action.at)) !== action.date ||
    new Set(action.days.map((day) => day.date)).size !== action.days.length ||
    action.days.some(
      (day) =>
        !isDateKey(day.date) || day.date > action.date || !Number.isSafeInteger(day.steps) || day.steps < 0,
    )
  )
    return { kind: 'invalid' };
  // A clock set back behind the last sync would replay an older snapshot.
  if (game.health?.source === action.source && game.health.syncedAt > action.at)
    return { kind: 'clock-behind' };
  return null;
}

function healthSync(game: Game, action: Extract<GameAction, { type: 'health-sync' }>): RuleResult {
  const rejection = healthSyncRejection(game, action);
  if (rejection) return refuse(rejection);
  const days = new Map(game.days.map((day) => [day.date, day]));
  for (const sample of action.days) {
    const previous = getDay(game, sample.date);
    // A health total is a snapshot, never another sensor increment. Already-earned
    // game progress survives deleted samples or changes to health read access.
    days.set(sample.date, { ...previous, steps: Math.max(previous.steps, sample.steps) });
  }
  const updated = {
    ...game,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    health: {
      source: action.source,
      enabled: true,
      syncedAt: action.at,
      startedOn:
        game.health?.enabled && game.health.source === action.source
          ? game.health.startedOn
          : // biome-ignore lint/complexity/useMathMinMax: dates are ISO YYYY-MM-DD strings, which compare by text; Math.min would coerce them to NaN.
            action.days.reduce((first, day) => (day.date < first ? day.date : first), action.date),
    },
  };
  return Number.isSafeInteger(totalSteps(updated)) ? accept(updated) : INVALID;
}

// Any dated action first opens the current mission periods, so their counters start before the
// action's own steps or work count.
function rolledFor(game: Game, action: GameAction): Game {
  return 'date' in action && isDateKey(action.date) ? rollMissions(game, action.date) : game;
}

// Applies one action and spends any waiting steps, or says why the rules refused it. A refused
// action changes nothing, not even the mission periods; a new day always rolls them.
export function playGame(game: Game, action: GameAction): RuleResult {
  const rolled = rolledFor(game, action);
  const ruled = applyRules(rolled, action);
  if (ruled.ok) return accept(advance(ruled.game));
  // A new day the save already has still opens the periods and spends any waiting steps.
  if (action.type === 'new-day') return accept(advance(rolled));
  return ruled;
}

// Why the rules would refuse an action right now, or null if they would accept it. Screens use
// this to disable buttons from the same source as the rules.
export function actionRejection(game: Game, action: GameAction): Rejection | null {
  const ruled = applyRules(rolledFor(game, action), action);
  return ruled.ok ? null : ruled.reason;
}

// The same rules, for callers that only need the next state: a refused action returns `game`.
export function updateGame(game: Game, action: GameAction): Game {
  const result = playGame(game, action);
  return result.ok ? result.game : game;
}
