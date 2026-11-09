// Static world data for the fruitlands. Ids are part of the save format: never rename them.

export const SKILLS = [
  { id: 'woodcutting', name: 'woodcutting', blurb: 'chop trees for logs.' },
  { id: 'mining', name: 'mining', blurb: 'mine rocks for ore, coal and gems.' },
  { id: 'fishing', name: 'fishing', blurb: 'catch fish in lakes, marshes and the sea.' },
  { id: 'foraging', name: 'foraging', blurb: 'pick wild fruit, flax and reeds.' },
  { id: 'smithing', name: 'smithing', blurb: 'smelt bars and forge tools and armour.' },
  { id: 'cooking', name: 'cooking', blurb: 'cook fish into food bonuses. higher levels burn less.' },
  { id: 'crafting', name: 'crafting', blurb: 'spin linen, weave wicker, sew gear and set jewellery.' },
  { id: 'agility', name: 'agility', blurb: 'every step trains it. shortens travel.' },
] as const;
export type SkillId = (typeof SKILLS)[number]['id'];
export const SKILL_IDS: readonly SkillId[] = SKILLS.map((skill) => skill.id);

// --- stats ----------------------------------------------------------------------

export const STATS = {
  efficiency: { name: 'work efficiency', blurb: 'more work per step: fewer steps per action.' },
  doubleAction: { name: 'double action', blurb: 'chance an action pays out twice: xp and loot.' },
  doubleResult: { name: 'double result', blurb: 'chance the loot roll happens twice.' },
  preserve: { name: 'save materials', blurb: 'chance a recipe keeps its inputs.' },
  xp: { name: 'bonus xp', blurb: 'extra experience on every action.' },
  find: { name: 'find chance', blurb: 'better odds of gems, seeds and rare finds.' },
  chest: { name: 'chest find', blurb: 'better odds of finding chests.' },
  travel: { name: 'travel speed', blurb: 'fewer steps on the road.' },
  quality: { name: 'craft quality', blurb: 'better odds of fine crafted gear.' },
  slots: { name: 'bag slots', blurb: 'extra space in your bag.' },
} as const;
export type StatId = keyof typeof STATS;
export const STAT_IDS = Object.keys(STATS) as StatId[];
// A modifier applies everywhere, or only while training one skill.
export type Mod = Readonly<{ stat: StatId; value: number; skill?: SkillId }>;

// --- tools ----------------------------------------------------------------------

export const METALS = ['bronze', 'iron', 'steel', 'mithril', 'moonsteel', 'sunsteel'] as const;
export type Metal = (typeof METALS)[number];
export const TOOL_KINDS = ['axe', 'pickaxe', 'harpoon', 'shears'] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];
export const TOOL_SKILL: Readonly<Record<ToolKind, SkillId>> = {
  axe: 'woodcutting',
  pickaxe: 'mining',
  harpoon: 'fishing',
  shears: 'foraging',
};
export const METAL_STATS: Readonly<
  Record<Metal, Readonly<{ efficiency: number; level: number; value: number }>>
> = {
  bronze: { efficiency: 0.05, level: 1, value: 15 },
  iron: { efficiency: 0.15, level: 10, value: 60 },
  steel: { efficiency: 0.25, level: 20, value: 150 },
  mithril: { efficiency: 0.4, level: 40, value: 400 },
  moonsteel: { efficiency: 0.55, level: 60, value: 900 },
  sunsteel: { efficiency: 0.7, level: 80, value: 2_000 },
};

export function toolId(metal: Metal, kind: ToolKind): string {
  return `${metal}-${kind}`;
}

// --- gear ------------------------------------------------------------------------

export const GEAR_SLOTS = [
  'head',
  'cape',
  'neck',
  'back',
  'chest',
  'hands',
  'legs',
  'feet',
  'ring1',
  'ring2',
] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];
export type ItemSlot = Exclude<GearSlot, 'ring1' | 'ring2'> | 'ring';
export function slotFits(slot: GearSlot, itemSlot: ItemSlot): boolean {
  return itemSlot === 'ring' ? slot === 'ring1' || slot === 'ring2' : slot === itemSlot;
}

// Crafted gear rolls a quality. Better quality multiplies every stat on the piece.
export const QUALITIES = [
  { id: 'normal', name: 'normal', mult: 1 },
  { id: 'good', name: 'good', mult: 1.25 },
  { id: 'great', name: 'great', mult: 1.5 },
  { id: 'excellent', name: 'excellent', mult: 1.75 },
  { id: 'perfect', name: 'perfect', mult: 2 },
] as const;
export type QualityIndex = 0 | 1 | 2 | 3 | 4;

// --- items -------------------------------------------------------------------------

export type ItemKind =
  | 'log'
  | 'ore'
  | 'bar'
  | 'raw'
  | 'food'
  | 'junk'
  | 'fruit'
  | 'fiber'
  | 'cloth'
  | 'gem'
  | 'valuable'
  | 'chest'
  | 'tool'
  | 'gear';
export type Stack = Readonly<{ item: string; qty: number }>;
export type LootEntry = Readonly<{ item: string; min: number; max: number; weight: number }>;
export type Item = Readonly<{
  id: string;
  name: string;
  kind: ItemKind;
  value: number;
  blurb: string;
  tool?: Readonly<{ kind: ToolKind; metal: Metal }>;
  slot?: ItemSlot;
  mods?: readonly Mod[];
  // Eating gives a buff for a number of actions. One buff at a time.
  buff?: Readonly<{ mods: readonly Mod[]; actions: number }>;
  // Chests: coins plus one weighted roll (and a second roll a quarter of the time).
  loot?: Readonly<{ coins: readonly [number, number]; table: readonly LootEntry[] }>;
}>;

const MATERIAL_KINDS: ReadonlySet<ItemKind> = new Set([
  'log',
  'ore',
  'bar',
  'raw',
  'fruit',
  'fiber',
  'cloth',
  'gem',
  'junk',
]);
export function stackSize(item: Item): number {
  if (item.kind === 'chest') return Number.POSITIVE_INFINITY;
  return MATERIAL_KINDS.has(item.kind) ? 25 : 10;
}

