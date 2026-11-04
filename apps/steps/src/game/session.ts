import { GEAR_SLOTS, getQuest, SKILL_IDS, type SkillId, type SkinId, type Stack } from './content.ts';
import {
  capacityOf,
  type Game,
  type GameAction,
  getMission,
  type StopReason,
  unlockedSkins,
  updateGame,
} from './game.ts';
import { add, type Bag, itemCount, keyName, keyValue } from './items.ts';
import { levelForXp } from './xp.ts';

export type Report = Readonly<{
  id: number;
  steps: number;
  actions: number;
  xp: readonly Readonly<{ skill: SkillId; amount: number }>[];
  levels: readonly Readonly<{ skill: SkillId; from: number; level: number }>[];
  gained: readonly Stack[];
  used: readonly Stack[];
  coins: number;
  arrived: string | null;
  stopped: StopReason | null;
  skins: readonly SkinId[];
  quest: string | null;
  opened: number;
  // True when synced steps did the work; false when an action spent steps already waiting.
  walked: boolean;
}>;

export type Notice = Readonly<{ kind: 'status' | 'error'; message: string }>;
export type Gain = Readonly<{ id: number; text: string }>;

export type Session = Readonly<{
  game: Game;
  revision: number;
  notice: Notice | null;
  reward: Report | null;
  restoreRewardFocus: boolean;
  gain: Gain | null;
}>;

export type SessionAction =
  | Readonly<{ type: 'play'; action: GameAction; demo: boolean }>
  | Readonly<{ type: 'restore'; game: Game }>
  | Readonly<{ type: 'notice'; message: string }>
  | Readonly<{ type: 'save-failed'; message: string }>
  | Readonly<{ type: 'save-succeeded' }>
  | Readonly<{ type: 'dismiss-gain'; id: number }>
  | Readonly<{ type: 'dismiss-notice'; notice?: Notice }>
  | Readonly<{ type: 'dismiss-reward'; restoreFocus?: boolean }>;

export function createSession(game: Game): Session {
  return { game, revision: 0, notice: null, reward: null, restoreRewardFocus: true, gain: null };
}

export function diffReport(id: number, before: Game, after: Game, walked = false): Report {
  const xp = SKILL_IDS.flatMap((skill) => {
    const amount = (after.xp[skill] ?? 0) - (before.xp[skill] ?? 0);
    return amount > 0 ? [{ skill, amount }] : [];
  });
  const levels = SKILL_IDS.flatMap((skill) => {
    const from = levelForXp(before.xp[skill] ?? 0);
    const level = levelForXp(after.xp[skill] ?? 0);
    return level > from ? [{ skill, from, level }] : [];
  });
  // Inventory and bank count as one hoard, so banking or equipping never reads as loot.
  const hoard = (game: Game): Bag => {
    let bag: Bag = game.bank;
    for (const [key, qty] of Object.entries(game.inventory)) bag = add(bag, key, qty);
    for (const slot of GEAR_SLOTS) {
      const key = game.gear[slot];
      if (key) bag = add(bag, key, 1);
    }
    for (const key of Object.values(game.tools)) bag = add(bag, key, 1);
    return bag;
  };
  const was = hoard(before);
  const now = hoard(after);
  const items = new Set([...Object.keys(was), ...Object.keys(now)]);
  const gained: Stack[] = [];
  const used: Stack[] = [];
  for (const item of items) {
    const delta = (now[item] ?? 0) - (was[item] ?? 0);
    if (delta > 0) gained.push({ item, qty: delta });
    if (delta < 0) used.push({ item, qty: -delta });
  }
  const order = (stack: Stack): number => -keyValue(stack.item) * stack.qty;
  gained.sort((a, b) => order(a) - order(b));
  const unlocked = new Set(unlockedSkins(before).map((skin) => skin.id));
  const quest = Object.keys(after.quests).find(
    (id) => after.quests[id] === 'done' && before.quests[id] !== 'done',
  );
  return {
    id,
    steps: after.spent - before.spent,
    actions: after.actions - before.actions,
    xp,
    levels,
    gained,
    used,
    coins: after.coins - before.coins,
    arrived: before.location !== after.location ? after.location : null,
    stopped: after.stopped && after.stopped !== before.stopped ? after.stopped : null,
    skins: unlockedSkins(after)
      .filter((skin) => !unlocked.has(skin.id))
      .map((skin) => skin.id),
    quest: quest ?? null,
    opened: (after.stats.chestsOpened ?? 0) - (before.stats.chestsOpened ?? 0),
    walked,
  };
}

function mergeStacks(a: readonly Stack[], b: readonly Stack[]): Stack[] {
  const totals = new Map<string, number>();
  for (const { item, qty } of [...a, ...b]) totals.set(item, (totals.get(item) ?? 0) + qty);
  return [...totals].map(([item, qty]) => ({ item, qty }));
}

