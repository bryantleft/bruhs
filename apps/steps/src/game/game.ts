import {
  ACTIVITIES,
  type Activity,
  ADVENTURER_CHANCE,
  BAG_UPGRADE_SLOTS,
  BAG_UPGRADES,
  CHEST_CHANCE,
  FIXED_MISSIONS,
  GEAR_SLOTS,
  type GearSlot,
  getActivity,
  getItem,
  getLocation,
  getQuest,
  type Item,
  LOCATIONS,
  METAL_STATS,
  MISSION_PERIODS,
  MISSION_PICKS,
  MISSION_POOLS,
  type Mission,
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
  TOOL_KINDS,
  TOOL_SKILL,
  type ToolKind,
  toolId,
} from './content.ts';
import {
  add,
  BASE_SLOTS,
  type Bag,
  countOf,
  fits,
  isKnownKey,
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
import { levelForXp } from './xp.ts';

export { SKINS, type Skin, type SkinId } from './content.ts';

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
}>;
export type Task = Readonly<{ id: string; progress: number }>;
// `missing` is an item id, "inventory" when the bag is full, or "<skill>-level".
export type StopReason = Readonly<{ activity: string; missing: string }>;
export type Buff = Readonly<{ item: string; actions: number }>;
// One period's missions: which were drawn, the counters when the period began, and claims.
export type MissionState = Readonly<{
  key: string;
  picks: readonly string[];
  base: Readonly<Record<string, number>>;
  claimed: readonly string[];
}>;

export type Game = Readonly<{
  version: 3;
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
  stats: Readonly<Record<string, number>>;
  // Backpack upgrades bought at a bank, two slots each.
  bagUpgrades: number;
  missions: Readonly<Partial<Record<MissionPeriod, MissionState>>>;
}>;

export type GameAction =
  | Readonly<{ type: 'new-day'; date: string }>
  | Readonly<{ type: 'add-steps'; date: string; steps: number }>
  | Readonly<{ type: 'sync-steps'; date: string; steps: number }>
  | Readonly<{ type: 'mission-claim'; date: string; period: MissionPeriod; mission: string }>
  | Readonly<{ type: 'upgrade-bag' }>
  | Readonly<{ type: 'goal'; date: string; goal: Goal }>
  | Readonly<{ type: 'equip'; skin: SkinId }>
  | Readonly<{ type: 'start'; activity: string }>
  | Readonly<{ type: 'stop' }>
  | Readonly<{ type: 'travel'; to: string; next?: string }>
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

const STARTER_TOOLS: Readonly<Record<ToolKind, string>> = {
  axe: toolId('bronze', 'axe'),
  pickaxe: toolId('bronze', 'pickaxe'),
  harpoon: toolId('bronze', 'harpoon'),
  shears: toolId('bronze', 'shears'),
};
// A small starter kit so the bag, food buffs and crafting are discoverable from minute one.
const STARTER_INVENTORY: Bag = { minnow: 3, linen: 2, 'bird-nest': 1 };

