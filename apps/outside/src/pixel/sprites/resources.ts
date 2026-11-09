import { palette } from '../../theme/palette.ts';
import { type Art, art, tint, WOOD } from './core.ts';

// Logs, ores, bars and the four gathering tools, in every tier.

// Metal ramps for bars and tool heads: c light, a base, b shadow, e deep shadow, w glint. g is
// a second glint spot that only the top tiers (moonsteel, sunsteel) light up.
export const BRONZE = {
  w: palette['persimmon-100'],
  c: palette['persimmon-300'],
  a: palette['persimmon-500'],
  b: palette['persimmon-600'],
  e: palette['persimmon-800'],
  g: palette['persimmon-300'],
};

// A chunky log on its side in three-quarter view: the cut end with its rings, grooved bark.
export const LOG = art(
  [
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '.kiiiieccccccak.',
    'kihhhhieccacccbk',
    'kihiihieaaaaaabk',
    'kihiihieabbaaabk',
    'kihoohieaaaaabbk',
    'kihoohieaaabbabk',
    'kihiihieaaaaabbk',
    'kihiihiebbaaabbk',
    'kihhhhiebbbbbbek',
    '.kiiiieeeeeeeek.',
    '..kkkkkkkkkkkk..',
    '................',
    '................',
  ],
  {
    c: palette['persimmon-600'],
    a: palette['persimmon-700'],
    b: palette['persimmon-800'],
    e: palette['persimmon-950'],
    i: palette['persimmon-200'],
    h: palette['persimmon-400'],
    o: palette['persimmon-600'],
  },
);

// A lump of raw ore, the whole stone tinted per mineral, with a fleck of a second mineral.
export const ORE = art(
  [
    '.....kkkkk......',
    '....kccccck.....',
    '...kccwcccakkk..',
    '..kcccccccbkcbk.',
    '.kcccccaaabaabek',
    'kccccaaaagbabbek',
    'kcccaaeaggbbbbek',
    'kccaaaeaaabbbbek',
    'kcaggaaeaabbbbek',
    'kcagaaaeaabbbek.',
    'kaaaaaaaggbbbek.',
    '.kbaaaaagbbeek..',
    '..kkbbbbbbeek...',
    '....kkkkkkkk....',
    '................',
    '................',
  ],
  {
    w: palette['persimmon-200'],
    c: palette['persimmon-400'],
    a: palette['persimmon-600'],
    b: palette['persimmon-800'],
    e: palette['persimmon-950'],
    g: palette['pandan-400'],
  },
);

// Three crystals growing out of a grey rock: moonstone and sunstone.
export const CRYSTAL_ORE = art(
  [
    '................',
    '.......kk.......',
    '......kwok......',
    '.....kppoqk.....',
    '...k.kppoqk.....',
    '..kpkkppoqk.....',
    '.kpoqkppoqk.k...',
    '.kpoqkppoqkkpk..',
    '.kpoqkppoqkpoqk.',
    'kcccqkppoqkpoqk.',
    'kcaacccccccaqcbk',
    'kaaaaaaaaaaaaabk',
    'kbaaaabaaaaabbek',
    '.kbbbbbbbbbbbek.',
    '..kkkkkkkkkkkk..',
    '................',
  ],
  {
    c: palette['rambutan-500'],
    a: palette['rambutan-700'],
    b: palette['rambutan-800'],
    e: palette['rambutan-900'],
    w: palette['rambutan-50'],
    p: palette['blueberry-100'],
    o: palette['mangosteen-300'],
    q: palette['mangosteen-600'],
  },
);

// An ingot in three-quarter view: a lit top face, the front in shade, the right end darkest.
export const BAR = art(
  [
    '................',
    '................',
    '....kkkkkkkkkk..',
    '...kcwgccccccck.',
    '..kccccccccccbk.',
    '.kccccccccccbbk.',
    '.kaaaaaaaaaabek.',
    '.kaaaaaaaaaabek.',
    '.kaaaaaaaaaabek.',
    'kbbbbbbbbbbbbek.',
    'keeeeeeeeeeeek..',
    '.kkkkkkkkkkkk...',
    '................',
    '................',
    '................',
    '................',
  ],
  BRONZE,
);

