import { palette } from '../../theme/palette.ts';
import { type Art, art, INK, tint } from './core.ts';

// Coins, gems, cloth, crates and chests, and the jewellery set with gems.

// Gold in four steps plus a glint, shared by coins, trim, settings and the crown.
const GOLD = {
  w: palette['durian-100'],
  c: palette['durian-400'],
  a: palette['durian-600'],
  b: palette['durian-700'],
  e: palette['durian-900'],
};

// Coins in three-quarter view: a tall staggered stack, a short stack in front, a loose coin.
export const COINS = art(
  [
    '..kkkkk.........',
    '.kwcccak........',
    'kcccccaak.......',
    'kcaaaabek.......',
    'kbbbbbbek.......',
    '.kcaaaabekkkkk..',
    '.kbbbbbbkwcccak.',
    'kcaaaabkcccccaak',
    'kbbbbbbkcaaaabek',
    '.kcaaaakbbbbbbek',
    '.kbbbbbkcaaaabek',
    'kcaaaabkbbbbbbek',
    '.kkkkkkkcaaaabek',
    'kcccccakbbbbbbek',
    'kaaaabekkcaabek.',
    '.kkkkkk..kkkkk..',
  ],
  GOLD,
);

// A cut gem: table and crown facets on top, the pavilion narrowing to a point.
export const SAPPHIRE = art(
  [
    '................',
    '.....kkkkkk.....',
    '....kcwccaak....',
    '...kccccaabbk...',
    '..kacccaaabbbk..',
    '.kaacccaaabbbek.',
    'kcccccccaaaabbbk',
    'kbbaaaaaabbbbeek',
    '.kaacaaabbbbbek.',
    '..kacaabbbbeek..',
    '...kcaabbbeek...',
    '....kaabbeek....',
    '.....kabeek.....',
    '......kbek......',
    '.......kk.......',
    '................',
  ],
  {
    w: palette['rambutan-50'],
    c: palette['blueberry-300'],
    a: palette['blueberry-500'],
    b: palette['blueberry-700'],
    e: palette['blueberry-900'],
  },
);

// A ribbon-tied roll of cloth: the rolled end shows its layers, and a length unrolls in front.
export const LINEN = art(
  [
    '................',
    '..kkkkkkkkkkkkk.',
    '.kcccaeccccrscck',
    'kcbbbaeaaaarsaak',
    'kcbcbaeaaaarsaak',
    'kcbebaeaaaarsaak',
    'kcbbbaebbbbrsbbk',
    'kaaaabebbbbrsbbk',
    '.kaabeeeeeerseek',
    '..kkkeeeeeeeeeek',
    '...kaabcaabcaabk',
    '..kcabccabccabk.',
    '.kcabccabccabk..',
    'kaabcaabcaabk...',
    'kbbebbbebbbek...',
    '.kkkkkkkkkkkk...',
  ],
  {
    c: palette['rambutan-50'],
    a: palette['rambutan-200'],
    b: palette['rambutan-400'],
    e: palette['rambutan-600'],
    r: palette['lychee-500'],
    s: palette['lychee-700'],
  },
);

// A small woven willow mat in three-quarter view, each strand lit on top and left.
export const WICKER = art(
  [
    '................',
    '.kkkkkkkkkkkkkk.',
    'kaaabcabbaaabcak',
    'kbbbecabebbbecak',
    'kabeeabeeabeeabk',
    'kcabacccacabacck',
    'kcabbaaabcabbaak',
    'kcabebbbecabebbk',
    'kabeeabeeabeeabk',
    'kcccacabacccacak',
    'kaaabcabbaaabcak',
    'kbbbecabebbbecak',
    'kabeeabeeabeeabk',
    'kbbebbbebbbebbek',
    'keeeeeeeeeeeeeek',
    '.kkkkkkkkkkkkkk.',
  ],
  {
    c: palette['durian-500'],
    a: palette['durian-600'],
    b: palette['durian-700'],
    e: palette['persimmon-900'],
  },
);