function emptyXp(): Record<SkillId, number> {
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

export function inventoryFull(game: Game): boolean {
  return slotsUsed(game.inventory) >= capacityOf(game);
}

// What you can use right now: the inventory, plus the bank when standing in a bank town.
export function available(
  game: Pick<Game, 'inventory' | 'bank' | 'location' | 'travel'>,
  id: string,
): number {
  return countOf(game.inventory, id) + (atBank(game) ? countOf(game.bank, id) : 0);
}

export function toolFor(game: Pick<Game, 'tools'>, kind: ToolKind): Item | undefined {
  return keyItem(game.tools[kind]);
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

export function locationBlocker(game: Pick<Game, 'xp' | 'quests'>, place: Place): string | null {
  const requirement = place.requires;
  if (!requirement) return null;
  if (requirement.type === 'skill')
    return skillLevel(game, requirement.skill) >= requirement.level
      ? null
      : `needs ${requirement.skill} ${requirement.level}`;
  return game.quests[requirement.quest] === 'done'
    ? null
    : `needs quest: ${getQuest(requirement.quest)?.name ?? requirement.quest}`;
}

export function activityBlocker(game: Game, activity: Activity): string | null {
  if (skillLevel(game, activity.skill) < activity.level) return `needs ${activity.skill} ${activity.level}`;
  const missing = activity.inputs?.find((input) => available(game, input.item) < input.qty);
  if (missing) return `needs ${getItem(missing.item)?.name ?? missing.item} ×${missing.qty}`;
  return null;
}

// --- guidance ------------------------------------------------------------------------------

export type NextStep =
  | Readonly<{ kind: 'hand-in'; quest: Quest }>
  | Readonly<{ kind: 'start-quest'; quest: Quest }>
  | Readonly<{ kind: 'start'; activity: Activity; quest?: Quest }>
  | Readonly<{ kind: 'travel'; place: Place; activity?: Activity; quest?: Quest }>;

// How many times an activity can run on what you hold (bank included in a bank town).
export function runsLeft(game: Game, activity: Activity): number {
  if (!activity.inputs?.length) return Number.POSITIVE_INFINITY;
  return Math.min(...activity.inputs.map((input) => Math.floor(available(game, input.item) / input.qty)));
}

// Where an item can be made or gathered right now: here first, then the nearest open place.
export function sourceOf(
  game: Game,
  item: string,
): Readonly<{ activity: Activity; place: Place; distance: number }> | null {
  let best: { activity: Activity; place: Place; distance: number } | null = null;
  for (const activity of ACTIVITIES) {
    if (activity.output.item !== item || skillLevel(game, activity.skill) < activity.level) continue;
    for (const place of LOCATIONS) {
      if (!place.activities.includes(activity.id) || locationBlocker(game, place)) continue;
      const distance =
        place.id === game.location ? 0 : (route(game.location, place.id)?.distance ?? Infinity);
      if (!best || distance < best.distance) best = { activity, place, distance };
    }
  }
  return best;
}

function toward(game: Game, item: string, quest: Quest | undefined, depth = 0): NextStep | null {
  const source = sourceOf(game, item);
  if (!source) return null;
  // A recipe short on inputs points at its first missing input instead.
  const missing = source.activity.inputs?.find((input) => available(game, input.item) < input.qty);
  if (missing && depth < 2) {
    const deeper = toward(game, missing.item, quest, depth + 1);
    if (deeper) return deeper;
  }
  if (source.distance === 0 && !activityBlocker(game, source.activity))
    return { kind: 'start', activity: source.activity, ...(quest ? { quest } : {}) };
  if (source.distance === 0) return null;
  return { kind: 'travel', place: source.place, activity: source.activity, ...(quest ? { quest } : {}) };
}

// The one thing to do next, for the idle panel: quests first, then steady work.
export function nextStep(game: Game): NextStep | null {
  if (game.travel) return null;
  for (const quest of QUESTS) {
    if (questState(game, quest.id) !== 'started' || questBlocker(game, quest)) continue;
    if (canHandIn(game, quest)) {
      if (game.location === quest.location) return { kind: 'hand-in', quest };
      const gathered = quest.deliver.every(
        (stack) => countOf(game.inventory, stack.item) + countOf(game.bank, stack.item) >= stack.qty,
      );
      const place = getLocation(quest.location);
      if (gathered && place) return { kind: 'travel', place, quest };
    }
    const short = quest.deliver.find(
      (stack) => countOf(game.inventory, stack.item) + countOf(game.bank, stack.item) < stack.qty,
    );
    if (short) {
      const step = toward(game, short.item, quest);
      if (step) return step;
    } else {
      const place = getLocation(quest.location);
      if (place && place.id !== game.location) return { kind: 'travel', place, quest };
    }
  }
  const here = (getLocation(game.location)?.activities ?? [])
    .map((id) => getActivity(id))
    .filter((activity): activity is Activity => !!activity && !activityBlocker(game, activity));
  // Steady work beats a recipe that stops after one go.
  const steady = here
    .filter((activity) => runsLeft(game, activity) >= 5)
    .sort((a, b) => b.xp / stepsPerAction(game, b) - a.xp / stepsPerAction(game, a))[0];
  const fresh = QUESTS.find((quest) => questState(game, quest.id) === 'new' && !questBlocker(game, quest));
  if (fresh && !Object.values(game.quests).includes('started')) return { kind: 'start-quest', quest: fresh };
  if (steady) return { kind: 'start', activity: steady };
  // Nothing steady here: walk to gather for the lowest gathering skill.
  const gathering = (['woodcutting', 'mining', 'fishing', 'foraging'] as const)
    .slice()
    .sort((a, b) => skillLevel(game, a) - skillLevel(game, b));
  for (const skill of gathering) {
    const activity = ACTIVITIES.filter(
      (entry) => entry.skill === skill && !entry.inputs && entry.level <= skillLevel(game, skill),
    ).sort((a, b) => b.level - a.level)[0];
    const step = activity ? toward(game, activity.output.item, undefined) : null;
    if (step) return step;
  }
  const any = here.sort((a, b) => b.xp - a.xp)[0];
  return any ? { kind: 'start', activity: any } : null;
}

// What a level-up opened: recipes and spots, tools you can now wield, places you can reach.
export function unlocksBetween(skill: SkillId, from: number, to: number): string[] {
  const opened = (level: number): boolean => level > from && level <= to;
  const unlocks: string[] = [];
  for (const activity of ACTIVITIES)
    if (activity.skill === skill && opened(activity.level)) unlocks.push(`${activity.verb} ${activity.name}`);
  for (const [kind, owner] of Object.entries(TOOL_SKILL))
    if (owner === skill)
      for (const [metal, stats] of Object.entries(METAL_STATS))
        if (opened(stats.level)) unlocks.push(`wield ${metal} ${kind}`);
  for (const place of LOCATIONS)
    if (place.requires?.type === 'skill' && place.requires.skill === skill && opened(place.requires.level))
      unlocks.push(`travel to ${place.name}`);
  return unlocks;
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

export function questBlocker(game: Pick<Game, 'xp' | 'quests'>, quest: Quest): string | null {
  for (const required of quest.requires.quests ?? [])
    if (game.quests[required] !== 'done') return `complete ${getQuest(required)?.name ?? required}`;
  for (const { skill, level } of quest.requires.skills ?? [])
    if (skillLevel(game, skill) < level) return `needs ${skill} ${level}`;
  return null;
}

export function canHandIn(game: Game, quest: Quest): boolean {
  return quest.deliver.every((stack) => available(game, stack.item) >= stack.qty);
}

// --- deterministic randomness ------------------------------------------------------------

// mulberry32: one 32-bit state word, advanced once per roll.
function roll(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4_294_967_296, next];
}

class Dice {
  seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    const [value, seed] = roll(this.seed);
    this.seed = seed;
    return value;
  }
  chance(probability: number): boolean {
    return probability > 0 && this.next() < probability;
  }
  between(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

// --- mutable working copy for rules and the step engine ----------------------------------

type Draft = Omit<{ -readonly [K in keyof Game]: Game[K] }, 'seen'> & { seen: string[] };

function draft(game: Game): Draft {
  return { ...game, xp: { ...game.xp }, seen: [...game.seen] };
}

function freeze(work: Draft): Game {
  return { ...work, seen: [...new Set(work.seen)] };
}

function count(work: Draft, stat: string, amount = 1): void {
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
      work.travel = null;
      work.task =
        next && placeOffers(work.location, next.id) && !activityBlocker(freeze(work), next)
          ? { id: next.id, progress: 0 }
          : null;
      continue;
    }
    if (!work.task) break;
    const activity = getActivity(work.task.id);
    if (!activity) {
      work.task = null;
      break;
    }
    const missing = activity.inputs?.find((input) => available(work, input.item) < input.qty);
    const full = !fits(work.inventory, activity.output.item, activity.output.qty, capacityOf(work));
    if (missing || full || levelForXp(work.xp[activity.skill]) < activity.level) {
      work.stopped = {
        activity: activity.id,
        missing: missing?.item ?? (full ? 'inventory' : `${activity.skill}-level`),
      };
      work.task = null;
      break;
    }
    const need = Math.max(0, stepsPerAction(work, activity) - work.task.progress);
    if (pouch < need) {
      work.spent += pouch;
      work.worked += pouch;
      work.task = { id: work.task.id, progress: work.task.progress + pouch };
      pouch = 0;
      break;
    }
    pouch -= need;
    work.spent += need;
    work.worked += need;
    work.task = { id: work.task.id, progress: 0 };
    completeAction(work, dice, activity);
  }
  work.xp = { ...work.xp, agility: work.xp.agility + agilityXp(game, work) };
  work.seed = dice.seed;
  return freeze(work);
}

// --- rules ---------------------------------------------------------------------------------

// How far a bag runs past its capacity; 0 when everything fits.
function overflow(game: Pick<Game, 'inventory' | 'bagUpgrades'> & Loadout): number {
  return Math.max(0, slotsUsed(game.inventory) - capacityOf(game));
}

function wear(work: Draft, key: string, slot?: GearSlot): boolean {
  const item = keyItem(key);
  const inBag = (work.inventory[key] ?? 0) > 0;
  const inBank = atBank(work) && (work.bank[key] ?? 0) > 0;
  if (!item || (!inBag && !inBank)) return false;
  const before = overflow(work);
  // Swapped-out gear goes where the new piece came from. A smaller pack can shrink the bag, so a
  // swap must still fit afterwards; at a bank the old piece may go there instead, as in `unwear`.
  const swap = (old: string | undefined, equip: (next: Draft) => void): boolean => {
    for (const stowInBag of atBank(work) && inBag ? [true, false] : [inBag]) {
      const next: Draft = { ...work };
      if (inBag) next.inventory = add(next.inventory, key, -1);
      else next.bank = add(next.bank, key, -1);
      if (old && stowInBag) next.inventory = add(next.inventory, old, 1);
      else if (old) next.bank = add(next.bank, old, 1);
      equip(next);
      // A bag already over capacity (from an older build) may swap as long as it gets no worse.
      if (overflow(next) > before) continue;
      Object.assign(work, next);
      return true;
    }
    return false;
  };
  if (item.tool) {
    const { kind, metal } = item.tool;
    if (levelForXp(work.xp[TOOL_SKILL[kind]]) < METAL_STATS[metal].level || work.tools[kind] === key)
      return false;
    return swap(work.tools[kind], (next) => {
      next.tools = { ...next.tools, [kind]: key };
    });
  }
  const itemSlot = item.slot;
  if (!itemSlot) return false;
  const target =
    slot && slotFits(slot, itemSlot)
      ? slot
      : (GEAR_SLOTS.find((entry) => slotFits(entry, itemSlot) && !work.gear[entry]) ??
        GEAR_SLOTS.find((entry) => slotFits(entry, itemSlot)));
  if (!target) return false;
  return swap(work.gear[target], (next) => {
    next.gear = { ...next.gear, [target]: key };
  });
}

function applyRules(game: Game, action: GameAction): Game {
  switch (action.type) {
    case 'health-pause':
      return game.health?.enabled ? { ...game, health: { ...game.health, enabled: false } } : game;
    case 'health-sync':
      return healthSync(game, action);
    case 'equip': {
      const skin = getSkin(action.skin);
      if (game.equipped === skin.id || skin.id !== action.skin) return game;
      return totalLevel(game) >= skin.total ? { ...game, equipped: skin.id } : game;
    }
    case 'start': {
      const activity = getActivity(action.activity);
      if (
        !activity ||
        game.travel ||
        !placeOffers(game.location, activity.id) ||
        activityBlocker(game, activity) ||
        game.task?.id === activity.id
      )
        return game;
      return { ...game, task: { id: activity.id, progress: 0 }, stopped: null };
    }
    case 'stop':
      return game.task || game.stopped ? { ...game, task: null, stopped: null } : game;
    case 'travel': {
      const place = getLocation(action.to);
      if (!place || game.travel || place.id === game.location || locationBlocker(game, place)) return game;
      const path = route(game.location, place.id);
      if (!path) return game;
      const next = action.next && placeOffers(place.id, action.next) ? action.next : null;
      return {
        ...game,
        task: null,
        stopped: null,
        travel: {
          from: game.location,
          to: place.id,
          cost: travelCost(game, path.distance),
          progress: 0,
          next,
        },
      };
    }
    case 'cancel-travel':
      return game.travel ? { ...game, travel: null } : game;
    case 'wear': {
      const work = draft(game);
      return wear(work, action.item, action.slot) ? freeze(work) : game;
    }
    case 'unwear': {
      const key = game.gear[action.slot];
      if (!key) return game;
      const gear = { ...game.gear };
      delete gear[action.slot];
      // Taking off a pack shrinks the bag, so check space without it.
      if (fits(game.inventory, key, 1, capacityOf({ ...game, gear })))
        return { ...game, gear, inventory: add(game.inventory, key, 1) };
      if (atBank(game)) return { ...game, gear, bank: add(game.bank, key, 1) };
      return game;
    }
    case 'eat': {
      const item = getItem(action.item);
      if (!item?.buff) return game;
      const work = draft(game);
      if (!spend(work, item.id, 1)) return game;
      work.buff = { item: item.id, actions: item.buff.actions };
      count(work, 'eaten');
      return freeze(work);
    }
    case 'open': {
      const item = getItem(action.item);
      const owned = game.inventory[action.item] ?? 0;
      if (!item?.loot || !Number.isSafeInteger(action.count) || action.count < 1 || action.count > owned)
        return game;
      const work = draft(game);
      const dice = new Dice(game.seed);
      work.inventory = add(work.inventory, item.id, -action.count);
      for (let index = 0; index < action.count; index += 1) rollLoot(work, dice, item);
      count(work, 'chestsOpened', action.count);
      work.seed = dice.seed;
      return freeze(work);
    }
    case 'deposit': {
      const qty = game.inventory[action.item] ?? 0;
      if (!atBank(game) || !Number.isSafeInteger(action.qty) || action.qty < 1 || action.qty > qty)
        return game;
      return {
        ...game,
        inventory: add(game.inventory, action.item, -action.qty),
        bank: add(game.bank, action.item, action.qty),
      };
    }
    case 'deposit-all': {
      // Chests stay in the bag: they take no slots there, and they open from the bag.
      const keep = (key: string): boolean => keyItem(key)?.kind === 'chest';
      const moving = Object.entries(game.inventory).filter(([key]) => !keep(key));
      if (!atBank(game) || moving.length === 0) return game;
      let bank: Bag = game.bank;
      for (const [key, qty] of moving) bank = add(bank, key, qty);
      const inventory = Object.fromEntries(Object.entries(game.inventory).filter(([key]) => keep(key)));
      return { ...game, inventory, bank };
    }
    case 'withdraw': {
      const qty = game.bank[action.item] ?? 0;
      if (!atBank(game) || !Number.isSafeInteger(action.qty) || action.qty < 1 || action.qty > qty)
        return game;
      if (!fits(game.inventory, action.item, action.qty, capacityOf(game))) return game;
      return {
        ...game,
        inventory: add(game.inventory, action.item, action.qty),
        bank: add(game.bank, action.item, -action.qty),
      };
    }
    case 'drop': {
      const qty = game.inventory[action.item] ?? 0;
      if (!Number.isSafeInteger(action.qty) || action.qty < 1 || action.qty > qty) return game;
      return { ...game, inventory: add(game.inventory, action.item, -action.qty) };
    }
    case 'sell': {
      if (!atStore(game) || !isKnownKey(action.item)) return game;
      const inBag = game.inventory[action.item] ?? 0;
      const inBank = game.bank[action.item] ?? 0;
      if (!Number.isSafeInteger(action.qty) || action.qty < 1 || action.qty > inBag + inBank) return game;
      const fromBag = Math.min(inBag, action.qty);
      return {
        ...game,
        inventory: add(game.inventory, action.item, -fromBag),
        bank: add(game.bank, action.item, -(action.qty - fromBag)),
        coins: game.coins + keyValue(action.item) * action.qty,
      };
    }
    case 'buy': {
      const offer = STORE_STOCK.find((entry) => entry.item === action.item);
      if (!offer || !atStore(game) || game.coins < offer.price) return game;
      const work = draft(game);
      work.coins -= offer.price;
      if (fits(work.inventory, offer.item, 1, capacityOf(work))) gain(work, offer.item, 1);
      else {
        work.bank = add(work.bank, offer.item, 1);
        if (!work.seen.includes(offer.item)) work.seen.push(offer.item);
      }
      return freeze(work);
    }
    case 'upgrade-bag': {
      const price = nextBagUpgrade(game);
      if (price === null || !atBank(game) || game.coins < price) return game;
      return { ...game, coins: game.coins - price, bagUpgrades: game.bagUpgrades + 1 };
    }
    case 'mission-claim': {
      const mission = missionsFor(game, action.period, action.date).find(
        (entry) => entry.id === action.mission,
      );
      if (!mission || missionClaimed(game, mission, action.date)) return game;
      const { value, target } = missionProgress(game, mission, action.date);
      if (value < target) return game;
      const work = draft(game);
      const state = work.missions[mission.period];
      if (!state) return game;
      work.missions = {
        ...work.missions,
        [mission.period]: { ...state, claimed: [...state.claimed, mission.id] },
      };
      work.coins += mission.coins;
      for (const stack of mission.items ?? []) gain(work, stack.item, stack.qty);
      count(work, 'missions');
      return freeze(work);
    }
    case 'quest-start': {
      const quest = getQuest(action.quest);
      if (!quest || questState(game, quest.id) !== 'new' || questBlocker(game, quest)) return game;
      return { ...game, quests: { ...game.quests, [quest.id]: 'started' } };
    }
    case 'quest-complete': {
      const quest = getQuest(action.quest);
      if (
        !quest ||
        questState(game, quest.id) !== 'started' ||
        game.travel ||
        game.location !== quest.location ||
        questBlocker(game, quest) ||
        !canHandIn(game, quest)
      )
        return game;
      const work = draft(game);
      for (const stack of quest.deliver) spend(work, stack.item, stack.qty);
      for (const stack of quest.rewards.items ?? []) gain(work, stack.item, stack.qty);
      const xp = { ...work.xp };
      for (const { skill, amount } of quest.rewards.xp ?? []) xp[skill] += amount;
      work.xp = xp;
      work.coins += quest.rewards.coins ?? 0;
      work.quests = { ...work.quests, [quest.id]: 'done' };
      return freeze(work);
    }
    default:
      return dayRules(game, action);
  }
}

function dayRules(
  game: Game,
  action: Extract<GameAction, { type: 'new-day' | 'add-steps' | 'sync-steps' | 'goal' }>,
): Game {
  const day = getDay(game, action.date);
  let updated = day;
  let goal = game.goal;
  switch (action.type) {
    case 'new-day':
      if (game.days.some((entry) => entry.date === action.date)) return game;
      break;
    case 'add-steps':
      if (
        !Number.isSafeInteger(action.steps) ||
        action.steps <= 0 ||
        !Number.isSafeInteger(day.steps + action.steps)
      )
        return game;
      updated = { ...day, steps: day.steps + action.steps };
      break;
    case 'sync-steps':
      if (!Number.isSafeInteger(action.steps) || action.steps <= day.steps) return game;
      updated = { ...day, steps: action.steps };
      break;
    case 'goal':
      if (!GOALS.includes(action.goal)) return game;
      if (
        action.goal === game.goal &&
        day.goal === action.goal &&
        game.days.some((entry) => entry.date === action.date)
      )
        return game;
      goal = action.goal;
      updated = { ...day, goal };
      break;
  }
  return {
    ...game,
    goal,
    days: [...game.days.filter((entry) => entry.date !== action.date), updated].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
  };
}

function healthSync(game: Game, action: Extract<GameAction, { type: 'health-sync' }>): Game {
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
    return game;
  if (game.health?.source === action.source && game.health.syncedAt > action.at) return game;
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
          : action.days.reduce((first, day) => (day.date < first ? day.date : first), action.date),
    },
  };
  return Number.isSafeInteger(totalSteps(updated)) ? updated : game;
}