export function mergeReports(previous: Report, next: Report): Report {
  const xp = new Map<SkillId, number>();
  for (const { skill, amount } of [...previous.xp, ...next.xp]) xp.set(skill, (xp.get(skill) ?? 0) + amount);
  const levels = new Map<SkillId, { from: number; level: number }>();
  for (const { skill, from, level } of [...previous.levels, ...next.levels]) {
    const seen = levels.get(skill);
    levels.set(skill, {
      from: Math.min(from, seen?.from ?? from),
      level: Math.max(level, seen?.level ?? level),
    });
  }
  return {
    id: next.id,
    steps: previous.steps + next.steps,
    actions: previous.actions + next.actions,
    xp: [...xp].map(([skill, amount]) => ({ skill, amount })),
    levels: [...levels].map(([skill, { from, level }]) => ({ skill, from, level })),
    gained: mergeStacks(previous.gained, next.gained),
    used: mergeStacks(previous.used, next.used),
    coins: previous.coins + next.coins,
    arrived: next.arrived ?? previous.arrived,
    stopped: next.stopped ?? previous.stopped,
    skins: [...new Set([...previous.skins, ...next.skins])],
    quest: next.quest ?? previous.quest,
    opened: previous.opened + next.opened,
    walked: previous.walked || next.walked,
  };
}

function isMilestone(report: Report): boolean {
  return (
    // Agility levels on nearly every walk early on; alone it is a toast, not a modal.
    report.levels.some((entry) => entry.skill !== 'agility') ||
    report.skins.length > 0 ||
    report.quest !== null ||
    report.arrived !== null ||
    report.opened > 0
  );
}

function gainText(report: Report): string | null {
  const parts: string[] = [];
  const xp = report.xp.reduce((sum, entry) => sum + entry.amount, 0);
  if (xp > 0) parts.push(`+${xp.toLocaleString()} xp`);
  const top = report.gained[0];
  if (top) parts.push(`+${itemCount(top.qty, top.item)}`);
  return parts.length ? parts.join(' · ') : null;
}

function noticeFor(action: GameAction, before: Game, after: Game): string | null {
  switch (action.type) {
    case 'mission-claim': {
      const mission = getMission(action.mission);
      if (!mission) return null;
      const items = (mission.items ?? []).map((stack) => ` and ${itemCount(stack.qty, stack.item)}`);
      return `${mission.name} complete. +${mission.coins.toLocaleString()} coins${items.join('')}.`;
    }
    case 'upgrade-bag':
      return `bag upgraded to ${capacityOf(after)} slots.`;
    case 'sell':
      return `sold ${itemCount(action.qty, action.item)} for ${(after.coins - before.coins).toLocaleString()} coins.`;
    case 'buy':
      return `bought ${keyName(action.item)}.`;
    case 'wear':
      return `equipped ${keyName(action.item)}.`;
    case 'unwear':
      return `took off ${keyName(before.gear[action.slot] ?? '')}.`;
    case 'eat':
      return `ate the ${keyName(action.item)}. its bonus lasts ${after.buff?.actions ?? 0} actions.`;
    case 'deposit':
      return `banked ${itemCount(action.qty, action.item)}.`;
    case 'deposit-all':
      return Object.keys(after.inventory).length
        ? 'banked your bag. chests stay in it, ready to open.'
        : 'banked your bag.';
    case 'withdraw':
      return `withdrew ${itemCount(action.qty, action.item)}.`;
    case 'drop':
      return `dropped ${itemCount(action.qty, action.item)}.`;
    case 'quest-start':
      return `quest started: ${getQuest(action.quest)?.name ?? action.quest}.`;
    default:
      return null;
  }
}

export function reduceSession(state: Session, event: SessionAction): Session {
  if (event.type === 'restore')
    return { ...createSession(event.game), notice: state.notice?.kind === 'error' ? state.notice : null };
  if (event.type === 'notice')
    return state.notice?.kind === 'error'
      ? state
      : { ...state, notice: { kind: 'status', message: event.message } };
  if (event.type === 'save-failed') return { ...state, notice: { kind: 'error', message: event.message } };
  if (event.type === 'save-succeeded')
    return state.notice?.kind === 'error' ? { ...state, notice: null } : state;
  if (event.type === 'dismiss-notice')
    return !state.notice || (event.notice && event.notice !== state.notice)
      ? state
      : { ...state, notice: null };
  if (event.type === 'dismiss-reward')
    return { ...state, reward: null, restoreRewardFocus: event.restoreFocus ?? true };
  if (event.type === 'dismiss-gain') return state.gain?.id === event.id ? { ...state, gain: null } : state;

  const game = updateGame(state.game, event.action);
  if (game === state.game) return state;
  const revision = state.revision + 1;
  const stepUpdate =
    event.action.type === 'add-steps' ||
    event.action.type === 'sync-steps' ||
    event.action.type === 'health-sync';
  const report = diffReport(revision, state.game, game, stepUpdate);
  let reward = state.reward;
  let gain = state.gain;
  let notice = state.notice?.kind === 'error' ? state.notice : null;
  // A small demo walk only flashes a gain; real syncs and milestones open the full loot report.
  const quiet = stepUpdate && event.demo && !isMilestone(report) && !report.stopped;
  const worthReporting = report.actions > 0 || isMilestone(report) || report.stopped !== null;
  const quietAction = [
    'mission-claim',
    'upgrade-bag',
    'sell',
    'buy',
    'wear',
    'unwear',
    'eat',
    'deposit',
    'deposit-all',
    'withdraw',
    'drop',
  ];
  if (worthReporting && !quiet && !quietAction.includes(event.action.type)) {
    reward = state.reward ? mergeReports(state.reward, report) : report;
    gain = null;
  } else if (quiet) {
    const text = gainText(report);
    gain = text ? { id: revision, text } : null;
  }
  const message = noticeFor(event.action, state.game, game);
  if (message && notice?.kind !== 'error') notice = { kind: 'status', message };
  return { ...state, game, revision, reward, gain, notice };
}