// A bearded blade with a bright cutting edge, on a diagonal haft.
export const AXE = art(
  [
    '.....kkkk.......',
    '....kwgcck..kk..',
    '..kkcaaaabkkhdk.',
    '.kccaaaaaabhdk..',
    '.kcaaaaaabhdbk..',
    'kcaaaaaabhdbek..',
    'kcaaabkkhdbek...',
    'kcbkkkkhdkek....',
    '.kk..khdk.k.....',
    '....khdk........',
    '...khdk.........',
    '..khdk..........',
    '.khdk...........',
    'kddk............',
    '.kk.............',
    '................',
  ],
  { ...WOOD, ...BRONZE },
);

// A curved two-pointed pick head across the top of a diagonal haft.
export const PICKAXE = art(
  [
    '................',
    '............kk..',
    '....kkkkk..khdk.',
    '..kkccwgckkhdk..',
    '.kcaaaaaaaahk...',
    '.kbkkkkbbaabk...',
    '..k....khdabk...',
    '......khdkbabk..',
    '.....khdkkbabk..',
    '....khdk..kabk..',
    '...khdk...kbek..',
    '..khdk....kbek..',
    '.khdk.....kek...',
    'kddk.....keek...',
    '.kk.......kk....',
    '................',
  ],
  { ...WOOD, ...BRONZE },
);

// A barbed spearhead on a long diagonal shaft.
export const HARPOON = art(
  [
    '.............kk.',
    '...........kkwck',
    '.......kkkkcgabk',
    '......kcccccabk.',
    '......kbaaaabbk.',
    '.......kkaabbk..',
    '.......khdbbek..',
    '......khdkkbek..',
    '.....khdk.kbek..',
    '....khdk...kk...',
    '...khdk.........',
    '..khdk..........',
    '.khdk...........',
    'kddk............',
    '.kk.............',
    '................',
  ],
  { ...WOOD, ...BRONZE },
);

// Shears, blades open towards the top right and two red finger loops at the bottom left.
export const SHEARS = art(
  [
    '.........k......',
    '........kck.....',
    '.......kwak.....',
    '.......kgak.....',
    '......kcak......',
    '......kcak..kkk.',
    '......kcakkkccak',
    '..kk.kcakcccabk.',
    '.kiikkceabbbkk..',
    'kikkhhabbkkk....',
    'khkkdkhkk.......',
    '.kddkiik........',
    '..kkikkhk.......',
    '...khkkdk.......',
    '....kddk........',
    '.....kk.........',
  ],
  { ...BRONZE, i: palette['lychee-400'], h: palette['lychee-500'], d: palette['lychee-700'] },
);

export const METAL_COLORS = {
  bronze: BRONZE,
  iron: {
    w: palette['rambutan-50'],
    c: palette['rambutan-300'],
    a: palette['rambutan-500'],
    b: palette['rambutan-700'],
    e: palette['rambutan-900'],
    g: palette['rambutan-300'],
  },
  steel: {
    w: palette['rambutan-50'],
    c: palette['blueberry-100'],
    a: palette['blueberry-300'],
    b: palette['mangosteen-600'],
    e: palette['mangosteen-800'],
    g: palette['blueberry-100'],
  },
  mithril: {
    w: palette['blueberry-100'],
    c: palette['blueberry-400'],
    a: palette['blueberry-600'],
    b: palette['blueberry-800'],
    e: palette['blueberry-950'],
    g: palette['blueberry-400'],
  },
  moonsteel: {
    w: palette['rambutan-50'],
    c: palette['mangosteen-100'],
    a: palette['mangosteen-300'],
    b: palette['mangosteen-500'],
    e: palette['mangosteen-700'],
    g: palette['rambutan-50'],
  },
  sunsteel: {
    w: palette['durian-50'],
    c: palette['durian-300'],
    a: palette['durian-500'],
    b: palette['persimmon-500'],
    e: palette['persimmon-700'],
    g: palette['durian-50'],
  },
} as const;