export function updateGame(game: Game, action: GameAction): Game {
  // Any dated action first opens the current mission periods, so their counters start
  // before the action's own steps or work count.
  const rolled = 'date' in action && isDateKey(action.date) ? rollMissions(game, action.date) : game;
  const ruled = applyRules(rolled, action);
  // A rejected action changes nothing, not even the mission periods.
  if (ruled === rolled && action.type !== 'new-day') return game;
  return advance(ruled);
}

// --- missions ------------------------------------------------------------------------------

function shiftDate(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

// The first and last date of the period containing `date`. Weeks start on Monday.
export function periodRange(period: MissionPeriod, date: string): Readonly<{ start: string; end: string }> {
  if (period === 'daily') return { start: date, end: date };
  if (period === 'weekly') {
    const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    const start = shiftDate(date, -weekday);
    return { start, end: shiftDate(start, 6) };
  }
  const start = `${date.slice(0, 7)}-01`;
  const next = new Date(`${start}T12:00:00`);
  next.setMonth(next.getMonth() + 1);
  return { start, end: dayBefore(dateKey(next)) };
}

export function periodKey(period: MissionPeriod, date: string): string {
  return `${period}:${periodRange(period, date).start}`;
}

// Whole days left in the period after today (0 on its last day).
export function periodDaysLeft(period: MissionPeriod, date: string): number {
  const end = new Date(`${periodRange(period, date).end}T12:00:00`).getTime();
  return Math.round((end - new Date(`${date}T12:00:00`).getTime()) / 86_400_000);
}

function missionCounters(game: Game): Record<string, number> {
  const counters: Record<string, number> = {
    actions: game.actions,
    road: game.walked,
    chests: game.stats.chestsFound ?? 0,
    quests: Object.values(game.quests).filter((state) => state === 'done').length,
  };
  for (const skill of SKILL_IDS) counters[`actions:${skill}`] = game.stats[`actions:${skill}`] ?? 0;
  return counters;
}

// Snapshots keep only non-zero counters, matching how saves store counts.
function snapshot(game: Game): Record<string, number> {
  return Object.fromEntries(Object.entries(missionCounters(game)).filter(([, value]) => value > 0));
}

function hashString(text: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

// Draws the period's pool missions from the period alone: stable however the save's dice move,
// and the same for everyone, so a party shares its week's missions.
function drawMissions(game: Game, period: MissionPeriod, key: string): string[] {
  const questsLeft = QUESTS.some((quest) => questState(game, quest.id) !== 'done');
  const pool = MISSION_POOLS[period].filter((mission) => mission.kind !== 'quests' || questsLeft);
  const dice = new Dice(hashString(key));
  const picks: string[] = [];
  const left = [...pool];
  while (picks.length < MISSION_PICKS && left.length > 0) {
    const [mission] = left.splice(Math.floor(dice.next() * left.length), 1);
    if (mission) picks.push(mission.id);
  }
  return picks;
}

function missionState(game: Game, period: MissionPeriod, date: string): MissionState {
  const key = periodKey(period, date);
  const state = game.missions[period];
  if (state?.key === key) return state;
  return { key, picks: drawMissions(game, period, key), base: snapshot(game), claimed: [] };
}

export function rollMissions(game: Game, date: string): Game {
  let missions = game.missions;
  for (const period of MISSION_PERIODS) {
    const state = missionState(game, period, date);
    if (state !== game.missions[period]) missions = { ...missions, [period]: state };
  }
  return missions === game.missions ? game : { ...game, missions };
}

const MISSIONS_BY_ID = new Map(
  MISSION_PERIODS.flatMap((period) => [FIXED_MISSIONS[period], ...MISSION_POOLS[period]]).map((mission) => [
    mission.id,
    mission,
  ]),
);

export function getMission(id: string): Mission | undefined {
  return MISSIONS_BY_ID.get(id);
}

export function missionsFor(game: Game, period: MissionPeriod, date: string): readonly Mission[] {
  const picks = missionState(game, period, date).picks.flatMap((id) => {
    const mission = MISSIONS_BY_ID.get(id);
    return mission ? [mission] : [];
  });
  return [FIXED_MISSIONS[period], ...picks];
}

export function missionClaimed(game: Game, mission: Mission, date: string): boolean {
  return missionState(game, mission.period, date).claimed.includes(mission.id);
}

export function missionProgress(
  game: Game,
  mission: Mission,
  date: string,
): Readonly<{ value: number; target: number }> {
  if (mission.kind === 'steps') {
    const { start, end } = periodRange(mission.period, date);
    const value = game.days
      .filter((day) => day.date >= start && day.date <= end)
      .reduce((sum, day) => sum + day.steps, 0);
    const goal = mission.period === 'daily' ? getDay(game, date).goal : game.goal;
    return { value, target: mission.target * goal };
  }
  const key = mission.kind === 'actions' && mission.skill ? `actions:${mission.skill}` : mission.kind;
  const base = missionState(game, mission.period, date).base[key] ?? 0;
  return { value: Math.max(0, (missionCounters(game)[key] ?? 0) - base), target: mission.target };
}

// Missions that are complete and not yet collected, across all periods.
export function readyMissions(game: Game, date: string): readonly Mission[] {
  return MISSION_PERIODS.flatMap((period) =>
    missionsFor(game, period, date).filter((mission) => {
      if (missionClaimed(game, mission, date)) return false;
      const { value, target } = missionProgress(game, mission, date);
      return value >= target;
    }),
  );
}

// --- persistence -----------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isGoal(value: unknown): value is Goal {
  return GOALS.some((goal) => goal === value);
}

function isHealthConnection(value: unknown): value is HealthConnection {
  return (
    isRecord(value) &&
    (value.source === 'apple-health' || value.source === 'health-connect') &&
    typeof value.enabled === 'boolean' &&
    isDateKey(value.startedOn) &&
    typeof value.syncedAt === 'string' &&
    !Number.isNaN(new Date(value.syncedAt).getTime()) &&
    new Date(value.syncedAt).toISOString() === value.syncedAt
  );
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && dateKey(date) === value;
}

function decodeDays(value: unknown): Day[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const days: Day[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !isDateKey(entry.date) || !isCount(entry.steps) || !isGoal(entry.goal))
      return null;
    // Older saves also listed claimed daily tasks here; missions replaced them.
    days.push({ date: entry.date, steps: entry.steps, goal: entry.goal });
  }
  if (new Set(days.map((day) => day.date)).size !== days.length) return null;
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function decodeCounts(value: unknown, known: (id: string) => boolean): Record<string, number> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const result: Record<string, number> = {};
  for (const [key, amount] of Object.entries(value)) {
    if (!isCount(amount)) return null;
    // Unknown ids from a newer build are dropped instead of blocking the save.
    if (known(key) && amount > 0) result[key] = amount;
  }
  return result;
}