// A plank crate in three-quarter view, iron straps over its lid and a hasp in front.
export const CRATE = art(
  [
    '................',
    '....kkkkkkkkkkkk',
    '...kicaiiiicaihk',
    '..kicaiiiicaihdk',
    '.kicaiiiicaihddk',
    'khwahcahcahjdddk',
    'khcahbahcahjddjk',
    'kdcadbbdcadjdjdk',
    'kjbajjjjbajjjddk',
    'khcahhhhcahjdddk',
    'khcahhhhcahjddjk',
    'kdcaddddcadjdjdk',
    'kjbajjjjbajjjdk.',
    'khcahhhhcahjdk..',
    'kdcaddddcadjk...',
    'kkkkkkkkkkkk....',
  ],
  {
    i: palette['persimmon-400'],
    h: palette['persimmon-600'],
    d: palette['persimmon-700'],
    j: palette['persimmon-900'],
    w: palette['rambutan-50'],
    c: palette['rambutan-300'],
    a: palette['rambutan-500'],
    b: palette['rambutan-700'],
  },
);

// A treasure chest: a domed lid, gold straps and rim, and a gold lock plate.
export const CHEST = art(
  [
    '................',
    '..kkkkkkkkkkkk..',
    '.kcuyccccccuyak.',
    'kccuyccccccuyabk',
    'kaauyaaaaaauybbk',
    'kaauyaaaaaauybbk',
    'kuuuuuwuyyyyyook',
    'keeeeeuyyoeeeeek',
    'kaauyauqqoauybbk',
    'kaauyayqqoauybbk',
    'kaauyaooooauybbk',
    'kbbuobbbbbbuoeek',
    'kaauyaaaaaauybbk',
    'kaauyaaaaaauybbk',
    'kbbuobbbbbbuoeek',
    'kkkkkkkkkkkkkkkk',
  ],
  {
    c: palette['persimmon-500'],
    a: palette['persimmon-600'],
    b: palette['persimmon-700'],
    e: palette['persimmon-900'],
    w: GOLD.w,
    u: GOLD.c,
    y: GOLD.a,
    o: GOLD.b,
    q: GOLD.e,
  },
);

// A spool of red thread on a wooden reel, a steel needle pushed into the thread.
export const SPOOL = art(
  [
    '..............k.',
    '..kkkkkkkk...kwk',
    '.kiiiiiiiik.knk.',
    'kiiiijjiiihknk..',
    'khhhhhhhhhdnk...',
    '.kkeeeeeeknk....',
    '..kcaaabekk.....',
    '..kcbaabek......',
    '..kcaaabek......',
    '..kcbaabek......',
    '.kkcaaabekk.....',
    'kiiiiiiiiihk....',
    'khhhhhhhhhdk....',
    '.kddddddjjk.....',
    '..kkkkkkkk......',
    '................',
  ],
  {
    c: palette['lychee-300'],
    a: palette['lychee-500'],
    b: palette['lychee-700'],
    e: palette['lychee-900'],
    i: palette['persimmon-400'],
    h: palette['persimmon-600'],
    d: palette['persimmon-800'],
    j: palette['persimmon-900'],
    n: palette['rambutan-300'],
    w: palette['rambutan-50'],
  },
);

// Full gem ramps (light, base, shadow, deep, glint) for cut gems, rings and amulets.
export const GEM_COLORS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  sapphire: {
    w: palette['rambutan-50'],
    c: palette['blueberry-300'],
    a: palette['blueberry-500'],
    b: palette['blueberry-700'],
    e: palette['blueberry-900'],
  },
  emerald: {
    w: palette['rambutan-50'],
    c: palette['pandan-300'],
    a: palette['pandan-500'],
    b: palette['pandan-700'],
    e: palette['pandan-900'],
  },
  ruby: {
    w: palette['rambutan-50'],
    c: palette['lychee-300'],
    a: palette['lychee-600'],
    b: palette['lychee-800'],
    e: palette['mangosteen-900'],
  },
  diamond: {
    w: palette['rambutan-50'],
    c: palette['blueberry-50'],
    a: palette['blueberry-100'],
    b: palette['mangosteen-300'],
    e: palette['mangosteen-500'],
  },
  gold: GOLD,
  clover: {
    w: palette['pandan-50'],
    c: palette['pandan-200'],
    a: palette['pandan-400'],
    b: palette['pandan-600'],
    e: palette['pandan-800'],
  },
};

// The gem keys in rings and amulets: h light, g base, f shadow, v deep, x glint.
export function jewel(template: Art, gem: string): Art {
  const colors = GEM_COLORS[gem] ?? GOLD;
  return tint(template, {
    h: colors.c ?? INK,
    g: colors.a ?? INK,
    f: colors.b ?? INK,
    v: colors.e ?? INK,
    x: colors.w ?? INK,
  });
}