const BASE_ITEMS: readonly Item[] = [
  { id: 'pandan-logs', name: 'pandan logs', kind: 'log', value: 2, blurb: 'fragrant and green.' },
  { id: 'longan-logs', name: 'longan logs', kind: 'log', value: 8, blurb: 'sturdy lakeside wood.' },
  { id: 'mahogany-logs', name: 'mahogany logs', kind: 'log', value: 20, blurb: 'dense marsh timber.' },
  { id: 'dragonwood-logs', name: 'dragonwood logs', kind: 'log', value: 45, blurb: 'warm to the touch.' },
  {
    id: 'moonwood-logs',
    name: 'moonwood logs',
    kind: 'log',
    value: 90,
    blurb: 'pale bark that glows at night.',
  },
  {
    id: 'starwood-logs',
    name: 'starwood logs',
    kind: 'log',
    value: 160,
    blurb: 'fell from the sky, then grew.',
  },
  { id: 'copper-ore', name: 'copper ore', kind: 'ore', value: 3, blurb: 'half of a bronze bar.' },
  { id: 'tin-ore', name: 'tin ore', kind: 'ore', value: 3, blurb: 'the other half.' },
  { id: 'iron-ore', name: 'iron ore', kind: 'ore', value: 9, blurb: 'heavy and reliable.' },
  { id: 'coal', name: 'coal', kind: 'ore', value: 15, blurb: 'fuel for steel and mithril.' },
  { id: 'gold-ore', name: 'gold ore', kind: 'ore', value: 30, blurb: 'jewellers pay well for this.' },
  { id: 'mithril-ore', name: 'mithril ore', kind: 'ore', value: 40, blurb: 'faintly blue. faintly humming.' },
  { id: 'moonstone-ore', name: 'moonstone ore', kind: 'ore', value: 75, blurb: 'cold, silver and quiet.' },
  { id: 'sunstone-ore', name: 'sunstone ore', kind: 'ore', value: 130, blurb: 'too hot to hold for long.' },
  { id: 'bronze-bar', name: 'bronze bar', kind: 'bar', value: 10, blurb: 'copper and tin, together.' },
  { id: 'iron-bar', name: 'iron bar', kind: 'bar', value: 22, blurb: 'ready for the anvil.' },
  { id: 'steel-bar', name: 'steel bar', kind: 'bar', value: 55, blurb: 'iron, but serious.' },
  { id: 'gold-bar', name: 'gold bar', kind: 'bar', value: 70, blurb: 'soft, shiny, perfect for rings.' },
  { id: 'mithril-bar', name: 'mithril bar', kind: 'bar', value: 120, blurb: 'light as a feather.' },
  { id: 'moonsteel-bar', name: 'moonsteel bar', kind: 'bar', value: 230, blurb: 'it rings like a bell.' },
  { id: 'sunsteel-bar', name: 'sunsteel bar', kind: 'bar', value: 400, blurb: 'still warm from the crater.' },
  { id: 'raw-minnow', name: 'raw minnow', kind: 'raw', value: 2, blurb: 'tiny. wriggly.' },
  { id: 'raw-trout', name: 'raw trout', kind: 'raw', value: 8, blurb: 'a lake classic.' },
  { id: 'raw-eel', name: 'raw eel', kind: 'raw', value: 20, blurb: 'slippery marsh catch.' },
  { id: 'raw-swordfish', name: 'raw swordfish', kind: 'raw', value: 45, blurb: 'pointy end first.' },
  { id: 'raw-moonray', name: 'raw moonray', kind: 'raw', value: 80, blurb: 'glides through the grove pond.' },
  {
    id: 'raw-sunfish',
    name: 'raw sunfish',
    kind: 'raw',
    value: 140,
    blurb: 'lives in the crater’s hot spring.',
  },
  {
    id: 'minnow',
    name: 'minnow',
    kind: 'food',
    value: 5,
    blurb: 'a crispy snack.',
    buff: { mods: [{ stat: 'efficiency', value: 0.04 }], actions: 40 },
  },
  {
    id: 'trout',
    name: 'trout',
    kind: 'food',
    value: 16,
    blurb: 'flaky and golden.',
    buff: { mods: [{ stat: 'efficiency', value: 0.07 }], actions: 60 },
  },
  {
    id: 'eel',
    name: 'eel',
    kind: 'food',
    value: 38,
    blurb: 'smoky marsh treat.',
    buff: { mods: [{ stat: 'doubleAction', value: 0.05 }], actions: 80 },
  },
  {
    id: 'swordfish',
    name: 'swordfish',
    kind: 'food',
    value: 80,
    blurb: 'a feast for a hero.',
    buff: {
      mods: [
        { stat: 'efficiency', value: 0.1 },
        { stat: 'doubleAction', value: 0.03 },
      ],
      actions: 120,
    },
  },
  {
    id: 'moonray',
    name: 'moonray',
    kind: 'food',
    value: 150,
    blurb: 'silvery and light. saves materials.',
    buff: {
      mods: [
        { stat: 'efficiency', value: 0.12 },
        { stat: 'preserve', value: 0.05 },
      ],
      actions: 150,
    },
  },
  {
    id: 'sunfish',
    name: 'sunfish',
    kind: 'food',
    value: 260,
    blurb: 'a legendary meal.',
    buff: {
      mods: [
        { stat: 'efficiency', value: 0.15 },
        { stat: 'doubleAction', value: 0.05 },
      ],
      actions: 200,
    },
  },
  { id: 'burnt-fish', name: 'burnt fish', kind: 'junk', value: 1, blurb: 'oops.' },
  {
    id: 'rambutan',
    name: 'rambutan',
    kind: 'fruit',
    value: 3,
    blurb: 'hairy outside, sweet inside. eat for bonus xp.',
    buff: { mods: [{ stat: 'xp', value: 0.04 }], actions: 30 },
  },
  {
    id: 'mangosteen',
    name: 'mangosteen',
    kind: 'fruit',
    value: 10,
    blurb: 'queen of fruits. eat to spot rare finds.',
    buff: { mods: [{ stat: 'find', value: 0.15 }], actions: 50 },
  },
  {
    id: 'durian',
    name: 'durian',
    kind: 'fruit',
    value: 24,
    blurb: 'smells like adventure. eat for double results.',
    buff: { mods: [{ stat: 'doubleResult', value: 0.06 }], actions: 60 },
  },
  {
    id: 'dragonfruit',
    name: 'dragonfruit',
    kind: 'fruit',
    value: 50,
    blurb: 'no dragons were harmed. eat for lots of xp.',
    buff: { mods: [{ stat: 'xp', value: 0.1 }], actions: 100 },
  },
  {
    id: 'persimmon',
    name: 'persimmon',
    kind: 'fruit',
    value: 80,
    blurb: 'sweet once it softens. eat to sniff out chests.',
    buff: { mods: [{ stat: 'chest', value: 0.3 }], actions: 80 },
  },
  {
    id: 'lychee',
    name: 'lychee',
    kind: 'fruit',
    value: 140,
    blurb: 'a pearl in a shell. eat for xp and double results.',
    buff: {
      mods: [
        { stat: 'xp', value: 0.15 },
        { stat: 'doubleResult', value: 0.04 },
      ],
      actions: 120,
    },
  },
  { id: 'flax', name: 'flax', kind: 'fiber', value: 2, blurb: 'spin it into linen.' },
  { id: 'reeds', name: 'reeds', kind: 'fiber', value: 6, blurb: 'weave them into wicker.' },
  {
    id: 'silkweed',
    name: 'silkweed',
    kind: 'fiber',
    value: 25,
    blurb: 'moonlit threads. spin it into moonsilk.',
  },
  { id: 'linen', name: 'linen', kind: 'cloth', value: 7, blurb: 'soft cloth for clothing.' },
  { id: 'wicker', name: 'wicker', kind: 'cloth', value: 22, blurb: 'strong and springy. makes great packs.' },
  {
    id: 'moonsilk',
    name: 'moonsilk',
    kind: 'cloth',
    value: 90,
    blurb: 'light as moonlight, twice as strong.',
  },
  { id: 'sapphire', name: 'sapphire', kind: 'gem', value: 160, blurb: 'a blue gem from the rock.' },
  { id: 'emerald', name: 'emerald', kind: 'gem', value: 300, blurb: 'a green gem. rarer than sapphire.' },
  { id: 'ruby', name: 'ruby', kind: 'gem', value: 550, blurb: 'a deep red gem.' },
  { id: 'diamond', name: 'diamond', kind: 'gem', value: 1_200, blurb: 'the rarest gem in the fruitlands.' },
  { id: 'golden-seed', name: 'golden seed', kind: 'valuable', value: 150, blurb: 'shiny. probably magic.' },
  {
    id: 'bird-nest',
    name: 'bird nest',
    kind: 'chest',
    value: 40,
    blurb: 'fell out of a tree. there is something inside.',
    loot: {
      coins: [10, 40],
      table: [
        { item: 'rambutan', min: 2, max: 5, weight: 30 },
        { item: 'mangosteen', min: 1, max: 3, weight: 20 },
        { item: 'flax', min: 5, max: 10, weight: 20 },
        { item: 'golden-seed', min: 1, max: 1, weight: 10 },
        { item: 'sapphire', min: 1, max: 1, weight: 6 },
        { item: 'emerald', min: 1, max: 1, weight: 3 },
        { item: 'lumberjack-cap', min: 1, max: 1, weight: 1 },
        { item: 'four-leaf-charm', min: 1, max: 1, weight: 0.5 },
      ],
    },
  },
  {
    id: 'miner-crate',
    name: 'miner’s crate',
    kind: 'chest',
    value: 60,
    blurb: 'left behind in the tunnels.',
    loot: {
      coins: [20, 60],
      table: [
        { item: 'copper-ore', min: 5, max: 10, weight: 15 },
        { item: 'tin-ore', min: 5, max: 10, weight: 15 },
        { item: 'iron-ore', min: 3, max: 8, weight: 20 },
        { item: 'coal', min: 3, max: 6, weight: 15 },
        { item: 'gold-ore', min: 1, max: 3, weight: 10 },
        { item: 'sapphire', min: 1, max: 1, weight: 8 },
        { item: 'emerald', min: 1, max: 1, weight: 5 },
        { item: 'ruby', min: 1, max: 1, weight: 2 },
        { item: 'diamond', min: 1, max: 1, weight: 0.5 },
        { item: 'treasure-ring', min: 1, max: 1, weight: 0.3 },
      ],
    },
  },
  {
    id: 'bottle',
    name: 'message in a bottle',
    kind: 'chest',
    value: 80,
    blurb: 'it says “bruh”. and there is more.',
    loot: {
      coins: [30, 100],
      table: [
        { item: 'raw-trout', min: 2, max: 5, weight: 25 },
        { item: 'raw-eel', min: 1, max: 3, weight: 15 },
        { item: 'golden-seed', min: 1, max: 1, weight: 10 },
        { item: 'sapphire', min: 1, max: 1, weight: 8 },
        { item: 'angler-hat', min: 1, max: 1, weight: 1.5 },
        { item: 'treasure-ring', min: 1, max: 1, weight: 0.5 },
      ],
    },
  },
  {
    id: 'adventurer-chest',
    name: 'adventurer’s chest',
    kind: 'chest',
    value: 250,
    blurb: 'a lost adventurer’s stash. could be anything.',
    loot: {
      coins: [100, 400],
      table: [
        { item: 'dragonfruit', min: 2, max: 4, weight: 15 },
        { item: 'emerald', min: 1, max: 1, weight: 10 },
        { item: 'ruby', min: 1, max: 1, weight: 6 },
        { item: 'diamond', min: 1, max: 1, weight: 2 },
        { item: 'four-leaf-charm', min: 1, max: 1, weight: 3 },
        { item: 'seven-league-boots', min: 1, max: 1, weight: 2 },
        { item: 'treasure-ring', min: 1, max: 1, weight: 2 },
        { item: 'bruh-cape', min: 1, max: 1, weight: 0.5 },
      ],
    },
  },
];

const TOOL_NAMES: Readonly<Record<ToolKind, string>> = {
  axe: 'axe',
  pickaxe: 'pickaxe',
  harpoon: 'harpoon',
  shears: 'shears',
};

const TOOL_ITEMS: readonly Item[] = METALS.flatMap((metal) =>
  TOOL_KINDS.map((kind) => ({
    id: toolId(metal, kind),
    name: `${metal} ${TOOL_NAMES[kind]}`,
    kind: 'tool' as const,
    value: METAL_STATS[metal].value,
    blurb: `${TOOL_SKILL[kind]} tool. needs ${TOOL_SKILL[kind]} ${METAL_STATS[metal].level} to wield.`,
    tool: { kind, metal },
    mods: [{ stat: 'efficiency' as const, value: METAL_STATS[metal].efficiency, skill: TOOL_SKILL[kind] }],
  })),
);

type GearDef = Readonly<{
  id: string;
  name: string;
  slot: ItemSlot;
  value: number;
  blurb: string;
  mods: readonly Mod[];
  // Crafted gear: who makes it, at what level, from what.
  craft?: Readonly<{ skill: SkillId; level: number; inputs: readonly Stack[] }>;
}>;