function decodeTools(value: unknown): Record<ToolKind, string> | null {
  if (!isRecord(value)) return null;
  const tools = { ...STARTER_TOOLS };
  for (const kind of TOOL_KINDS) {
    const key = String(value[kind]);
    const item = keyItem(key);
    if (!isKnownKey(key) || !item?.tool || item.tool.kind !== kind) return null;
    tools[kind] = key;
  }
  return tools;
}

function decodeMissions(value: unknown): Partial<Record<MissionPeriod, MissionState>> {
  const missions: Partial<Record<MissionPeriod, MissionState>> = {};
  if (!isRecord(value)) return missions;
  for (const period of MISSION_PERIODS) {
    const state = value[period];
    if (
      !isRecord(state) ||
      typeof state.key !== 'string' ||
      !state.key.startsWith(`${period}:`) ||
      !Array.isArray(state.picks) ||
      !Array.isArray(state.claimed)
    )
      continue;
    const base = decodeCounts(state.base, () => true);
    if (!base) continue;
    const known = (id: unknown): id is string => typeof id === 'string' && MISSIONS_BY_ID.has(id);
    missions[period] = {
      key: state.key,
      picks: state.picks.filter(known),
      base,
      claimed: [...new Set(state.claimed.filter(known))],
    };
  }
  return missions;
}