// Bark c, a, b, e; the cut end i (face), h (rings), o (heart).
export const LOG_TINTS: Readonly<Record<string, Record<string, string>>> = {
  'pandan-logs': {
    c: palette['pandan-500'],
    a: palette['pandan-600'],
    b: palette['pandan-700'],
    e: palette['pandan-900'],
    i: palette['durian-300'],
    h: palette['durian-600'],
    o: palette['durian-700'],
  },
  'longan-logs': LOG.colors,
  'mahogany-logs': {
    c: palette['lychee-500'],
    a: palette['lychee-700'],
    b: palette['lychee-800'],
    e: palette['lychee-950'],
    i: palette['lychee-200'],
    h: palette['lychee-400'],
    o: palette['lychee-600'],
  },
  'moonwood-logs': {
    c: palette['rambutan-100'],
    a: palette['mangosteen-300'],
    b: palette['mangosteen-500'],
    e: palette['mangosteen-800'],
    i: palette['blueberry-50'],
    h: palette['mangosteen-200'],
    o: palette['mangosteen-400'],
  },
  'starwood-logs': {
    c: palette['durian-500'],
    a: palette['durian-600'],
    b: palette['durian-700'],
    e: palette['persimmon-900'],
    i: palette['durian-100'],
    h: palette['durian-400'],
    o: palette['persimmon-500'],
  },
  'dragonwood-logs': {
    c: palette['dragonfruit-500'],
    a: palette['dragonfruit-700'],
    b: palette['dragonfruit-800'],
    e: palette['dragonfruit-950'],
    i: palette['durian-300'],
    h: palette['dragonfruit-300'],
    o: palette['dragonfruit-500'],
  },
};

// Every ore's full ramp (w, c, a, b, e) and its fleck g.
export const ORE_TINTS: Readonly<Record<string, Record<string, string>>> = {
  'copper-ore': ORE.colors,
  'tin-ore': {
    w: palette['durian-50'],
    c: palette['rambutan-200'],
    a: palette['rambutan-400'],
    b: palette['rambutan-600'],
    e: palette['mangosteen-800'],
    g: palette['rambutan-50'],
  },
  'iron-ore': {
    w: palette['lychee-200'],
    c: palette['lychee-500'],
    a: palette['lychee-700'],
    b: palette['lychee-900'],
    e: palette['lychee-950'],
    g: palette['persimmon-500'],
  },
  coal: {
    w: palette['mangosteen-300'],
    c: palette['longan-600'],
    a: palette['longan-800'],
    b: palette['longan-900'],
    e: palette['longan-950'],
    g: palette['mangosteen-700'],
  },
  'mithril-ore': {
    w: palette['blueberry-50'],
    c: palette['blueberry-300'],
    a: palette['blueberry-500'],
    b: palette['blueberry-700'],
    e: palette['blueberry-900'],
    g: palette['blueberry-100'],
  },
  'gold-ore': {
    w: palette['durian-100'],
    c: palette['durian-400'],
    a: palette['durian-600'],
    b: palette['durian-700'],
    e: palette['durian-900'],
    g: palette['durian-200'],
  },
};

const GOLD = {
  w: palette['durian-100'],
  c: palette['durian-400'],
  a: palette['durian-600'],
  b: palette['durian-700'],
  e: palette['durian-900'],
  g: palette['durian-400'],
};
const METALS = Object.keys(METAL_COLORS) as (keyof typeof METAL_COLORS)[];
const TOOLS = { axe: AXE, pickaxe: PICKAXE, harpoon: HARPOON, shears: SHEARS } as const;

// Every log, ore, bar and tool item, by id.
export const RESOURCE_ITEMS: Readonly<Record<string, Art>> = {
  ...Object.fromEntries(Object.entries(LOG_TINTS).map(([id, colors]) => [id, tint(LOG, colors)])),
  ...Object.fromEntries(Object.entries(ORE_TINTS).map(([id, colors]) => [id, tint(ORE, colors)])),
  'moonstone-ore': CRYSTAL_ORE,
  'sunstone-ore': tint(CRYSTAL_ORE, {
    w: palette['durian-50'],
    p: palette['durian-300'],
    o: palette['persimmon-400'],
    q: palette['persimmon-600'],
  }),
  'gold-bar': tint(BAR, GOLD),
  ...Object.fromEntries(METALS.map((metal) => [`${metal}-bar`, tint(BAR, METAL_COLORS[metal])])),
  ...Object.fromEntries(
    METALS.flatMap((metal) =>
      Object.entries(TOOLS).map(([kind, template]) => [
        `${metal}-${kind}`,
        tint(template, METAL_COLORS[metal]),
      ]),
    ),
  ),
};
