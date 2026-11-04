// Guidance: what to do next, where an item comes from, and what a level-up opened.
import {
  ACTIVITIES,
  type Activity,
  getActivity,
  getLocation,
  LOCATIONS,
  METAL_STATS,
  type Place,
  QUESTS,
  type Quest,
  type SkillId,
  TOOL_SKILL,
} from './content.ts';
import {
  activityBlocker,
  available,
  canHandIn,
  type Game,
  locationBlocker,
  questBlocker,
  questState,
  route,
  skillLevel,
  stepsPerAction,
} from './game.ts';
import { countOf, keyName } from './items.ts';

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

// Everything you own of an item: the bag plus the bank, wherever you stand.
export function ownedCount(game: Pick<Game, 'inventory' | 'bank'>, item: string): number {
  return countOf(game.inventory, item) + countOf(game.bank, item);
}

// Started quests waiting on this item, with how many each needs.
export function questsNeeding(
  game: Pick<Game, 'quests'>,
  item: string,
): readonly Readonly<{ quest: Quest; qty: number }>[] {
  return QUESTS.filter((quest) => questState(game, quest.id) === 'started').flatMap((quest) =>
    quest.deliver.filter((stack) => stack.item === item).map((stack) => ({ quest, qty: stack.qty })),
  );
}

// The names of towns with a bank or a store, in map order.
export function townsWith(service: 'bank' | 'store'): readonly string[] {
  return LOCATIONS.filter((place) => place[service]).map((place) => place.name);
}

// "bruhbridge", "bruhbridge or blueberry bay", "a, b or c".
export function orList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
}

// The closest bank town by road from where you stand.
export function nearestBank(
  game: Pick<Game, 'location'>,
): Readonly<{ place: Place; distance: number }> | null {
  let best: Readonly<{ place: Place; distance: number }> | null = null;
  for (const place of LOCATIONS) {
    if (!place.bank) continue;
    const path = route(game.location, place.id);
    if (path && (!best || path.distance < best.distance)) best = { place, distance: path.distance };
  }
  return best;
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
      const gathered = quest.deliver.every((stack) => ownedCount(game, stack.item) >= stack.qty);
      const place = getLocation(quest.location);
      if (gathered && place) return { kind: 'travel', place, quest };
    }
    const short = quest.deliver.find((stack) => ownedCount(game, stack.item) < stack.qty);
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

// Where an item comes from, for hints: the nearest open source (the one the next-step button
// walks to), else the easiest maker still locked, else a rare find or a chest.
export type ItemSource =
  | Readonly<{ kind: 'make'; activity: Activity; place: Place; distance: number }>
  | Readonly<{ kind: 'locked'; activity: Activity; places: readonly Place[] }>
  | Readonly<{ kind: 'find'; activity: Activity }>
  | Readonly<{ kind: 'chest' }>;

export function itemSource(game: Game, item: string): ItemSource {
  const open = sourceOf(game, item);
  if (open) return { kind: 'make', ...open };
  const maker = ACTIVITIES.filter((activity) => activity.output.item === item).sort(
    (a, b) => a.level - b.level,
  )[0];
  if (maker)
    return {
      kind: 'locked',
      activity: maker,
      places: LOCATIONS.filter((place) => place.activities.includes(maker.id)),
    };
  const finder = ACTIVITIES.find((activity) => activity.finds?.some((find) => find.item === item));
  return finder ? { kind: 'find', activity: finder } : { kind: 'chest' };
}

export function itemSourceText(source: ItemSource): string {
  if (source.kind === 'chest') return 'found in chests';
  const { activity } = source;
  if (source.kind === 'find') return `a rare find while ${activity.verb}`;
  const from = activity.inputs?.length
    ? ` from ${activity.inputs.map((input) => keyName(input.item)).join(' and ')}`
    : '';
  if (source.kind === 'make')
    return `${activity.verb} ${activity.name}${from} ${source.distance === 0 ? 'here' : `at ${source.place.name}`}`;
  return `${activity.verb} ${activity.name}${from} at ${source.places.map((place) => place.name).join(' or ')} (${activity.skill} ${activity.level})`;
}