// Shared by versions 2 and 3; version 2 had no inventory, gear, buffs or collection log.
function decodeSave(value: Record<string, unknown>, days: Day[]): Game | null {
  const skin = SKINS.find((entry) => entry.id === value.equipped);
  const xpCounts = decodeCounts(value.xp, (id) => SKILL_IDS.includes(id as SkillId));
  const bank = decodeCounts(value.bank, isKnownKey);
  const inventory = decodeCounts(value.inventory, isKnownKey);
  const stats = decodeCounts(value.stats, () => true);
  const tools = decodeTools(value.tools);
  if (!skin || !xpCounts || !bank || !inventory || !stats || !tools || !isGoal(value.goal)) return null;
  for (const key of ['spent', 'walked', 'worked', 'seed', 'coins', 'actions'] as const)
    if (!isCount(value[key])) return null;
  if (typeof value.location !== 'string' || !getLocation(value.location)) return null;
  const quests: Record<string, 'started' | 'done'> = {};
  if (!isRecord(value.quests)) return null;
  for (const [id, state] of Object.entries(value.quests))
    if (getQuest(id) && (state === 'started' || state === 'done')) quests[id] = state;
  let task: Task | null = null;
  if (value.task !== null && value.task !== undefined) {
    if (!isRecord(value.task) || typeof value.task.id !== 'string' || !isCount(value.task.progress))
      return null;
    task = getActivity(value.task.id) ? { id: value.task.id, progress: value.task.progress } : null;
  }
  let travel: Travel | null = null;
  if (value.travel !== null && value.travel !== undefined) {
    const t = value.travel;
    if (
      !isRecord(t) ||
      typeof t.from !== 'string' ||
      typeof t.to !== 'string' ||
      !getLocation(t.from) ||
      !getLocation(t.to) ||
      !isCount(t.cost) ||
      !isCount(t.progress) ||
      t.progress > t.cost ||
      !(t.next === null || (typeof t.next === 'string' && getActivity(t.next)))
    )
      return null;
    travel = { from: t.from, to: t.to, cost: t.cost, progress: t.progress, next: t.next };
  }
  let stopped: StopReason | null = null;
  if (
    isRecord(value.stopped) &&
    typeof value.stopped.activity === 'string' &&
    typeof value.stopped.missing === 'string' &&
    getActivity(value.stopped.activity)
  )
    stopped = { activity: value.stopped.activity, missing: value.stopped.missing };
  const gear: Partial<Record<GearSlot, string>> = {};
  if (isRecord(value.gear))
    for (const slot of GEAR_SLOTS) {
      const key = value.gear[slot];
      const item = typeof key === 'string' && isKnownKey(key) ? keyItem(key) : undefined;
      if (typeof key === 'string' && item?.slot && slotFits(slot, item.slot)) gear[slot] = key;
    }
  let buff: Buff | null = null;
  if (isRecord(value.buff) && typeof value.buff.item === 'string' && isCount(value.buff.actions))
    buff = getItem(value.buff.item)?.buff ? { item: value.buff.item, actions: value.buff.actions } : null;
  const seenList = Array.isArray(value.seen)
    ? value.seen.filter((id): id is string => typeof id === 'string')
    : [];
  const owned = [
    ...Object.keys(bank),
    ...Object.keys(inventory),
    ...Object.values(tools),
    ...Object.values(gear),
  ];
  const seen = [
    ...new Set([...seenList.filter((id) => getItem(id)), ...owned.map((key) => parseKey(key ?? '').id)]),
  ];
  const xp = { ...emptyXp(), ...xpCounts } as Record<SkillId, number>;
  const game: Game = {
    version: 3,
    goal: value.goal,
    equipped: skin.id,
    days,
    ...(isHealthConnection(value.health) ? { health: value.health } : {}),
    spent: value.spent as number,
    walked: value.walked as number,
    worked: value.worked as number,
    seed: (value.seed as number) >>> 0,
    location: value.location,
    task,
    travel,
    stopped,
    xp,
    inventory,
    bank,
    tools,
    gear,
    buff,
    coins: value.coins as number,
    quests,
    actions: value.actions as number,
    seen,
    stats,
    bagUpgrades:
      isCount(value.bagUpgrades) && value.bagUpgrades <= BAG_UPGRADES.length ? value.bagUpgrades : 0,
    missions: decodeMissions(value.missions),
  };
  if (game.spent > totalSteps(game)) return null;
  return totalLevel(game) >= skin.total ? game : { ...game, equipped: 'original' };
}

