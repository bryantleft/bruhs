// Persistence: decoding saved progress from any supported version, rejecting tampering.
import {
  BAG_UPGRADES,
  GEAR_SLOTS,
  type GearSlot,
  getActivity,
  getItem,
  getLocation,
  getQuest,
  MISSION_PERIODS,
  type MissionPeriod,
  SKILL_IDS,
  SKINS,
  slotFits,
  TOOL_KINDS,
  type ToolKind,
} from './content.ts';
import {
  type Buff,
  createGame,
  type Day,
  dateKey,
  emptyXp,
  type Game,
  GOALS,
  type Goal,
  getDay,
  type HealthConnection,
  type MissionState,
  STARTER_TOOLS,
  type StopReason,
  type Task,
  type Travel,
  totalLevel,
  totalSteps,
} from './game.ts';
import { isKnownKey, keyItem, parseKey } from './items.ts';
import { getMission } from './missions.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isGoal(value: unknown): value is Goal {
  return GOALS.some((goal) => goal === value);
}

export function isHealthConnection(value: unknown): value is HealthConnection {
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

export function isDateKey(value: unknown): value is string {
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
    const known = (id: unknown): id is string => typeof id === 'string' && getMission(id) !== undefined;
    missions[period] = {
      key: state.key,
      picks: state.picks.filter(known),
      base,
      claimed: [...new Set(state.claimed.filter(known))],
    };
  }
  return missions;
}

// The newest save format this build writes and reads.
export const SAVE_VERSION = 3;

// Why saved progress could not be loaded. Only `storage` can succeed on a retry; a save from a
// newer build needs an app update, and the rest are damaged data.
export type LoadFailure =
  | Readonly<{ kind: 'storage' }>
  | Readonly<{ kind: 'invalid-json' }>
  | Readonly<{ kind: 'newer-version'; version: number }>
  | Readonly<{ kind: 'invalid'; field: string }>;

type Invalid = Extract<LoadFailure, { kind: 'invalid' }>;

function invalid(field: string): Invalid {
  return { kind: 'invalid', field };
}

// Shared by versions 2 and 3; version 2 had no inventory, gear, buffs or collection log.
function decodeSave(value: Record<string, unknown>, days: Day[]): Game | Invalid {
  const skin = SKINS.find((entry) => entry.id === value.equipped);
  const xpCounts = decodeCounts(value.xp, (id) => SKILL_IDS.some((skill) => skill === id));
  const bank = decodeCounts(value.bank, isKnownKey);
  const inventory = decodeCounts(value.inventory, isKnownKey);
  const stats = decodeCounts(value.stats, () => true);
  const tools = decodeTools(value.tools);
  if (!skin) return invalid('equipped');
  if (!xpCounts) return invalid('xp');
  if (!bank) return invalid('bank');
  if (!inventory) return invalid('inventory');
  if (!stats) return invalid('stats');
  if (!tools) return invalid('tools');
  const { goal, spent, walked, worked, seed, coins, actions, location } = value;
  if (!isGoal(goal)) return invalid('goal');
  if (!isCount(spent)) return invalid('spent');
  if (!isCount(walked)) return invalid('walked');
  if (!isCount(worked)) return invalid('worked');
  if (!isCount(seed)) return invalid('seed');
  if (!isCount(coins)) return invalid('coins');
  if (!isCount(actions)) return invalid('actions');
  if (typeof location !== 'string' || !getLocation(location)) return invalid('location');
  const quests: Record<string, 'started' | 'done'> = {};
  if (!isRecord(value.quests)) return invalid('quests');
  for (const [id, state] of Object.entries(value.quests))
    if (getQuest(id) && (state === 'started' || state === 'done')) quests[id] = state;
  let task: Task | null = null;
  if (value.task !== null && value.task !== undefined) {
    if (!isRecord(value.task) || typeof value.task.id !== 'string' || !isCount(value.task.progress))
      return invalid('task');
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
      return invalid('travel');
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
  const xp = emptyXp();
  for (const skill of SKILL_IDS) xp[skill] = xpCounts[skill] ?? 0;
  const game: Game = {
    version: 3,
    goal,
    equipped: skin.id,
    days,
    ...(isHealthConnection(value.health) ? { health: value.health } : {}),
    spent,
    walked,
    worked,
    seed: seed >>> 0,
    location,
    task,
    travel,
    stopped,
    xp,
    inventory,
    bank,
    tools,
    gear,
    buff,
    coins,
    quests,
    actions,
    seen,
    stats,
    bagUpgrades:
      isCount(value.bagUpgrades) && value.bagUpgrades <= BAG_UPGRADES.length ? value.bagUpgrades : 0,
    missions: decodeMissions(value.missions),
  };
  if (game.spent > totalSteps(game)) return invalid('spent');
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
): Readonly<{ ok: true; game: Game; migrated: boolean }> | Readonly<{ ok: false; failure: LoadFailure }> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, failure: { kind: 'invalid-json' } };
  }
  if (!isRecord(value)) return { ok: false, failure: invalid('save') };
  // Checked first: a newer build may have changed any field, so nothing else is trusted.
  const version = value.version;
  if (typeof version === 'number' && Number.isSafeInteger(version) && version > SAVE_VERSION)
    return { ok: false, failure: { kind: 'newer-version', version } };
  if (version !== 1 && version !== 2 && version !== 3) return { ok: false, failure: invalid('version') };
  const days = decodeDays(value.days);
  if (!days || !Number.isSafeInteger(days.reduce((sum, day) => sum + day.steps, 0)))
    return { ok: false, failure: invalid('days') };
  if (version === 1) {
    const game = migrateV1(value, days, today);
    return game ? { ok: true, game, migrated: true } : { ok: false, failure: invalid('goal') };
  }
  const game = decodeSave(value, days);
  return 'kind' in game ? { ok: false, failure: game } : { ok: true, game, migrated: version === 2 };
}