export const GEAR: readonly GearDef[] = [
  {
    id: 'straw-hat',
    name: 'straw hat',
    slot: 'head',
    value: 20,
    blurb: 'keeps the sun off while you pick.',
    mods: [{ stat: 'efficiency', value: 0.05, skill: 'foraging' }],
    craft: { skill: 'crafting', level: 1, inputs: [{ item: 'linen', qty: 2 }] },
  },
  {
    id: 'linen-gloves',
    name: 'linen gloves',
    slot: 'hands',
    value: 20,
    blurb: 'gentle hands find more fruit.',
    mods: [{ stat: 'doubleResult', value: 0.04, skill: 'foraging' }],
    craft: { skill: 'crafting', level: 4, inputs: [{ item: 'linen', qty: 2 }] },
  },
  {
    id: 'woodsman-trousers',
    name: 'woodsman trousers',
    slot: 'legs',
    value: 35,
    blurb: 'reinforced knees for kneeling at stumps.',
    mods: [{ stat: 'efficiency', value: 0.05, skill: 'woodcutting' }],
    craft: { skill: 'crafting', level: 8, inputs: [{ item: 'linen', qty: 4 }] },
  },
  {
    id: 'travel-boots',
    name: 'travel boots',
    slot: 'feet',
    value: 40,
    blurb: 'comfortable for long roads.',
    mods: [{ stat: 'travel', value: 0.08 }],
    craft: {
      skill: 'crafting',
      level: 12,
      inputs: [
        { item: 'linen', qty: 3 },
        { item: 'pandan-logs', qty: 2 },
      ],
    },
  },
  {
    id: 'fisher-vest',
    name: 'fisher’s vest',
    slot: 'chest',
    value: 60,
    blurb: 'pockets for hooks, line and snacks.',
    mods: [
      { stat: 'efficiency', value: 0.05, skill: 'fishing' },
      { stat: 'doubleAction', value: 0.02, skill: 'fishing' },
    ],
    craft: { skill: 'crafting', level: 18, inputs: [{ item: 'linen', qty: 5 }] },
  },
  {
    id: 'wicker-pack',
    name: 'wicker pack',
    slot: 'back',
    value: 140,
    blurb: 'a sturdy basket for your back.',
    mods: [{ stat: 'slots', value: 4 }],
    craft: { skill: 'crafting', level: 22, inputs: [{ item: 'wicker', qty: 6 }] },
  },
  {
    id: 'chef-hat',
    name: 'chef’s hat',
    slot: 'head',
    value: 45,
    blurb: 'tall, white, inspiring.',
    mods: [{ stat: 'doubleResult', value: 0.06, skill: 'cooking' }],
    craft: { skill: 'crafting', level: 28, inputs: [{ item: 'linen', qty: 4 }] },
  },
  {
    id: 'explorer-cape',
    name: 'explorer’s cape',
    slot: 'cape',
    value: 220,
    blurb: 'flaps heroically in the wind.',
    mods: [{ stat: 'xp', value: 0.05 }],
    craft: {
      skill: 'crafting',
      level: 35,
      inputs: [
        { item: 'linen', qty: 8 },
        { item: 'wicker', qty: 4 },
      ],
    },
  },
  {
    id: 'forager-pack',
    name: 'forager’s pack',
    slot: 'back',
    value: 380,
    blurb: 'a big pack with a fruit pocket.',
    mods: [
      { stat: 'slots', value: 8 },
      { stat: 'find', value: 0.05, skill: 'foraging' },
    ],
    craft: {
      skill: 'crafting',
      level: 45,
      inputs: [
        { item: 'wicker', qty: 10 },
        { item: 'linen', qty: 6 },
      ],
    },
  },
  {
    id: 'gold-ring',
    name: 'gold ring',
    slot: 'ring',
    value: 100,
    blurb: 'plain, but lucky.',
    mods: [{ stat: 'doubleResult', value: 0.02 }],
    craft: { skill: 'crafting', level: 20, inputs: [{ item: 'gold-bar', qty: 1 }] },
  },
  {
    id: 'sapphire-ring',
    name: 'sapphire ring',
    slot: 'ring',
    value: 300,
    blurb: 'a sparkle that catches rare things.',
    mods: [{ stat: 'find', value: 0.08 }],
    craft: {
      skill: 'crafting',
      level: 30,
      inputs: [
        { item: 'gold-bar', qty: 1 },
        { item: 'sapphire', qty: 1 },
      ],
    },
  },
  {
    id: 'emerald-ring',
    name: 'emerald ring',
    slot: 'ring',
    value: 450,
    blurb: 'time feels a little slower.',
    mods: [{ stat: 'doubleAction', value: 0.03 }],
    craft: {
      skill: 'crafting',
      level: 42,
      inputs: [
        { item: 'gold-bar', qty: 1 },
        { item: 'emerald', qty: 1 },
      ],
    },
  },
  {
    id: 'ruby-ring',
    name: 'ruby ring',
    slot: 'ring',
    value: 700,
    blurb: 'warm, like a good idea.',
    mods: [{ stat: 'xp', value: 0.06 }],
    craft: {
      skill: 'crafting',
      level: 55,
      inputs: [
        { item: 'gold-bar', qty: 1 },
        { item: 'ruby', qty: 1 },
      ],
    },
  },
  {
    id: 'sapphire-amulet',
    name: 'sapphire amulet',
    slot: 'neck',
    value: 420,
    blurb: 'focus, on a chain.',
    mods: [{ stat: 'efficiency', value: 0.04 }],
    craft: {
      skill: 'crafting',
      level: 34,
      inputs: [
        { item: 'gold-bar', qty: 2 },
        { item: 'sapphire', qty: 1 },
      ],
    },
  },
  {
    id: 'emerald-amulet',
    name: 'emerald amulet',
    slot: 'neck',
    value: 600,
    blurb: 'nothing goes to waste.',
    mods: [{ stat: 'preserve', value: 0.08 }],
    craft: {
      skill: 'crafting',
      level: 48,
      inputs: [
        { item: 'gold-bar', qty: 2 },
        { item: 'emerald', qty: 1 },
      ],
    },
  },
  {
    id: 'ruby-amulet',
    name: 'ruby amulet',
    slot: 'neck',
    value: 900,
    blurb: 'treasure seems to find you.',
    mods: [{ stat: 'chest', value: 0.25 }],
    craft: {
      skill: 'crafting',
      level: 62,
      inputs: [
        { item: 'gold-bar', qty: 2 },
        { item: 'ruby', qty: 1 },
      ],
    },
  },
  {
    id: 'diamond-amulet',
    name: 'diamond amulet',
    slot: 'neck',
    value: 1_800,
    blurb: 'the mark of a master crafter.',
    mods: [{ stat: 'efficiency', value: 0.08 }],
    craft: {
      skill: 'crafting',
      level: 75,
      inputs: [
        { item: 'gold-bar', qty: 2 },
        { item: 'diamond', qty: 1 },
      ],
    },
  },
  {
    id: 'mining-helmet',
    name: 'mining helmet',
    slot: 'head',
    value: 80,
    blurb: 'a lamp for dark tunnels.',
    mods: [{ stat: 'efficiency', value: 0.08, skill: 'mining' }],
    craft: { skill: 'smithing', level: 12, inputs: [{ item: 'iron-bar', qty: 3 }] },
  },
  {
    id: 'forge-apron',
    name: 'forge apron',
    slot: 'chest',
    value: 90,
    blurb: 'singed, but proud.',
    mods: [{ stat: 'preserve', value: 0.08, skill: 'smithing' }],
    craft: {
      skill: 'smithing',
      level: 18,
      inputs: [
        { item: 'iron-bar', qty: 2 },
        { item: 'linen', qty: 3 },
      ],
    },
  },
  {
    id: 'steel-gauntlets',
    name: 'steel gauntlets',
    slot: 'hands',
    value: 200,
    blurb: 'for heavy lifting and heavy hitting.',
    mods: [
      { stat: 'efficiency', value: 0.05, skill: 'mining' },
      { stat: 'efficiency', value: 0.05, skill: 'smithing' },
    ],
    craft: { skill: 'smithing', level: 32, inputs: [{ item: 'steel-bar', qty: 3 }] },
  },
  {
    id: 'mithril-boots',
    name: 'mithril boots',
    slot: 'feet',
    value: 450,
    blurb: 'light enough to run in.',
    mods: [
      { stat: 'travel', value: 0.12 },
      { stat: 'efficiency', value: 0.03 },
    ],
    craft: { skill: 'smithing', level: 52, inputs: [{ item: 'mithril-bar', qty: 3 }] },
  },
  {
    id: 'moonsilk-robe',
    name: 'moonsilk robe',
    slot: 'chest',
    value: 900,
    blurb: 'shimmers when you learn something.',
    mods: [
      { stat: 'xp', value: 0.06 },
      { stat: 'find', value: 0.1 },
    ],
    craft: { skill: 'crafting', level: 64, inputs: [{ item: 'moonsilk', qty: 5 }] },
  },
  {
    id: 'moonsilk-hood',
    name: 'moonsilk hood',
    slot: 'head',
    value: 1_100,
    blurb: 'see buried things by moonlight.',
    mods: [
      { stat: 'chest', value: 0.25 },
      { stat: 'xp', value: 0.03 },
    ],
    craft: {
      skill: 'crafting',
      level: 68,
      inputs: [
        { item: 'moonsilk', qty: 3 },
        { item: 'emerald', qty: 1 },
      ],
    },
  },
  {
    id: 'moonsteel-helm',
    name: 'moonsteel helm',
    slot: 'head',
    value: 1_000,
    blurb: 'a miner’s lamp that never runs out.',
    mods: [
      { stat: 'efficiency', value: 0.14, skill: 'mining' },
      { stat: 'find', value: 0.1, skill: 'mining' },
    ],
    craft: { skill: 'smithing', level: 72, inputs: [{ item: 'moonsteel-bar', qty: 3 }] },
  },
  {
    id: 'moonsteel-boots',
    name: 'moonsteel boots',
    slot: 'feet',
    value: 1_200,
    blurb: 'quiet as a moonbeam.',
    mods: [
      { stat: 'travel', value: 0.18 },
      { stat: 'efficiency', value: 0.04 },
    ],
    craft: { skill: 'smithing', level: 76, inputs: [{ item: 'moonsteel-bar', qty: 3 }] },
  },
  {
    id: 'diamond-ring',
    name: 'diamond ring',
    slot: 'ring',
    value: 2_000,
    blurb: 'everything doubles in its light.',
    mods: [
      { stat: 'doubleResult', value: 0.05 },
      { stat: 'find', value: 0.1 },
    ],
    craft: {
      skill: 'crafting',
      level: 80,
      inputs: [
        { item: 'gold-bar', qty: 1 },
        { item: 'diamond', qty: 1 },
      ],
    },
  },
  {
    id: 'sunsteel-gauntlets',
    name: 'sunsteel gauntlets',
    slot: 'hands',
    value: 2_400,
    blurb: 'warm hands work twice as fast.',
    mods: [
      { stat: 'efficiency', value: 0.07 },
      { stat: 'doubleAction', value: 0.03 },
    ],
    craft: { skill: 'smithing', level: 86, inputs: [{ item: 'sunsteel-bar', qty: 3 }] },
  },
  {
    id: 'starwood-pack',
    name: 'starwood pack',
    slot: 'back',
    value: 2_600,
    blurb: 'roomy inside. roomier than outside.',
    mods: [
      { stat: 'slots', value: 12 },
      { stat: 'travel', value: 0.05 },
    ],
    craft: {
      skill: 'crafting',
      level: 88,
      inputs: [
        { item: 'starwood-logs', qty: 4 },
        { item: 'moonsilk', qty: 6 },
      ],
    },
  },
  {
    id: 'sun-amulet',
    name: 'sun amulet',
    slot: 'neck',
    value: 4_000,
    blurb: 'a little piece of the fallen star.',
    mods: [
      { stat: 'efficiency', value: 0.1 },
      { stat: 'xp', value: 0.06 },
    ],
    craft: {
      skill: 'crafting',
      level: 92,
      inputs: [
        { item: 'sunsteel-bar', qty: 2 },
        { item: 'diamond', qty: 1 },
      ],
    },
  },
  {
    id: 'summit-charm',
    name: 'summit charm',
    slot: 'neck',
    value: 1_000,
    blurb: 'the hermit’s thanks, on a string.',
    mods: [
      { stat: 'efficiency', value: 0.06 },
      { stat: 'chest', value: 0.1 },
    ],
  },
  {
    id: 'bruh-crown',
    name: 'bruh crown',
    slot: 'head',
    value: 10_000,
    blurb: 'forged from the fallen star for the bravest bruh.',
    mods: [
      { stat: 'efficiency', value: 0.1 },
      { stat: 'xp', value: 0.08 },
      { stat: 'doubleAction', value: 0.03 },
    ],
  },
  {
    id: 'legend-cape',
    name: 'legend cape',
    slot: 'cape',
    value: 25_000,
    blurb: 'only legends of the fruitlands wear this.',
    mods: [
      { stat: 'efficiency', value: 0.1 },
      { stat: 'doubleAction', value: 0.1 },
      { stat: 'xp', value: 0.1 },
      { stat: 'travel', value: 0.1 },
    ],
  },
  {
    id: 'lumberjack-cap',
    name: 'lumberjack cap',
    slot: 'head',
    value: 500,
    blurb: 'found in a nest. smells of pine.',
    mods: [
      { stat: 'efficiency', value: 0.12, skill: 'woodcutting' },
      { stat: 'doubleResult', value: 0.05, skill: 'woodcutting' },
    ],
  },
  {
    id: 'angler-hat',
    name: 'angler’s hat',
    slot: 'head',
    value: 500,
    blurb: 'covered in lucky lures.',
    mods: [
      { stat: 'efficiency', value: 0.12, skill: 'fishing' },
      { stat: 'find', value: 0.1, skill: 'fishing' },
    ],
  },
  {
    id: 'four-leaf-charm',
    name: 'four-leaf charm',
    slot: 'neck',
    value: 800,
    blurb: 'luck, pressed under glass.',
    mods: [
      { stat: 'find', value: 0.15 },
      { stat: 'chest', value: 0.15 },
    ],
  },
  {
    id: 'seven-league-boots',
    name: 'seven-league boots',
    slot: 'feet',
    value: 1_500,
    blurb: 'each step goes a little further.',
    mods: [{ stat: 'travel', value: 0.25 }],
  },
  {
    id: 'treasure-ring',
    name: 'treasure hunter’s ring',
    slot: 'ring',
    value: 1_200,
    blurb: 'it hums near buried things.',
    mods: [{ stat: 'chest', value: 0.4 }],
  },
  {
    id: 'bruh-cape',
    name: 'bruh cape',
    slot: 'cape',
    value: 5_000,
    blurb: 'worn by the original bruh. the rarest find.',
    mods: [
      { stat: 'doubleAction', value: 0.08 },
      { stat: 'xp', value: 0.05 },
    ],
  },
];