// Version 1 saves (single XP bar) keep their step history; today's steps start the pouch.
export function migrateV1(value: Record<string, unknown>, days: Day[], today: string): Game | null {
  if (!isGoal(value.goal)) return null;
  const base = createGame(today);
  const history = { ...base, goal: value.goal, days };
  const todaySteps = getDay(history, today).steps;
  return {
    ...history,
    ...(isHealthConnection(value.health) ? { health: value.health } : {}),
    spent: Math.max(0, totalSteps(history) - todaySteps),
  };
}

export function decodeGame(
  raw: string,
  today = dateKey(),
): Readonly<{ ok: true; game: Game; migrated: boolean }> | Readonly<{ ok: false; reason: string }> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'Saved progress is not valid JSON.' };
  }
  if (!isRecord(value)) return { ok: false, reason: 'Saved progress has an unsupported format.' };
  const days = decodeDays(value.days);
  if (!days || !Number.isSafeInteger(days.reduce((sum, day) => sum + day.steps, 0)))
    return { ok: false, reason: 'Saved progress has an unreadable step history.' };
  if (value.version === 3 || value.version === 2) {
    const game = decodeSave(value, days);
    return game
      ? { ok: true, game, migrated: value.version === 2 }
      : { ok: false, reason: 'Saved progress has an unsupported format.' };
  }
  if (value.version === 1) {
    const game = migrateV1(value, days, today);
    return game
      ? { ok: true, game, migrated: true }
      : { ok: false, reason: 'Saved progress has an unsupported format.' };
  }
  return { ok: false, reason: 'Saved progress has an unsupported format.' };
}