// A gold band in three-quarter view, a big cut gem raised in a setting on top.
export const RING = jewel(
  art(
    [
      '.....kkkkkk.....',
      '....kxhhhgfk....',
      '...khhhggggfk...',
      '..khhgggggfffk..',
      '.kcgggggggffvbk.',
      'kccavffffvvvabbk',
      'kcakkkkkkkkkkbek',
      'kcak........kbek',
      'kaak........kbek',
      'kaak........kbek',
      'kbaak......kbbek',
      '.kbaakkkkkkbbek.',
      '..kcaaaaaaabek..',
      '...kbbbbbbbbk...',
      '....kkkkkkkk....',
      '................',
    ],
    GOLD,
  ),
  'sapphire',
);

// A gold chain looped round, a big cut-gem drop hanging in its setting at the bottom.
export const AMULET = jewel(
  art(
    [
      '....kkkkkkkk....',
      '...kcacacacak...',
      '..kckkkkkkkkck..',
      '.kak........kbk.',
      '.kck........kbk.',
      '..kak......kak..',
      '...kck....kbk...',
      '....kakkkkak....',
      '....kcaaaabk....',
      '...kcxhhggfbk...',
      '..kchhhgggffbk..',
      '..kahhggggffek..',
      '..kbggggfffvek..',
      '...kbggffvvek...',
      '....kbfvvvek....',
      '.....kkkkkk.....',
    ],
    GOLD,
  ),
  'sapphire',
);

// The bruh crown: three tall points over red velvet, a band set with a ruby between sapphires.
export const CROWN = art(
  [
    '..k....kk....k..',
    '.kck..kwck..kck.',
    '.kak..kcak..kak.',
    '.kak.kcaabk.kbk.',
    '.kaakkcaabkkabk.',
    'kcaakhhaabhhkabk',
    'kcaaahhaabhhaabk',
    'kcaaaaaaaaaaaabk',
    'kcccccccccccccak',
    'kbbbbbbbbbbbbbek',
    'kaaraawgggaarabk',
    'karrsagggharrsbk',
    'kaasaaghhhaasabk',
    'kbbbbbbbbbbbbbek',
    '.keeeeeeeeeeeek.',
    '..kkkkkkkkkkkk..',
  ],
  {
    ...GOLD,
    g: palette['lychee-500'],
    h: palette['lychee-800'],
    r: palette['blueberry-400'],
    s: palette['blueberry-700'],
  },
);

export const MATERIAL_ITEMS: Readonly<Record<string, Art>> = {
  coins: COINS,
  sapphire: SAPPHIRE,
  emerald: tint(SAPPHIRE, GEM_COLORS.emerald ?? {}),
  ruby: tint(SAPPHIRE, GEM_COLORS.ruby ?? {}),
  diamond: tint(SAPPHIRE, GEM_COLORS.diamond ?? {}),
  linen: LINEN,
  moonsilk: tint(LINEN, {
    c: palette['rambutan-50'],
    a: palette['mangosteen-200'],
    b: palette['mangosteen-400'],
    e: palette['mangosteen-600'],
    r: palette['blueberry-500'],
    s: palette['blueberry-700'],
  }),
  wicker: WICKER,
  'miner-crate': CRATE,
  'adventurer-chest': tint(CHEST, {
    c: palette['mangosteen-400'],
    a: palette['mangosteen-600'],
    b: palette['mangosteen-800'],
    e: palette['mangosteen-950'],
  }),
  'gold-ring': jewel(RING, 'gold'),
  'sapphire-ring': jewel(RING, 'sapphire'),
  'emerald-ring': jewel(RING, 'emerald'),
  'ruby-ring': jewel(RING, 'ruby'),
  'diamond-ring': jewel(RING, 'diamond'),
  'treasure-ring': tint(jewel(RING, 'gold'), {
    h: palette['durian-100'],
    g: palette['persimmon-400'],
    f: palette['persimmon-600'],
    v: palette['persimmon-800'],
  }),
  'sapphire-amulet': jewel(AMULET, 'sapphire'),
  'emerald-amulet': jewel(AMULET, 'emerald'),
  'ruby-amulet': jewel(AMULET, 'ruby'),
  'diamond-amulet': jewel(AMULET, 'diamond'),
  'sun-amulet': tint(jewel(AMULET, 'diamond'), {
    h: palette['durian-100'],
    g: palette['durian-300'],
    f: palette['persimmon-400'],
    v: palette['persimmon-600'],
  }),
  'summit-charm': jewel(AMULET, 'ruby'),
  'four-leaf-charm': jewel(AMULET, 'clover'),
  'bruh-crown': CROWN,
};