const GEAR_ITEMS: readonly Item[] = GEAR.map((gear) => ({
  id: gear.id,
  name: gear.name,
  kind: 'gear' as const,
  value: gear.value,
  blurb: gear.blurb,
  slot: gear.slot,
  mods: gear.mods,
}));

export const ITEMS: readonly Item[] = [...BASE_ITEMS, ...TOOL_ITEMS, ...GEAR_ITEMS];
const ITEM_MAP = new Map(ITEMS.map((item) => [item.id, item]));
export function getItem(id: string): Item | undefined {
  return ITEM_MAP.get(id);
}

// --- activities ----------------------------------------------------------------------

export type Station = 'forge' | 'range' | 'workbench';
export type Find = Readonly<{ item: string; chance: number }>;
export type Activity = Readonly<{
  id: string;
  name: string;
  verb: string;
  skill: SkillId;
  level: number;
  steps: number;
  xp: number;
  output: Stack;
  inputs?: readonly Stack[];
  tool?: ToolKind;
  station?: Station;
  // Rare finds rolled on every completed action (scaled by find chance).
  finds?: readonly Find[];
  burn?: Readonly<{ item: string; chance: number }>;
  // Crafted outputs roll a quality.
  quality?: boolean;
}>;

const TIERS = [
  { level: 1, steps: 60, xp: 15 },
  { level: 15, steps: 90, xp: 35 },
  { level: 30, steps: 130, xp: 70 },
  { level: 50, steps: 180, xp: 125 },
  { level: 70, steps: 240, xp: 200 },
  { level: 85, steps: 300, xp: 290 },
] as const;

function gather(
  id: string,
  name: string,
  verb: string,
  skill: SkillId,
  tool: ToolKind,
  tier: Readonly<{ level: number; steps: number; xp: number }>,
  output: string,
  finds?: readonly Find[],
): Activity {
  return {
    id,
    name,
    verb,
    skill,
    tool,
    ...tier,
    output: { item: output, qty: 1 },
    ...(finds ? { finds } : {}),
  };
}

const GEMS: readonly Find[] = [
  { item: 'sapphire', chance: 1 / 250 },
  { item: 'emerald', chance: 1 / 500 },
  { item: 'ruby', chance: 1 / 1_000 },
  { item: 'diamond', chance: 1 / 3_000 },
];
const SEED: readonly Find[] = [{ item: 'golden-seed', chance: 1 / 250 }];

const COOK_TIERS = [
  { level: 1, steps: 40, xp: 12, burn: 0.35 },
  { level: 15, steps: 60, xp: 30, burn: 0.4 },
  { level: 30, steps: 80, xp: 60, burn: 0.45 },
  { level: 50, steps: 110, xp: 110, burn: 0.5 },
  { level: 70, steps: 140, xp: 170, burn: 0.5 },
  { level: 85, steps: 170, xp: 240, burn: 0.55 },
] as const;
const FISH = ['minnow', 'trout', 'eel', 'swordfish', 'moonray', 'sunfish'] as const;

const BAR_RECIPES: readonly Readonly<{
  metal: Metal | 'gold';
  level: number;
  steps: number;
  xp: number;
  inputs: readonly Stack[];
}>[] = [
  {
    metal: 'bronze',
    level: 1,
    steps: 60,
    xp: 8,
    inputs: [
      { item: 'copper-ore', qty: 1 },
      { item: 'tin-ore', qty: 1 },
    ],
  },
  { metal: 'iron', level: 15, steps: 80, xp: 20, inputs: [{ item: 'iron-ore', qty: 1 }] },
  {
    metal: 'steel',
    level: 30,
    steps: 110,
    xp: 40,
    inputs: [
      { item: 'iron-ore', qty: 1 },
      { item: 'coal', qty: 2 },
    ],
  },
  { metal: 'gold', level: 40, steps: 110, xp: 55, inputs: [{ item: 'gold-ore', qty: 1 }] },
  {
    metal: 'mithril',
    level: 50,
    steps: 150,
    xp: 70,
    inputs: [
      { item: 'mithril-ore', qty: 1 },
      { item: 'coal', qty: 2 },
    ],
  },
  {
    metal: 'moonsteel',
    level: 70,
    steps: 190,
    xp: 100,
    inputs: [
      { item: 'moonstone-ore', qty: 1 },
      { item: 'coal', qty: 2 },
    ],
  },
  {
    metal: 'sunsteel',
    level: 85,
    steps: 230,
    xp: 140,
    inputs: [
      { item: 'sunstone-ore', qty: 1 },
      { item: 'coal', qty: 3 },
    ],
  },
];
const FORGE_TIERS: Readonly<
  Record<Metal, Readonly<{ level: number; steps: number; xp: number; log: string }>>
