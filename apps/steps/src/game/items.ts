import {
  GEAR_SLOTS,
  type GearSlot,
  getItem,
  type Item,
  type Mod,
  QUALITIES,
  type QualityIndex,
  type SkillId,
  STAT_IDS,
  type StatId,
  stackSize,
  TOOL_KINDS,
  type ToolKind,
} from './content.ts';

// An item key is an item id, plus "@quality" for crafted gear above normal (e.g. "straw-hat@2").
export type Bag = Readonly<Record<string, number>>;

export function itemKey(id: string, quality: QualityIndex = 0): string {
  return quality > 0 ? `${id}@${quality}` : id;
}

export function parseKey(key: string): Readonly<{ id: string; quality: QualityIndex }> {
  const at = key.lastIndexOf('@');
  if (at < 0) return { id: key, quality: 0 };
  const quality = Number(key.slice(at + 1));
  return {
    id: key.slice(0, at),
    quality: quality >= 1 && quality <= 4 && Number.isInteger(quality) ? (quality as QualityIndex) : 0,
  };
}

export function isKnownKey(key: string): boolean {
  const { id, quality } = parseKey(key);
  const item = getItem(id);
  if (!item) return false;
  if (quality > 0 && item.kind !== 'gear' && item.kind !== 'tool') return false;
  return key === itemKey(id, quality);
}

export function keyItem(key: string): Item | undefined {
  return getItem(parseKey(key).id);
}

export function keyName(key: string): string {
  const { id, quality } = parseKey(key);
  const name = getItem(id)?.name ?? id;
  return quality > 0 ? `${QUALITIES[quality].name} ${name}` : name;
}

// Mass nouns and names that already read as plural ("logs", "shears", "boots") keep their form.
const UNCHANGED_PLURALS = new Set([
  'coal',
  'flax',
  'linen',
  'wicker',
  'moonsilk',
  'silkweed',
  'trout',
  'swordfish',
  'sunfish',
  'burnt fish',
  'dragonfruit',
]);

export function pluralName(name: string): string {
  if (name.endsWith('s') || name.endsWith(' ore') || UNCHANGED_PLURALS.has(name)) return name;
  // "message in a bottle" pluralises its head noun.
  const phrase = /^(\S+)( (?:in|of) .+)$/.exec(name);
  if (phrase) return `${pluralName(phrase[1] ?? '')}${phrase[2]}`;
  if (/[^aeiou]y$/.test(name)) return `${name.slice(0, -1)}ies`;
  if (/(ch|sh|x)$/.test(name)) return `${name}es`;
  return `${name}s`;
}

// "1 raw minnow", "98 raw minnows", "40 coal": the one way the game writes an item count.
export function itemCount(qty: number, key: string): string {
  const name = keyName(key);
  return `${qty.toLocaleString()} ${qty === 1 ? name : pluralName(name)}`;
}

export function keyValue(key: string): number {
  const { id, quality } = parseKey(key);
  return Math.round((getItem(id)?.value ?? 0) * QUALITIES[quality].mult);
}

export function keyMods(key: string): readonly Mod[] {
  const { id, quality } = parseKey(key);
  const mods = getItem(id)?.mods ?? [];
  const mult = QUALITIES[quality].mult;
  return mods.map((mod) => ({
    ...mod,
    value: mod.stat === 'slots' ? Math.round(mod.value * mult) : mod.value * mult,
  }));
}

// --- bags ------------------------------------------------------------------------------

export function slotsUsed(bag: Bag): number {
  let used = 0;
  for (const [key, qty] of Object.entries(bag)) {
    const item = keyItem(key);
    if (!item || qty <= 0) continue;
    const size = stackSize(item);
    if (Number.isFinite(size)) used += Math.ceil(qty / size);
  }
  return used;
}

export function fits(bag: Bag, key: string, qty: number, capacity: number): boolean {
  return slotsUsed(add(bag, key, qty)) <= capacity;
}

export function add(bag: Bag, key: string, qty: number): Record<string, number> {
  const next = { ...bag };
  const total = (next[key] ?? 0) + qty;
  if (total > 0) next[key] = total;
  else delete next[key];
  return next;
}

export function countOf(bag: Bag, id: string): number {
  let total = 0;
  for (const [key, qty] of Object.entries(bag)) if (parseKey(key).id === id) total += qty;
  return total;
}

// Removes `qty` of an item id across qualities, lowest quality first. Returns null if short.
export function takeId(bag: Bag, id: string, qty: number): Record<string, number> | null {
  if (countOf(bag, id) < qty) return null;
  const next = { ...bag };
  let left = qty;
  const keys = Object.keys(next)
    .filter((key) => parseKey(key).id === id)
    .sort((a, b) => parseKey(a).quality - parseKey(b).quality);
  for (const key of keys) {
    const use = Math.min(left, next[key] ?? 0);
    const rest = (next[key] ?? 0) - use;
    if (rest > 0) next[key] = rest;
    else delete next[key];
    left -= use;
    if (left === 0) break;
  }
  return next;
}

// --- stats -------------------------------------------------------------------------------

export type Totals = Record<StatId, number>;
export type Loadout = Readonly<{
  gear: Readonly<Partial<Record<GearSlot, string>>>;
  tools: Readonly<Record<ToolKind, string>>;
  buff: Readonly<{ item: string; actions: number }> | null;
}>;
export type ModSource = Readonly<{ source: string; mod: Mod }>;

export function emptyTotals(): Totals {
  return Object.fromEntries(STAT_IDS.map((stat) => [stat, 0])) as Totals;
}

export function modSources(loadout: Loadout): readonly ModSource[] {
  const sources: ModSource[] = [];
  for (const slot of GEAR_SLOTS) {
    const key = loadout.gear[slot];
    if (key) for (const mod of keyMods(key)) sources.push({ source: key, mod });
  }
  for (const kind of TOOL_KINDS)
    for (const mod of keyMods(loadout.tools[kind])) sources.push({ source: loadout.tools[kind], mod });
  if (loadout.buff)
    for (const mod of getItem(loadout.buff.item)?.buff?.mods ?? [])
      sources.push({ source: loadout.buff.item, mod });
  return sources;
}

// Totals for one skill (skill-specific mods only count while training that skill).
export function totalsFor(loadout: Loadout, skill: SkillId | null): Totals {
  const totals = emptyTotals();
  for (const { mod } of modSources(loadout))
    if (!mod.skill || mod.skill === skill) totals[mod.stat] += mod.value;
  return totals;
}

// The bag's size before packs and upgrades; `capacityOf` in game.ts adds those.
export const BASE_SLOTS = 28;

export function formatMod(mod: Mod): string {
  const value = mod.stat === 'slots' ? `+${mod.value}` : `+${Math.round(mod.value * 1000) / 10}%`;
  return `${value} ${statLabel(mod.stat)}${mod.skill ? ` (${mod.skill})` : ''}`;
}

const LABELS: Readonly<Record<StatId, string>> = {
  // One plain name per stat, used everywhere a stat is shown.
  efficiency: 'work speed',
  doubleAction: 'extra action chance',
  doubleResult: 'double loot chance',
  preserve: 'save materials',
  xp: 'bonus xp',
  find: 'rare find chance',
  chest: 'chest chance',
  travel: 'travel speed',
  quality: 'craft quality',
  slots: 'bag slots',
};
export function statLabel(stat: StatId): string {
  return LABELS[stat];
}
