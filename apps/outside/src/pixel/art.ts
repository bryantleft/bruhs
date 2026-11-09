// Every sprite in the game, put together from the drawing files in ./sprites. Pure data (no
// React Native imports) so tests, the landing page and scripts can read every grid.
import type { GearSlot, SkillId } from '../game/content.ts';
import { palette } from '../theme/palette.ts';
import { type Art, INK, tint } from './sprites/core.ts';
import { FISH, FISH_ITEMS } from './sprites/fish.ts';
import { BOOT, CAPE, GEAR_ITEMS, GLOVES, HAT, PACK, TROUSERS, VEST } from './sprites/gear.ts';
import { ANVIL, HOUSE, MAP, POT, SCROLL, STATS, STEPS } from './sprites/icons.ts';
import { AMULET, CHEST, COINS, MATERIAL_ITEMS, RING, SPOOL } from './sprites/materials.ts';
import { NATURE_ITEMS, RAMBUTAN } from './sprites/nature.ts';
import {
  AXE,
  BAR,
  HARPOON,
  LOG,
  METAL_COLORS,
  ORE,
  PICKAXE,
  RESOURCE_ITEMS,
  SHEARS,
} from './sprites/resources.ts';
import { BOAT, BUSH, CACTUS, COTTAGE, PINE, REEDS, ROCK, SCENE_ANVIL, TREE } from './sprites/scenery.ts';

export { bruhArt } from './sprites/bruh.ts';
export { ANVIL, type Art, BOAT, BUSH, CACTUS, HOUSE, INK, PINE, REEDS, ROCK, TREE, tint };

const ITEM_ART: Readonly<Record<string, Art>> = {
  ...RESOURCE_ITEMS,
  ...FISH_ITEMS,
  ...NATURE_ITEMS,
  ...MATERIAL_ITEMS,
  ...GEAR_ITEMS,
};

// An item's sprite. An id with no drawing shows coins; a test keeps every real item drawn.
export function itemArt(id: string): Art {
  return ITEM_ART[id] ?? COINS;
}

// A faint silhouette for empty equipment slots.
const ghostCache = new WeakMap<Art, Art>();
export function ghost(source: Art): Art {
  const cached = ghostCache.get(source);
  if (cached) return cached;
  const colors = Object.fromEntries(Object.keys(source.colors).map((key) => [key, palette['longan-700']]));
  const result = { ...source, colors: { ...colors, k: palette['longan-800'] } };
  ghostCache.set(source, result);
  return result;
}

export const SLOT_ART: Readonly<Record<GearSlot, Art>> = {
  head: HAT,
  cape: CAPE,
  neck: AMULET,
  back: PACK,
  chest: VEST,
  hands: GLOVES,
  legs: TROUSERS,
  feet: BOOT,
  ring1: RING,
  ring2: RING,
};

export const SKILL_ART: Readonly<Record<SkillId, Art>> = {
  woodcutting: tint(AXE, METAL_COLORS.iron),
  mining: tint(PICKAXE, METAL_COLORS.bronze),
  fishing: FISH,
  foraging: RAMBUTAN,
  smithing: ANVIL,
  cooking: POT,
  crafting: SPOOL,
  agility: BOOT,
};

export const UI_ART = {
  bag: PACK,
  treasury: CHEST,
  world: HOUSE,
  map: MAP,
  skills: STATS,
  bank: CHEST,
  quests: SCROLL,
  steps: STEPS,
  coins: COINS,
} as const;

// Every named drawing and every item, for tests and contact sheets.
export const ALL_ART: Readonly<Record<string, Art>> = {
  log: LOG,
  ore: ORE,
  bar: BAR,
  fish: FISH,
  axe: AXE,
  pickaxe: PICKAXE,
  harpoon: HARPOON,
  shears: SHEARS,
  ...ITEM_ART,
  anvil: ANVIL,
  pot: POT,
  boot: BOOT,
  chest: CHEST,
  scroll: SCROLL,
  map: MAP,
  house: HOUSE,
  stats: STATS,
  steps: STEPS,
  tree: TREE,
  pine: PINE,
  rock: ROCK,
  bush: BUSH,
  cactus: CACTUS,
  reeds: REEDS,
  boat: BOAT,
  cottage: COTTAGE,
  'scene-anvil': SCENE_ANVIL,
};