> = {
  bronze: { level: 1, steps: 100, xp: 25, log: 'pandan-logs' },
  iron: { level: 15, steps: 140, xp: 60, log: 'longan-logs' },
  steel: { level: 30, steps: 180, xp: 120, log: 'mahogany-logs' },
  mithril: { level: 50, steps: 240, xp: 220, log: 'dragonwood-logs' },
  moonsteel: { level: 70, steps: 300, xp: 360, log: 'moonwood-logs' },
  sunsteel: { level: 85, steps: 360, xp: 520, log: 'starwood-logs' },
};

const BASE_ACTIVITIES: readonly Activity[] = [
  gather('chop-pandan', 'pandan tree', 'chopping', 'woodcutting', 'axe', TIERS[0], 'pandan-logs'),
  gather('chop-longan', 'longan tree', 'chopping', 'woodcutting', 'axe', TIERS[1], 'longan-logs'),
  gather('chop-mahogany', 'mahogany tree', 'chopping', 'woodcutting', 'axe', TIERS[2], 'mahogany-logs'),
  gather('chop-dragonwood', 'dragonwood tree', 'chopping', 'woodcutting', 'axe', TIERS[3], 'dragonwood-logs'),
  gather('chop-moonwood', 'moonwood tree', 'chopping', 'woodcutting', 'axe', TIERS[4], 'moonwood-logs'),
  gather('chop-starwood', 'starwood tree', 'chopping', 'woodcutting', 'axe', TIERS[5], 'starwood-logs'),
  gather('mine-copper', 'copper rock', 'mining', 'mining', 'pickaxe', TIERS[0], 'copper-ore', GEMS),
  gather('mine-tin', 'tin rock', 'mining', 'mining', 'pickaxe', TIERS[0], 'tin-ore', GEMS),
  gather('mine-iron', 'iron rock', 'mining', 'mining', 'pickaxe', TIERS[1], 'iron-ore', GEMS),
  gather('mine-coal', 'coal seam', 'mining', 'mining', 'pickaxe', TIERS[2], 'coal', GEMS),
  gather(
    'mine-gold',
    'gold vein',
    'mining',
    'mining',
    'pickaxe',
    { level: 40, steps: 150, xp: 95 },
    'gold-ore',
    GEMS,
  ),
  gather('mine-mithril', 'mithril vein', 'mining', 'mining', 'pickaxe', TIERS[3], 'mithril-ore', GEMS),
  gather('mine-moonstone', 'moonstone rock', 'mining', 'mining', 'pickaxe', TIERS[4], 'moonstone-ore', GEMS),
  gather('mine-sunstone', 'sunstone vein', 'mining', 'mining', 'pickaxe', TIERS[5], 'sunstone-ore', GEMS),
  gather('fish-minnow', 'minnow shoal', 'fishing', 'fishing', 'harpoon', TIERS[0], 'raw-minnow'),
  gather('fish-trout', 'trout pool', 'fishing', 'fishing', 'harpoon', TIERS[1], 'raw-trout'),
  gather('fish-eel', 'eel burrow', 'fishing', 'fishing', 'harpoon', TIERS[2], 'raw-eel'),
  gather('fish-swordfish', 'swordfish waters', 'fishing', 'fishing', 'harpoon', TIERS[3], 'raw-swordfish'),
  gather('fish-moonray', 'moonlit pond', 'fishing', 'fishing', 'harpoon', TIERS[4], 'raw-moonray'),
  gather('fish-sunfish', 'hot spring', 'fishing', 'fishing', 'harpoon', TIERS[5], 'raw-sunfish'),
  gather('pick-rambutan', 'rambutan bush', 'picking', 'foraging', 'shears', TIERS[0], 'rambutan', SEED),
  gather(
    'pick-flax',
    'flax field',
    'picking',
    'foraging',
    'shears',
    { level: 5, steps: 50, xp: 10 },
    'flax',
    SEED,
  ),
  gather('pick-mangosteen', 'mangosteen bush', 'picking', 'foraging', 'shears', TIERS[1], 'mangosteen', SEED),
  gather(
    'pick-reeds',
    'marsh reeds',
    'cutting',
    'foraging',
    'shears',
    { level: 25, steps: 100, xp: 45 },
    'reeds',
    SEED,
  ),
  gather('pick-durian', 'durian tree', 'picking', 'foraging', 'shears', TIERS[2], 'durian', SEED),
  gather(
    'pick-dragonfruit',
    'dragonfruit cactus',
    'picking',
    'foraging',
    'shears',
    TIERS[3],
    'dragonfruit',
    SEED,
  ),
  gather(
    'pick-silkweed',
    'silkweed patch',
    'cutting',
    'foraging',
    'shears',
    { level: 60, steps: 200, xp: 150 },
    'silkweed',
    SEED,
  ),
  gather('pick-persimmon', 'persimmon tree', 'picking', 'foraging', 'shears', TIERS[4], 'persimmon', SEED),
  gather('pick-lychee', 'lychee tree', 'picking', 'foraging', 'shears', TIERS[5], 'lychee', SEED),
  ...BAR_RECIPES.map(
    ({ metal, ...recipe }): Activity => ({
      id: `smelt-${metal}`,
      name: `${metal} bar`,
      verb: 'smelting',
      skill: 'smithing',
      station: 'forge',
      output: { item: `${metal}-bar`, qty: 1 },
      ...recipe,
    }),
  ),
  ...METALS.flatMap((metal) =>
    TOOL_KINDS.map((kind): Activity => {
      const tier = FORGE_TIERS[metal];
      return {
        id: `forge-${metal}-${kind}`,
        name: `${metal} ${TOOL_NAMES[kind]}`,
        verb: 'forging',
        skill: 'smithing',
        station: 'forge',
        level: tier.level,
        steps: tier.steps,
        xp: tier.xp,
        inputs: [
          { item: `${metal}-bar`, qty: 2 },
          { item: tier.log, qty: 1 },
        ],
        output: { item: toolId(metal, kind), qty: 1 },
      };
    }),
  ),
  ...FISH.map((fish, index): Activity => {
    const tier = COOK_TIERS[index] ?? COOK_TIERS[0];
    return {
      id: `cook-${fish}`,
      name: fish,
      verb: 'cooking',
      skill: 'cooking',
      station: 'range',
      level: tier.level,
      steps: tier.steps,
      xp: tier.xp,
      inputs: [{ item: `raw-${fish}`, qty: 1 }],
      output: { item: fish, qty: 1 },
      burn: { item: 'burnt-fish', chance: tier.burn },
    };
  }),
  {
    id: 'spin-linen',
    name: 'linen',
    verb: 'spinning',
    skill: 'crafting',
    station: 'workbench',
    level: 1,
    steps: 40,
    xp: 8,
    inputs: [{ item: 'flax', qty: 2 }],
    output: { item: 'linen', qty: 1 },
  },
  {
    id: 'weave-wicker',
    name: 'wicker',
    verb: 'weaving',
    skill: 'crafting',
    station: 'workbench',
    level: 20,
    steps: 70,
    xp: 30,
    inputs: [{ item: 'reeds', qty: 3 }],
    output: { item: 'wicker', qty: 1 },
  },
  {
    id: 'spin-silk',
    name: 'moonsilk',
    verb: 'spinning',
    skill: 'crafting',
    station: 'workbench',
    level: 60,
    steps: 120,
    xp: 90,
    inputs: [{ item: 'silkweed', qty: 3 }],
    output: { item: 'moonsilk', qty: 1 },
  },
  // Gear recipes: sewing and jewellery at the workbench, armour at the forge.
  ...GEAR.flatMap((gear): Activity[] => {
    const craft = gear.craft;
    if (!craft) return [];
    const jewel = gear.slot === 'ring' || gear.slot === 'neck';
    return [
      {
        id: `make-${gear.id}`,
        name: gear.name,
        verb: craft.skill === 'smithing' ? 'forging' : jewel ? 'setting' : 'sewing',
        skill: craft.skill,
        station: craft.skill === 'smithing' ? 'forge' : 'workbench',
        level: craft.level,
        steps: 80 + craft.level * 2,
        // Past level 50 recipes pay extra, keeping pace with the higher gathering tiers.
        xp: Math.round(20 + craft.level * 2.5 + Math.max(0, craft.level - 50) * 3),
        inputs: craft.inputs,
        output: { item: gear.id, qty: 1 },
        quality: true,
      },
    ];
  }),
];

// Higher-level work pays more xp per action: twice as much every 25 levels above 1, so about
// ×3.9 at level 50 and ×10 at level 85. RuneScape's curve doubles the xp per level every 7
// levels, and without this one skill took about 25 days to reach 50 and 140 days to reach 70 at
// 8,000 steps a day. With it, about 2 weeks to 50, 6 weeks to 70 and 3 months to 85.
export function tierXpScale(level: number): number {
  return 2 ** ((level - 1) / 25);
}

export const ACTIVITIES: readonly Activity[] = BASE_ACTIVITIES.map((activity) => ({
  ...activity,
  xp: Math.round(activity.xp * tierXpScale(activity.level)),
}));
const ACTIVITY_MAP = new Map(ACTIVITIES.map((activity) => [activity.id, activity]));
export function getActivity(id: string): Activity | undefined {
  return ACTIVITY_MAP.get(id);
}
function stationActivities(station: Station): string[] {
  return ACTIVITIES.filter((activity) => activity.station === station).map((activity) => activity.id);
}

// Chests found while working, by skill. Every skill also has a slim chance of an adventurer's chest.
export const SKILL_CHEST: Readonly<Record<SkillId, string | null>> = {
  woodcutting: 'bird-nest',
  foraging: 'bird-nest',
  mining: 'miner-crate',
  smithing: 'miner-crate',
  fishing: 'bottle',
  cooking: 'bottle',
  crafting: null,
  agility: null,
};
export const CHEST_CHANCE = 1 / 300;
export const ADVENTURER_CHANCE = 1 / 2_000;

// --- world ---------------------------------------------------------------------------

export type Biome =
  | 'town'
  | 'forest'
  | 'hills'
  | 'lake'
  | 'dunes'
  | 'marsh'
  | 'peak'
  | 'bay'
  | 'grove'
  | 'crater';
export type LocationRequirement =
  | Readonly<{ type: 'skill'; skill: SkillId; level: number }>
  | Readonly<{ type: 'quest'; quest: string }>;
export type Place = Readonly<{
  id: string;
  name: string;
  biome: Biome;
  blurb: string;
  // Tile coordinates on the 24×32 world map.
  x: number;
  y: number;
  activities: readonly string[];
  store?: boolean;
  bank?: boolean;
  requires?: LocationRequirement;
}>;

export const LOCATIONS: readonly Place[] = [
  {
    id: 'bruhbridge',
    name: 'bruhbridge',
    biome: 'town',
    blurb: 'a cosy town where every road in the fruitlands begins.',
    x: 11,
    y: 16,
    activities: [
      ...stationActivities('forge'),
      ...stationActivities('range'),
      ...stationActivities('workbench'),
    ],
    store: true,
    bank: true,
  },
  {
    id: 'pandan-woods',
    name: 'pandan woods',
    biome: 'forest',
    blurb: 'quiet green woods with flax in the clearings.',
    x: 5,
    y: 13,
    activities: ['chop-pandan', 'pick-rambutan', 'pick-flax'],
  },
  {
    id: 'pebble-hills',
    name: 'pebble hills',
    biome: 'hills',
    blurb: 'rolling hills full of copper and tin.',
    x: 17,
    y: 19,
    activities: ['mine-copper', 'mine-tin'],
  },
  {
    id: 'longan-lake',
    name: 'longan lake',
    biome: 'lake',
    blurb: 'a still lake ringed by longan trees.',
    x: 8,
    y: 7,
    activities: ['fish-minnow', 'fish-trout', 'chop-longan'],
  },
  {
    id: 'durian-dunes',
    name: 'durian dunes',
    biome: 'dunes',
    blurb: 'hot sand, iron and gold veins, and a powerful smell.',
    x: 18,
    y: 26,
    activities: ['mine-iron', 'mine-coal', 'mine-gold', 'pick-durian'],
  },
  {
    id: 'mangosteen-marsh',
    name: 'mangosteen marsh',
    biome: 'marsh',
    blurb: 'boggy, buggy and full of treasure.',
    x: 15,
    y: 4,
    activities: ['pick-mangosteen', 'pick-reeds', 'fish-eel', 'chop-mahogany'],
    requires: { type: 'quest', quest: 'soggy-bridge' },
  },
  {
    id: 'dragonfruit-peak',
    name: 'dragonfruit peak',
    biome: 'peak',
    blurb: 'a cold climb to the rarest resources.',
    x: 6,
    y: 25,
    activities: ['mine-mithril', 'chop-dragonwood', 'pick-dragonfruit'],
    // Everything up here needs level 50; the gate opens a little before that.
    requires: { type: 'skill', skill: 'agility', level: 40 },
  },
  {
    id: 'blueberry-bay',
    name: 'blueberry bay',
    biome: 'bay',
    blurb: 'a salty port where the deep-sea boats come in.',
    x: 20,
    y: 10,
    activities: [
      'fish-swordfish',
      'fish-trout',
      ...stationActivities('range'),
      ...stationActivities('workbench'),
    ],
    store: true,
    bank: true,
  },
  {
    id: 'moonlit-grove',
    name: 'moonlit grove',
    biome: 'grove',
    blurb: 'a silver wood where it is always night. moonwood, moonstone and silkweed.',
    x: 11,
    y: 22,
    activities: ['chop-moonwood', 'mine-moonstone', 'pick-silkweed', 'pick-persimmon', 'fish-moonray'],
    requires: { type: 'quest', quest: 'moonlit-path' },
  },
  {
    id: 'starfall-crater',
    name: 'starfall crater',
    biome: 'crater',
    blurb: 'where the star came down. a hot forge, a hot spring and the rarest wood.',
    x: 4,
    y: 30,
    activities: [
      'chop-starwood',
      'mine-sunstone',
      'pick-lychee',
      'fish-sunfish',
      ...stationActivities('forge'),
      ...stationActivities('range'),
    ],
    requires: { type: 'quest', quest: 'fallen-star' },
  },
];
const LOCATION_MAP = new Map(LOCATIONS.map((place) => [place.id, place]));
export function getLocation(id: string): Place | undefined {
  return LOCATION_MAP.get(id);
}
export const START_LOCATION = 'bruhbridge';

export const ROADS: readonly Readonly<[string, string, number]>[] = [
  ['bruhbridge', 'pandan-woods', 500],
  ['bruhbridge', 'pebble-hills', 600],
  ['bruhbridge', 'longan-lake', 900],
  ['pandan-woods', 'longan-lake', 600],
  ['pandan-woods', 'dragonfruit-peak', 1_800],
  ['pebble-hills', 'durian-dunes', 900],
  ['pebble-hills', 'blueberry-bay', 1_100],
  ['longan-lake', 'mangosteen-marsh', 1_000],
  ['mangosteen-marsh', 'blueberry-bay', 1_200],
  ['durian-dunes', 'dragonfruit-peak', 1_500],
  ['bruhbridge', 'moonlit-grove', 1_600],
  ['pebble-hills', 'moonlit-grove', 1_300],
  ['dragonfruit-peak', 'moonlit-grove', 1_400],
  ['dragonfruit-peak', 'starfall-crater', 2_000],
  ['moonlit-grove', 'starfall-crater', 2_400],
];

// --- quests ---------------------------------------------------------------------------

export type Quest = Readonly<{
  id: string;
  name: string;
  giver: string;
  // Hand-ins happen where the quest giver lives.
  location: string;
  blurb: string;
  done: string;
  points: number;
  requires: Readonly<{
    skills?: readonly Readonly<{ skill: SkillId; level: number }>[];
    quests?: readonly string[];
  }>;
  deliver: readonly Stack[];
  rewards: Readonly<{
    xp?: readonly Readonly<{ skill: SkillId; amount: number }>[];
    coins?: number;
    items?: readonly Stack[];
    unlock?: string;
  }>;
}>;

export const QUESTS: readonly Quest[] = [
  {
    id: 'hungry-innkeeper',
    name: 'the hungry innkeeper',
    giver: 'marta at the bruhbridge inn',
    location: 'bruhbridge',
    blurb: 'the inn ran out of food. bring marta some cooked minnows before the lunch rush.',
    done: 'marta’s regulars are fed and happy. she slips you a bag of coins.',
    points: 1,
    requires: {},
    deliver: [{ item: 'minnow', qty: 5 }],
    rewards: { xp: [{ skill: 'cooking', amount: 300 }], coins: 100 },
  },
  {
    id: 'rock-collector',
    name: 'rock collector',
    giver: 'professor pebble in pebble hills',
    location: 'pebble-hills',
    blurb: 'the professor is building a museum of rocks. carry copper, tin and iron out to the hills.',
    done: 'the museum opens with your ore as its centrepiece.',
    points: 1,
    requires: { skills: [{ skill: 'mining', level: 10 }] },
    deliver: [
      { item: 'copper-ore', qty: 10 },
      { item: 'tin-ore', qty: 10 },
      { item: 'iron-ore', qty: 5 },
    ],
    rewards: { xp: [{ skill: 'mining', amount: 1_200 }], items: [{ item: 'iron-pickaxe', qty: 1 }] },
  },
  {
    id: 'soggy-bridge',
    name: 'a bridge too soggy',
    giver: 'the bridgekeeper at longan lake',
    location: 'longan-lake',
    blurb: 'the old bridge to the marsh has rotted. bring timber and nails so it can be rebuilt.',
    done: 'the new bridge holds. mangosteen marsh is open.',
    points: 2,
    requires: {
      skills: [
        { skill: 'woodcutting', level: 15 },
        { skill: 'smithing', level: 10 },
      ],
    },
    deliver: [
      { item: 'longan-logs', qty: 20 },
      { item: 'bronze-bar', qty: 10 },
    ],
    rewards: {
      xp: [
        { skill: 'woodcutting', amount: 1_500 },
        { skill: 'smithing', amount: 800 },
      ],
      coins: 300,
      unlock: 'mangosteen marsh',
    },
  },
  {
    id: 'fashion-show',
    name: 'the bay fashion show',
    giver: 'madame plum at blueberry bay',
    location: 'blueberry-bay',
    blurb: 'the bay’s fashion show needs a model in a hat, gloves and boots. any quality will do.',
    done: 'you strut. the crowd goes wild. madame plum hands you a pack of your own.',
    points: 1,
    requires: { skills: [{ skill: 'crafting', level: 12 }] },
    deliver: [
      { item: 'straw-hat', qty: 1 },
      { item: 'linen-gloves', qty: 1 },
      { item: 'travel-boots', qty: 1 },
    ],
    rewards: {
      xp: [{ skill: 'crafting', amount: 1_000 }],
      coins: 300,
      items: [{ item: 'wicker-pack', qty: 1 }],
    },
  },
  {
    id: 'basket-case',
    name: 'basket case',
    giver: 'auntie lychee in bruhbridge',
    location: 'bruhbridge',
    blurb: 'auntie lychee is making her famous fruit basket and needs the good stuff.',
    done: 'the basket wins first prize at the bruhbridge fair.',
    points: 1,
    requires: { skills: [{ skill: 'foraging', level: 20 }], quests: ['soggy-bridge'] },
    deliver: [
      { item: 'rambutan', qty: 25 },
      { item: 'mangosteen', qty: 15 },
    ],
    rewards: {
      xp: [{ skill: 'foraging', amount: 3_000 }],
      items: [{ item: 'steel-shears', qty: 1 }],
      coins: 250,
    },
  },
  {
    id: 'apprentice',
    name: 'the smith’s apprentice',
    giver: 'gruff, the bruhbridge smith',
    location: 'bruhbridge',
    blurb: 'gruff is behind on orders and needs a second pair of hands at the forge.',
    done: 'gruff grunts. from gruff, that is high praise. he hands you his old pickaxe.',
    points: 1,
    requires: {
      skills: [
        { skill: 'smithing', level: 20 },
        { skill: 'mining', level: 15 },
      ],
    },
    deliver: [
      { item: 'iron-bar', qty: 10 },
      { item: 'bronze-bar', qty: 10 },
    ],
    rewards: {
      xp: [
        { skill: 'smithing', amount: 2_500 },
        { skill: 'mining', amount: 1_000 },
      ],
      coins: 400,
      items: [{ item: 'steel-pickaxe', qty: 1 }],
    },
  },
  {
    id: 'lake-legend',
    name: 'the lake legend',
    giver: 'the bridgekeeper at longan lake',
    location: 'longan-lake',
    blurb: 'the bridgekeeper is throwing a trout fry for the whole lake. bring the trout, cooked.',
    done: 'the lake fry is a hit. the bridgekeeper gives you a hat covered in lures.',
    points: 2,
    requires: {
      skills: [
        { skill: 'fishing', level: 30 },
        { skill: 'cooking', level: 25 },
      ],
      quests: ['hungry-innkeeper'],
    },
    deliver: [{ item: 'trout', qty: 20 }],
    rewards: {
      xp: [
        { skill: 'fishing', amount: 4_000 },
        { skill: 'cooking', amount: 2_500 },
      ],
      coins: 500,
      items: [{ item: 'angler-hat', qty: 1 }],
    },
  },
  {
    id: 'marsh-mystery',
    name: 'the marsh mystery',
    giver: 'the marsh witch in mangosteen marsh',
    location: 'mangosteen-marsh',
    blurb:
      'the marsh witch is brewing something. she will not say what. she needs eels, mangosteens and reeds.',
    done: 'the brew bubbles green. the witch gives you a charm for your trouble.',
    points: 2,
    requires: {
      skills: [
        { skill: 'fishing', level: 35 },
        { skill: 'foraging', level: 35 },
      ],
      quests: ['soggy-bridge'],
    },
    deliver: [
      { item: 'raw-eel', qty: 15 },
      { item: 'mangosteen', qty: 15 },
      { item: 'reeds', qty: 10 },
    ],
    rewards: {
      xp: [
        { skill: 'fishing', amount: 6_000 },
        { skill: 'foraging', amount: 6_000 },
      ],
      items: [{ item: 'four-leaf-charm', qty: 1 }],
    },
  },
  {
    id: 'caravan',
    name: 'the durian caravan',
    giver: 'the caravan master at durian dunes',
    location: 'durian-dunes',
    blurb: 'the caravan leaves at dawn and the baskets are empty. fill them with durian and wicker.',
    done: 'the caravan rolls out, smelling powerfully of durian. the master gives you a spare pack.',
    points: 2,
    requires: {
      skills: [
        { skill: 'foraging', level: 30 },
        { skill: 'crafting', level: 25 },
        { skill: 'agility', level: 15 },
      ],
    },
    deliver: [
      { item: 'durian', qty: 15 },
      { item: 'wicker', qty: 10 },
    ],
    rewards: {
      xp: [
        { skill: 'foraging', amount: 4_000 },
        { skill: 'crafting', amount: 3_500 },
      ],
      coins: 800,
      items: [{ item: 'forager-pack', qty: 1 }],
    },
  },
  {
    id: 'gold-rush',
    name: 'gold rush',
    giver: 'the prospector at durian dunes',
    location: 'durian-dunes',
    blurb: 'the prospector swears there is a fortune in the dunes. prove it with gold bars.',
    done: 'the prospector weeps with joy and hands over his lucky ring.',
    points: 2,
    requires: {
      skills: [
        { skill: 'mining', level: 42 },
        { skill: 'smithing', level: 40 },
      ],
      quests: ['apprentice'],
    },
    deliver: [{ item: 'gold-bar', qty: 25 }],
    rewards: {
      xp: [
        { skill: 'mining', amount: 10_000 },
        { skill: 'smithing', amount: 8_000 },
      ],
      coins: 1_500,
      items: [{ item: 'treasure-ring', qty: 1 }],
    },
  },
  {
    id: 'summit-shrine',
    name: 'the summit shrine',
    giver: 'the hermit on dragonfruit peak',
    location: 'dragonfruit-peak',
    blurb: 'the hermit’s shrine fell in a storm. carry up mithril and dragonwood to rebuild it.',
    done: 'the shrine stands again. the hermit ties a charm around your neck.',
    points: 2,
    requires: {
      skills: [
        { skill: 'mining', level: 50 },
        { skill: 'woodcutting', level: 50 },
      ],
    },
    deliver: [
      { item: 'mithril-ore', qty: 25 },
      { item: 'dragonwood-logs', qty: 25 },
    ],
    rewards: {
      xp: [
        { skill: 'mining', amount: 15_000 },
        { skill: 'woodcutting', amount: 15_000 },
      ],
      coins: 2_000,
      items: [{ item: 'summit-charm', qty: 1 }],
    },
  },
  {
    id: 'big-catch',
    name: 'the big catch',
    giver: 'old salt at blueberry bay',
    location: 'blueberry-bay',
    blurb: 'old salt swears he once caught a swordfish as long as a boat. prove him right.',
    done: 'old salt tells everyone the catch was his. you know the truth.',
    points: 3,
    requires: {
      skills: [
        { skill: 'fishing', level: 50 },
        { skill: 'cooking', level: 50 },
      ],
      quests: ['hungry-innkeeper'],
    },
    deliver: [
      { item: 'swordfish', qty: 12 },
      { item: 'raw-eel', qty: 20 },
    ],
    rewards: {
      xp: [
        { skill: 'fishing', amount: 20_000 },
        { skill: 'cooking', amount: 10_000 },
      ],
      coins: 2_000,
      items: [{ item: 'mithril-harpoon', qty: 1 }],
    },
  },
  {
    id: 'moonlit-path',
    name: 'the moonlit path',
    giver: 'the stargazer in bruhbridge',
    location: 'bruhbridge',
    blurb: 'the stargazer has seen a silver light in the south. bring offerings to open the path.',
    done: 'the trees part. the moonlit grove is open.',
    points: 3,
    requires: {
      skills: [
        { skill: 'foraging', level: 55 },
        { skill: 'woodcutting', level: 55 },
        { skill: 'agility', level: 45 },
      ],
      quests: ['summit-shrine'],
    },
    deliver: [
      { item: 'dragonfruit', qty: 20 },
      { item: 'dragonwood-logs', qty: 20 },
    ],
    rewards: {
      xp: [
        { skill: 'foraging', amount: 20_000 },
        { skill: 'woodcutting', amount: 20_000 },
      ],
      unlock: 'moonlit grove',
    },
  },
  {
    id: 'silk-road',
    name: 'the silk road',
    giver: 'madame plum at blueberry bay',
    location: 'blueberry-bay',
    blurb: 'madame plum has heard of moonsilk. she wants a robe for the next show, and cloth to spare.',
    done: 'the robe steals the show. madame plum gives you a hood to match.',
    points: 2,
    requires: {
      skills: [
        { skill: 'crafting', level: 64 },
        { skill: 'foraging', level: 60 },
      ],
      quests: ['fashion-show', 'moonlit-path'],
    },
    deliver: [
      { item: 'moonsilk', qty: 15 },
      { item: 'moonsilk-robe', qty: 1 },
    ],
    rewards: {
      xp: [
        { skill: 'crafting', amount: 40_000 },
        { skill: 'foraging', amount: 15_000 },
      ],
      coins: 4_000,
      items: [{ item: 'moonsilk-hood', qty: 1 }],
    },
  },
  {
    id: 'fallen-star',
    name: 'the fallen star',
    giver: 'the stargazer in moonlit grove',
    location: 'moonlit-grove',
    blurb: 'a star fell past the peak. the stargazer needs moonsteel to build a way down to it.',
    done: 'the stairs hold. starfall crater is open.',
    points: 3,
    requires: {
      skills: [
        { skill: 'mining', level: 70 },
        { skill: 'smithing', level: 70 },
        { skill: 'agility', level: 65 },
      ],
      quests: ['moonlit-path'],
    },
    deliver: [
      { item: 'moonsteel-bar', qty: 15 },
      { item: 'moonstone-ore', qty: 30 },
    ],
    rewards: {
      xp: [
        { skill: 'mining', amount: 60_000 },
        { skill: 'smithing', amount: 60_000 },
      ],
      unlock: 'starfall crater',
    },
  },
  {
    id: 'grand-feast',
    name: 'the grand feast',
    giver: 'marta at the bruhbridge inn',
    location: 'bruhbridge',
    blurb: 'marta is throwing the feast of the year and wants the finest fish and fruit in the land.',
    done: 'the whole town eats like royalty. marta will not stop hugging you.',
    points: 3,
    requires: {
      skills: [
        { skill: 'cooking', level: 75 },
        { skill: 'fishing', level: 72 },
        { skill: 'foraging', level: 70 },
      ],
      quests: ['big-catch', 'moonlit-path'],
    },
    deliver: [
      { item: 'moonray', qty: 25 },
      { item: 'persimmon', qty: 20 },
    ],
    rewards: {
      xp: [
        { skill: 'cooking', amount: 80_000 },
        { skill: 'fishing', amount: 60_000 },
      ],
      coins: 10_000,
    },
  },
  {
    id: 'deep-roots',
    name: 'deep roots',
    giver: 'the starsmith at starfall crater',
    location: 'starfall-crater',
    blurb: 'the crater is bare rock. help the starsmith plant a forest that will outlive you both.',
    done: 'seedlings sprout in the warm ash. the first starwood is already reaching up.',
    points: 3,
    requires: {
      skills: [
        { skill: 'woodcutting', level: 80 },
        { skill: 'foraging', level: 78 },
        { skill: 'agility', level: 70 },
      ],
      quests: ['fallen-star'],
    },
    deliver: [
      { item: 'moonwood-logs', qty: 40 },
      { item: 'persimmon', qty: 30 },
      { item: 'golden-seed', qty: 3 },
    ],
    rewards: {
      xp: [
        { skill: 'woodcutting', amount: 100_000 },
        { skill: 'foraging', amount: 80_000 },
      ],
      coins: 15_000,
    },
  },
  {
    id: 'master-chef',
    name: 'master chef',
    giver: 'old salt at blueberry bay',
    location: 'blueberry-bay',
    blurb: 'old salt claims nobody can cook a sunfish without burning it. show him.',
    done: 'old salt takes one bite and goes very quiet. then he asks for seconds.',
    points: 3,
    requires: {
      skills: [
        { skill: 'cooking', level: 88 },
        { skill: 'fishing', level: 86 },
      ],
      quests: ['grand-feast', 'fallen-star'],
    },
    deliver: [{ item: 'sunfish', qty: 45 }],
    rewards: {
      xp: [
        { skill: 'cooking', amount: 200_000 },
        { skill: 'fishing', amount: 120_000 },
      ],
      coins: 25_000,
    },
  },
  {
    id: 'sunforged',
    name: 'sunforged',
    giver: 'the starsmith at starfall crater',
    location: 'starfall-crater',
    blurb: 'the starsmith can forge a crown from the star itself, with sunsteel and steady hands.',
    done: 'the crown cools. it fits you perfectly. of course it does.',
    points: 4,
    requires: {
      skills: [
        { skill: 'smithing', level: 88 },
        { skill: 'crafting', level: 85 },
      ],
      quests: ['fallen-star'],
    },
    deliver: [
      { item: 'sunsteel-bar', qty: 30 },
      { item: 'sunsteel-gauntlets', qty: 1 },
    ],
    rewards: {
      xp: [
        { skill: 'smithing', amount: 150_000 },
        { skill: 'crafting', amount: 100_000 },
      ],
      items: [{ item: 'bruh-crown', qty: 1 }],
    },
  },
  {
    id: 'legend',
    name: 'legend of the fruitlands',
    giver: 'the original bruh in bruhbridge',
    location: 'bruhbridge',
    blurb: 'the original bruh wants to meet whoever has walked every road. bring a taste of the crater.',
    done: 'the original bruh nods slowly. you are a legend of the fruitlands.',
    points: 5,
    requires: {
      skills: [
        { skill: 'woodcutting', level: 80 },
        { skill: 'mining', level: 80 },
        { skill: 'fishing', level: 80 },
        { skill: 'foraging', level: 80 },
        { skill: 'smithing', level: 80 },
        { skill: 'cooking', level: 80 },
        { skill: 'crafting', level: 80 },
        { skill: 'agility', level: 80 },
      ],
      quests: [
        'sunforged',
        'master-chef',
        'deep-roots',
        'silk-road',
        'gold-rush',
        'marsh-mystery',
        'caravan',
        'lake-legend',
      ],
    },
    deliver: [
      { item: 'starwood-logs', qty: 20 },
      { item: 'sunfish', qty: 20 },
      { item: 'lychee', qty: 20 },
      { item: 'sunsteel-bar', qty: 15 },
    ],
    rewards: {
      coins: 50_000,
      items: [{ item: 'legend-cape', qty: 1 }],
    },
  },
];
const QUEST_MAP = new Map(QUESTS.map((quest) => [quest.id, quest]));
export function getQuest(id: string): Quest | undefined {
  return QUEST_MAP.get(id);
}

// Bronze and iron tools at four times their value; steel and mithril at six, for late coins.
export const STORE_STOCK: readonly Readonly<{ item: string; price: number }>[] = [
  ...METALS.slice(0, 4).flatMap((metal, index) =>
    TOOL_KINDS.map((kind) => ({
      item: toolId(metal, kind),
      price: METAL_STATS[metal].value * (index < 2 ? 4 : 6),
    })),
  ),
  { item: 'flax', price: 8 },
  { item: 'minnow', price: 15 },
  { item: 'trout', price: 45 },
  { item: 'straw-hat', price: 80 },
];

// Each backpack upgrade adds two slots, bought at a bank. The long-term coin sink.
export const BAG_UPGRADE_SLOTS = 2;
export const BAG_UPGRADES = [500, 1_500, 4_000, 10_000, 25_000, 60_000] as const;

// --- missions ---------------------------------------------------------------------------
// Daily, weekly and monthly missions. Each period has a fixed walking mission scaled by the
// player's daily goal, plus two drawn from its pool by the period's date.

export const MISSION_PERIODS = ['daily', 'weekly', 'monthly'] as const;
export type MissionPeriod = (typeof MISSION_PERIODS)[number];
export type MissionKind = 'steps' | 'actions' | 'road' | 'chests' | 'quests';
export type Mission = Readonly<{
  id: string;
  period: MissionPeriod;
  name: string;
  kind: MissionKind;
  skill?: SkillId;
  // Steps missions multiply the daily goal; others are plain counts.
  target: number;
  coins: number;
  items?: readonly Stack[];
}>;

const GATHERING: readonly Readonly<{ skill: SkillId; name: string }>[] = [
  { skill: 'woodcutting', name: 'lumber run' },
  { skill: 'mining', name: 'rock run' },
  { skill: 'fishing', name: 'fish run' },
  { skill: 'foraging', name: 'fruit run' },
];
const PROCESSING: readonly Readonly<{ skill: SkillId; name: string }>[] = [
  { skill: 'smithing', name: 'forge shift' },
  { skill: 'cooking', name: 'kitchen shift' },
  { skill: 'crafting', name: 'workbench shift' },
];

function skillMissions(period: MissionPeriod, gather: number, process: number, coins: number): Mission[] {
  return [
    ...GATHERING.map(({ skill, name }) => ({
      id: `${period}-${skill}`,
      period,
      name,
      kind: 'actions' as const,
      skill,
      target: gather,
      coins,
    })),
    ...PROCESSING.map(({ skill, name }) => ({
      id: `${period}-${skill}`,
      period,
      name,
      kind: 'actions' as const,
      skill,
      target: process,
      coins: Math.round(coins * 1.25),
    })),
  ];
}

export const FIXED_MISSIONS: Readonly<Record<MissionPeriod, Mission>> = {
  daily: { id: 'daily-steps', period: 'daily', name: 'daily walk', kind: 'steps', target: 1, coins: 150 },
  weekly: {
    id: 'weekly-steps',
    period: 'weekly',
    name: 'weekly walk',
    kind: 'steps',
    target: 5,
    coins: 1_000,
    items: [{ item: 'bird-nest', qty: 1 }],
  },
  monthly: {
    id: 'monthly-steps',
    period: 'monthly',
    name: 'monthly walk',
    kind: 'steps',
    target: 20,
    coins: 4_000,
    items: [{ item: 'adventurer-chest', qty: 1 }],
  },
};

export const MISSION_POOLS: Readonly<Record<MissionPeriod, readonly Mission[]>> = {
  daily: [
    { id: 'daily-actions', period: 'daily', name: 'busy bruh', kind: 'actions', target: 60, coins: 120 },
    { id: 'daily-road', period: 'daily', name: 'scenic route', kind: 'road', target: 1_500, coins: 120 },
    ...skillMissions('daily', 30, 15, 120),
  ],
  weekly: [
    { id: 'weekly-actions', period: 'weekly', name: 'hard worker', kind: 'actions', target: 400, coins: 800 },
    { id: 'weekly-road', period: 'weekly', name: 'road trip', kind: 'road', target: 8_000, coins: 800 },
    {
      id: 'weekly-chests',
      period: 'weekly',
      name: 'treasure hunt',
      kind: 'chests',
      target: 2,
      coins: 1_000,
      items: [{ item: 'miner-crate', qty: 1 }],
    },
    ...skillMissions('weekly', 150, 75, 800),
  ],
  monthly: [
    {
      id: 'monthly-actions',
      period: 'monthly',
      name: 'tireless',
      kind: 'actions',
      target: 1_500,
      coins: 3_000,
    },
    { id: 'monthly-road', period: 'monthly', name: 'grand tour', kind: 'road', target: 30_000, coins: 3_000 },
    {
      id: 'monthly-chests',
      period: 'monthly',
      name: 'treasure trove',
      kind: 'chests',
      target: 8,
      coins: 3_000,
      items: [{ item: 'adventurer-chest', qty: 1 }],
    },
    {
      id: 'monthly-quest',
      period: 'monthly',
      name: 'helping hand',
      kind: 'quests',
      target: 1,
      coins: 3_000,
      items: [{ item: 'adventurer-chest', qty: 1 }],
    },
    ...skillMissions('monthly', 600, 300, 3_000),
  ],
};
export const MISSION_PICKS = 2;

export const SKINS = [
  { id: 'original', name: 'the original', total: 0, color: 'bruh-base' },
  { id: 'pandan', name: 'grass bruh', total: 25, color: 'pandan-300' },
  { id: 'durian', name: 'sun bruh', total: 50, color: 'durian-400' },
  { id: 'mangosteen', name: 'night bruh', total: 100, color: 'mangosteen-300' },
  { id: 'dragonfruit', name: 'berry bruh', total: 150, color: 'dragonfruit-200' },
  { id: 'blueberry', name: 'rain bruh', total: 250, color: 'blueberry-300' },
] as const;
export type SkinId = (typeof SKINS)[number]['id'];
export type Skin = (typeof SKINS)[number];
