// Pixel art for the fruitlands. Each sprite is a grid of palette keys; '.' is transparent.
// Pure data (no React Native imports) so tests can validate every grid.
import type { GearSlot, SkillId } from '../game/content.ts';
import { palette } from '../theme/palette.ts';

export type Art = Readonly<{
  w: number;
  h: number;
  rows: readonly string[];
  colors: Readonly<Record<string, string>>;
}>;

export const INK = '#0a0a0a';
const WHITE = palette['rambutan-50'];

function art(rows: readonly string[], colors: Readonly<Record<string, string>>): Art {
  return { w: rows[0]?.length ?? 0, h: rows.length, rows, colors: { k: INK, ...colors } };
}

// Swap a template's palette (tiers of logs, ores, metals and fish share one drawing).
export function tint(base: Art, colors: Readonly<Record<string, string>>): Art {
  return { ...base, colors: { ...base.colors, ...colors } };
}

const WOOD = { h: palette['persimmon-700'], d: palette['persimmon-900'] };
const BRONZE = { a: palette['persimmon-500'], b: palette['persimmon-700'], c: palette['persimmon-300'] };

// --- item templates ---------------------------------------------------------

// A chunky log on its side: the cut end with its rings, bark, a broken-off branch.
const LOG = art(
  [
    '............',
    '..........k.',
    '.........kck',
    '..kkkkkkkkbk',
    '.kddkcccccak',
    'kdeedkaaaaak',
    'kdoedkabaaak',
    'kdeedkaaabak',
    'kdeedkaaaaak',
    '.kddkbbbbbbk',
    '..kkkkkkkkk.',
    '............',
  ],
  {
    a: palette['persimmon-700'],
    b: palette['persimmon-900'],
    c: palette['persimmon-500'],
    d: palette['persimmon-200'],
    e: palette['persimmon-400'],
    o: palette['persimmon-600'],
  },
);

const ORE = art(
  [
    '............',
    '............',
    '....kkkk....',
    '..kkccaakk..',
    '.kccaoaaabk.',
    '.kcaoppaaabk',
    'kcaaaoaaoabk',
    'kaaaaaaopobk',
    'kbaoaaaaobbk',
    '.kbbaaabbbk.',
    '..kkkkkkkk..',
    '............',
  ],
  {
    a: palette['rambutan-600'],
    b: palette['rambutan-800'],
    c: palette['rambutan-400'],
    o: palette['persimmon-500'],
    p: palette['persimmon-300'],
  },
);

// A rock with a crystal shard growing out of it: moonstone and sunstone.
const CRYSTAL_ORE = art(
  [
    '......kk....',
    '.....kpok...',
    '.....kpok...',
    '....kkpokk..',
    '..kkcpookbk.',
    '.kccakokaabk',
    'kcaaakkaaabk',
    'kaaoaaaaaabk',
    'kbaaaaaaobbk',
    '.kbbaaabbbk.',
    '..kkkkkkkk..',
    '............',
  ],
  {
    a: palette['rambutan-600'],
    b: palette['rambutan-800'],
    c: palette['rambutan-400'],
    o: palette['mangosteen-300'],
    p: palette['rambutan-50'],
  },
);

// An ingot: a lit top face narrowing to the back, the front in shadow.
const BAR = art(
  [
    '............',
    '............',
    '............',
    '...kkkkkk...',
    '..kccccccak.',
    '.kccccccccak',
    'kkkkkkkkkkkk',
    'kcaaaaaaaabk',
    'kbbbbbbbbbbk',
    'kkkkkkkkkkkk',
    '............',
    '............',
  ],
  { a: palette['persimmon-500'], b: palette['persimmon-700'], c: palette['persimmon-300'] },
);

// One drawing per species, so each reads by shape: cooking only browns the colours.
const TROUT = art(
  [
    '............',
    '............',
    '............',
    '...kkkkk..kk',
    '..kaasaakkbk',
    '.kkaaaasabbk',
    'kaaasaaaabk.',
    'kcccccccabbk',
    '.kcccccbkkbk',
    '..kkkkkk..kk',
    '............',
    '............',
  ],
  {
    a: palette['pandan-500'],
    b: palette['pandan-700'],
    c: palette['dragonfruit-200'],
    s: palette['pandan-800'],
  },
);
const FISH = TROUT;

const FISH_ART: Readonly<Record<string, Art>> = {
  minnow: art(
    [
      '............',
      '............',
      '............',
      '............',
      '...kkkkk..kk',
      '..kaaaaakkbk',
      '.kakaaaaabk.',
      '.kcccccccbkk',
      '..kkkkkkk..k',
      '............',
      '............',
      '............',
    ],
    { a: palette['rambutan-400'], b: palette['rambutan-600'], c: palette['rambutan-200'] },
  ),
  trout: TROUT,
  eel: art(
    [
      '............',
      '............',
      '.kkk........',
      'kakak.......',
      'kcaabk...kk.',
      '.kccabk.kabk',
      '..kkcabkcabk',
      '....kcaacabk',
      '.....kccabk.',
      '......kkkk..',
      '............',
      '............',
    ],
    { a: palette['mangosteen-700'], b: palette['mangosteen-900'], c: palette['mangosteen-400'] },
  ),
  swordfish: art(
    [
      '............',
      '............',
      '......kk....',
      '.....kbbk...',
      '....kaaaakkk',
      'kkkkaakaaabk',
      '.kkcccccabbk',
      '...kccccbkkk',
      '....kkkkk...',
      '............',
      '............',
      '............',
    ],
    { a: palette['blueberry-600'], b: palette['blueberry-800'], c: palette['blueberry-200'] },
  ),
  moonray: art(
    [
      '............',
      '.....kk.....',
      '....kcak....',
      '...kcaaak...',
      '..kcakakak..',
      '.kcaaaaaabk.',
      'kcaaaaaaaabk',
      '.kbaaaaabbk.',
      '..kkbbbbkk..',
      '....kbk.....',
      '.....kbk....',
      '......kk....',
    ],
    { a: palette['mangosteen-300'], b: palette['mangosteen-600'], c: palette['blueberry-100'] },
  ),
  sunfish: art(
    [
      '.......kk...',
      '......kcak..',
      '...kkkcaak..',
      '..kccaaaaak.',
      '.kcaaaaaaabk',
      'kcakaaaaaabk',
      'kcaaaaaaaabk',
      '.kaaaaaaaabk',
      '..kbbaaabbk.',
      '...kkkbaabk.',
      '......kbbk..',
      '.......kk...',
    ],
    { a: palette['durian-400'], b: palette['persimmon-600'], c: palette['durian-100'] },
  ),
};

// A flat blade with a bright cutting edge, on a diagonal haft like the pickaxe.
const AXE = art(
  [
    '.....kkk....',
    '....kccak...',
    '...kccaabk..',
    '..kccaaabkk.',
    '.kccaaabkhdk',
    'kcckaabkhdk.',
    'kck.kbkhdk..',
    '.k...khdk...',
    '....khdk....',
    '...khdk.....',
    '..khdk......',
    '..kdk.......',
  ],
  { ...WOOD, ...BRONZE },
);

const PICKAXE = art(
  [
    '..kkkk......',
    '.kccaakk....',
    'kcakkbaak...',
    'kak..khbak..',
    'kk..khdkbak.',
    '...khdk.kbak',
    '..khdk...kbk',
    '.khdk.....kk',
    'khdk........',
    'kdk.........',
    '.k..........',
    '............',
  ],
  { ...WOOD, ...BRONZE },
);

const HARPOON = art(
  [
    '.........kk.',
    '........kcak',
    '.......kcabk',
    '...kk.kcabk.',
    '...kbkkabk..',
    '....kbhdk...',
    '...khdkbk...',
    '..khdk.kk...',
    '.khdk.......',
    'khdk........',
    'kdk.........',
    '.k..........',
  ],
  { ...WOOD, ...BRONZE },
);

const SHEARS = art(
  [
    '.kk......kk.',
    '.kck....kck.',
    '..kck..kck..',
    '...kckkck...',
    '....kbbk....',
    '...khkkhk...',
    '..khk..khk..',
    '.khhk..khhk.',
    'kh..hkkh..hk',
    'kh..hkkh..hk',
    '.khhk..khhk.',
    '..kk....kk..',
  ],
  { ...BRONZE, h: palette['lychee-500'] },
);

const METAL_COLORS = {
  bronze: { a: palette['persimmon-500'], b: palette['persimmon-700'], c: palette['persimmon-300'] },
  iron: { a: palette['rambutan-500'], b: palette['rambutan-700'], c: palette['rambutan-300'] },
  steel: { a: palette['blueberry-200'], b: palette['mangosteen-600'], c: palette['rambutan-50'] },
  mithril: { a: palette['blueberry-500'], b: palette['blueberry-800'], c: palette['blueberry-300'] },
  moonsteel: { a: palette['rambutan-100'], b: palette['mangosteen-500'], c: palette['rambutan-50'] },
  sunsteel: { a: palette['durian-400'], b: palette['persimmon-600'], c: palette['durian-100'] },
} as const;

// --- unique items -------------------------------------------------------------

const RAMBUTAN = art(
  [
    '....g..g....',
    '..g.kkkk.g..',
    '...kaaaaak..',
    '.gkacaaaabkg',
    '..kaccaaabk.',
    '.gkaaaaaabkg',
    '..kaaaaabbk.',
    '.gkbaaabbbkg',
    '..kbbbbbbk..',
    '...gkkkkg...',
    '............',
    '............',
  ],
  { a: palette['lychee-500'], b: palette['lychee-700'], c: palette['lychee-300'], g: palette['pandan-400'] },
);

const MANGOSTEEN = art(
  [
    '....gggg....',
    '...ghgghg...',
    '..kkkhhkkk..',
    '.kaacaaaabk.',
    'kaaccaaaaabk',
    'kaacaaaaaabk',
    'kaaaaaaaabbk',
    'kaaaaaaabbbk',
    '.kaaaaabbbk.',
    '..kbbbbbbk..',
    '...kkkkkk...',
    '............',
  ],
  {
    a: palette['mangosteen-700'],
    b: palette['mangosteen-900'],
    c: palette['mangosteen-500'],
    g: palette['pandan-400'],
    h: palette['pandan-600'],
  },
);

// A spiky green husk: thorns break the outline all the way round.
const DURIAN = art(
  [
    '.....hh.....',
    '..k.khhk.k..',
    '.kakkaakkak.',
    '..kcabaabak.',
    'kkcabaabaakk',
    '.kabaabaabk.',
    'kkbaabaabakk',
    '.kaabaabaak.',
    '..kbbaabbk..',
    '.kak.kk.kak.',
    '..k......k..',
    '............',
  ],
  {
    a: palette['pandan-500'],
    b: palette['pandan-700'],
    c: palette['pandan-300'],
    h: palette['persimmon-800'],
  },
);

const DRAGONFRUIT = art(
  [
    '.....g......',
    '....kgk.....',
    '..g.kak.g...',
    '...kaaaak...',
    '.gkacaagakg.',
    '..kccaaaabk.',
    '.gkaaagaabkg',
    '..kaaaaabbk.',
    '..gkaagabkg.',
    '...kbbbbk...',
    '....kkkk....',
    '............',
  ],
  {
    a: palette['dragonfruit-400'],
    b: palette['dragonfruit-600'],
    c: palette['dragonfruit-200'],
    g: palette['pandan-400'],
  },
);

// A gold coin face-on, its raised rim catching the light top-left.
const COINS = art(
  [
    '............',
    '....kkkk....',
    '..kkccaakk..',
    '.kccbbbbaak.',
    '.kcbcaaabak.',
    'kcbcaaaaabak',
    'kcbaaaaaabak',
    'kcbaaaaaabbk',
    '.kabaaaabbk.',
    '.kaabbbbbbk.',
    '..kkbbbbkk..',
    '....kkkk....',
  ],
  { a: palette['durian-500'], b: palette['durian-700'], c: palette['durian-200'] },
);

const SAPPHIRE = art(
  [
    '............',
    '............',
    '...kkkkkk...',
    '..kccacaabk.',
    '.kcaaaaaaabk',
    '.kbbbbbbbbbk',
    '..kaaaaaabk.',
    '...kaaaabk..',
    '....kaabk...',
    '.....kbk....',
    '......k.....',
    '............',
  ],
  { a: palette['blueberry-600'], b: palette['blueberry-800'], c: palette['blueberry-300'] },
);

const NEST = art(
  [
    '............',
    '............',
    '....kk.kk...',
    '...kwwkwwk..',
    '.kkkwwkwwkk.',
    'kabkkkkkkbak',
    'kbabababbabk',
    '.kbabababak.',
    '..kkbbbbkk..',
    '....kkkk....',
    '............',
    '............',
  ],
  { a: palette['persimmon-600'], b: palette['persimmon-800'], w: palette['blueberry-100'] },
);

const BOTTLE = art(
  [
    '............',
    '.....kk.....',
    '....kffk....',
    '....kffk....',
    '....kcak....',
    '...kcaaak...',
    '..kcawwaak..',
    '..kcawwwak..',
    '..kaawwaak..',
    '..kaaaaabk..',
    '...kkkkkk...',
    '............',
  ],
  {
    a: palette['pandan-500'],
    b: palette['pandan-700'],
    c: palette['pandan-200'],
    f: palette['persimmon-700'],
    w: palette['durian-200'],
  },
);

const SEED = art(
  [
    '............',
    '..........w.',
    '.........www',
    '.....kk...w.',
    '....kcak....',
    '...kccaak...',
    '...kcaaak...',
    '...kaaabk...',
    '...kaabbk...',
    '....kbbk....',
    '.....kk.....',
    '............',
  ],
  { a: palette['durian-500'], b: palette['durian-700'], c: palette['durian-200'], w: WHITE },
);

// --- skill and interface icons --------------------------------------------------

const ANVIL = art(
  [
    '............',
    '............',
    '............',
    '.kkkkkkkkkk.',
    'kccccccaaabk',
    '.kkaaaaaabkk',
    '...kaaaabk..',
    '....kaabk...',
    '...kaaaabk..',
    '..kbbbbbbbk.',
    '..kkkkkkkkk.',
    '............',
  ],
  { a: palette['rambutan-700'], b: palette['rambutan-900'], c: palette['rambutan-400'] },
);

const POT = art(
  [
    '............',
    '....w..w....',
    '.....w..w...',
    '..kkkkkkkk..',
    '.kkccaaaabkk',
    '..kcaaaaabk.',
    '..kaaaaaabk.',
    '..kbaaaabbk.',
    '...kkkkkkk..',
    '...f.ff.f...',
    '..fyf.fyf...',
    '...f...f....',
  ],
  {
    a: palette['rambutan-700'],
    b: palette['rambutan-900'],
    c: palette['rambutan-500'],
    w: palette['rambutan-300'],
    f: palette['persimmon-500'],
    y: palette['durian-400'],
  },
);

// A boot from the side: a folded cuff, the toe forward, a heeled sole.
const BOOT = art(
  [
    '............',
    '.kkkkkkk....',
    '.kcccccck...',
    '..kcaabk....',
    '..kcaabk....',
    '..kcaabk....',
    '..kcaaabkkk.',
    '..kcaaaaaabk',
    '..kcaaaaaabk',
    '..kssssssssk',
    '..kssk.kkkk.',
    '..kkkk......',
  ],
  {
    a: palette['blueberry-600'],
    b: palette['blueberry-800'],
    c: palette['blueberry-400'],
    s: palette['longan-800'],
  },
);

const CHEST = art(
  [
    '............',
    '............',
    '..kkkkkkkk..',
    '.kccaaaaabk.',
    '.kaaaaaaabk.',
    '.kkkkyykkkk.',
    '.kbaayyaabk.',
    '.kaaakkaabk.',
    '.kaaaaaaabk.',
    '.kbbbbbbbbk.',
    '.kkkkkkkkkk.',
    '............',
  ],
  {
    a: palette['persimmon-600'],
    b: palette['persimmon-800'],
    c: palette['persimmon-400'],
    y: palette['durian-400'],
  },
);

const SCROLL = art(
  [
    '............',
    '.kkkkkkkkk..',
    'kcbwwwwwwk..',
    '.kwwkkkkwk..',
    '.kwwwwwwwk..',
    '.kwkkkkwwk..',
    '.kwwwwwwwk..',
    '.kwkkkkkwk..',
    '.kwwwwwwwkk.',
    '..kwwwwwwbck',
    '..kkkkkkkkk.',
    '............',
  ],
  { w: palette['durian-200'], b: palette['persimmon-700'], c: palette['persimmon-500'] },
);

const MAP = art(
  [
    '............',
    '............',
    '.kkkkkkkkkk.',
    '.kggbbggggk.',
    '.kgbbggrgrk.',
    '.kbbggggrgk.',
    '.kbggggrgrk.',
    '.kggggbbggk.',
    '.kgggbbbggk.',
    '.kkkkkkkkkk.',
    '............',
    '............',
  ],
  { g: palette['pandan-500'], b: palette['blueberry-500'], r: palette['lychee-500'] },
);

const HOUSE = art(
  [
    '.....kk.....',
    '....krrk....',
    '...krrrrk...',
    '..krrrrrrk..',
    '.krrrrrrrrk.',
    'kkkkkkkkkkkk',
    '.kaaaaaaaak.',
    '.kawwaaddak.',
    '.kawwaaddak.',
    '.kaaaaaddak.',
    '.kbbbbbddbk.',
    '.kkkkkkkkkk.',
  ],
  {
    r: palette['lychee-500'],
    a: palette['durian-300'],
    b: palette['durian-600'],
    w: palette['blueberry-300'],
    d: palette['persimmon-800'],
  },
);

const STATS = art(
  [
    '............',
    '............',
    '........kkk.',
    '........kgk.',
    '....kkk.kgk.',
    '....kgk.kgk.',
    'kkk.kgk.kgk.',
    'kgk.kgk.kgk.',
    'kgk.kgk.kgk.',
    'kgk.kgk.kgk.',
    'kkkkkkkkkkk.',
    '............',
  ],
  { g: palette['pandan-400'] },
);

// Two bare footprints, toes and all.
const STEPS = art(
  [
    '.......a.a.a',
    '......a.....',
    '.......aaaa.',
    '......aaaaa.',
    'a.a.a..aaaa.',
    '........aa..',
    '.aaaa...aaa.',
    'aaaaa...aaa.',
    '.aaaa....a..',
    '..aa........',
    '..aaa.......',
    '..aaa.......',
  ],
  { a: palette['durian-400'] },
);

// --- scenery --------------------------------------------------------------------

export const TREE = art(
  [
    '....kkkk....',
    '..kkccaakk..',
    '.kccaaaaaabk',
    'kcaaaaaaabbk',
    'kcaaacaaaabk',
    'kaaaccaaabbk',
    'kaaaaaaabbbk',
    '.kaaaaabbbk.',
    '..kbbbbbbk..',
    '...kkhdkk...',
    '....khdk....',
    '....khdk....',
    '....khdk....',
    '...khhddk...',
  ],
  { ...WOOD, a: palette['pandan-500'], b: palette['pandan-700'], c: palette['pandan-300'] },
);

export const PINE = art(
  [
    '....kk....',
    '...kcak...',
    '..kcaabk..',
    '...kabk...',
    '..kcaaabk.',
    '.kcaaaabbk',
    '..kaaabk..',
    '.kcaaaabk.',
    'kcaaaaabbk',
    'kkkaaabkkk',
    '...kbbk...',
    '...khdk...',
    '...khdk...',
  ],
  { ...WOOD, a: palette['pandan-600'], b: palette['pandan-800'], c: palette['pandan-400'] },
);

export const ROCK = art(
  [
    '...kkkkk....',
    '..kccaaakk..',
    '.kcaaoaaabk.',
    'kcaopaaaaabk',
    'kaaaaaoaabbk',
    'kbaaaapoabbk',
    'kbbbaaaabbbk',
    '.kkkkkkkkkk.',
  ],
  {
    a: palette['rambutan-600'],
    b: palette['rambutan-800'],
    c: palette['rambutan-400'],
    o: palette['persimmon-400'],
    p: palette['persimmon-200'],
  },
);

export const BUSH = art(
  [
    '...kkkk.....',
    '.kkccaakkk..',
    'kccafaaaaak.',
    'kaaaaafaabbk',
    'kafaaaaafabk',
    'kaaafaaabbbk',
    '.kbbbbbbbbk.',
    '..kkkkkkkk..',
  ],
  { a: palette['pandan-500'], b: palette['pandan-700'], c: palette['pandan-300'], f: palette['lychee-500'] },
);

export const CACTUS = art(
  [
    '....ff....',
    '...kcak...',
    '.kkkcak.kk',
    'kcakaakkck',
    'kaakaakkak',
    '.kkkaabkak',
    '...kaabkkk',
    '...kaabk..',
    '...kaabk..',
    '...kaabk..',
    '...kaabk..',
    '..kkkkkkk.',
  ],
  {
    a: palette['pandan-500'],
    b: palette['pandan-700'],
    c: palette['pandan-300'],
    f: palette['dragonfruit-400'],
  },
);

export const REEDS = art(
  [
    '.d...d..',
    '.d.d.d..',
    '.a.d.a.d',
    '.a.a.a.d',
    'aa.a.a.a',
    '.a.a.aa.',
    '.a.aa.a.',
    '.aa.a.a.',
    '..a.a.a.',
    '..a.a.a.',
  ],
  { a: palette['pandan-500'], d: palette['persimmon-800'] },
);

export const BOAT = art(
  [
    '......k.......',
    '......kw......',
    '......kww.....',
    '......kwww....',
    '......k.......',
    'kkkkkkkkkkkkkk',
    '.khhhhhhhhhhk.',
    '..kddddddddk..',
  ],
  { ...WOOD, w: palette['rambutan-50'] },
);

export { ANVIL, HOUSE };

// --- the bruh -------------------------------------------------------------------

type SkinColors = Readonly<{ a: string; b: string; c: string }>;
const SKIN_COLORS: Readonly<Record<string, SkinColors>> = {
  original: { a: palette['bruh-base'], b: palette['durian-600'], c: palette['durian-200'] },
  pandan: { a: palette['pandan-300'], b: palette['pandan-500'], c: palette['pandan-100'] },
  durian: { a: palette['durian-400'], b: palette['durian-600'], c: palette['durian-200'] },
  mangosteen: { a: palette['mangosteen-300'], b: palette['mangosteen-500'], c: palette['mangosteen-100'] },
  dragonfruit: { a: palette['dragonfruit-200'], b: palette['dragonfruit-400'], c: palette['dragonfruit-50'] },
  blueberry: { a: palette['blueberry-300'], b: palette['blueberry-500'], c: palette['blueberry-100'] },
};

// Accessory overlays (16×16, '.' leaves the face showing).
const ACCESSORIES: Readonly<
  Record<string, Readonly<{ rows: readonly string[]; colors: Record<string, string> }>>
> = {
  pandan: {
    rows: [
      '.......gg.......',
      '......gG.g......',
      '.......G........',
      '................',
      '..oooooooooooo..',
    ],
    colors: { g: palette['pandan-400'], G: palette['pandan-600'], o: palette['persimmon-400'] },
  },
  durian: {
    rows: ['...s...s...s....', '...ss..ss..ss...', '....s...s...s...'],
    colors: { s: palette['durian-700'] },
  },
  mangosteen: {
    rows: ['.....pppppp.....', '...pppppppppp...', '..pPPPPPPPPPPp..', '..pppppppppppp..'],
    colors: { p: palette['mangosteen-600'], P: palette['mangosteen-400'] },
  },
  dragonfruit: {
    rows: [
      '................',
      '................',
      '....g......g....',
      '................',
      '................',
      '................',
      '................',
      '................',
      '.g............g.',
      '................',
      '................',
      '................',
      '.....g....g.....',
    ],
    colors: { g: palette['pandan-400'] },
  },
  blueberry: {
    rows: ['......bbbb......', '....bbBBBBbb....', '...bbBBBBBBbb...', 'bbbbbbbbbbbbbbbb'],
    colors: { b: palette['blueberry-600'], B: palette['blueberry-400'] },
  },
};

const BRUH_SIZE = 16;
const bruhCache = new Map<string, Art>();

export function bruhArt(skin: string, asleep = false): Art {
  const key = `${skin}:${asleep}`;
  const cached = bruhCache.get(key);
  if (cached) return cached;
  const colors = SKIN_COLORS[skin] ?? SKIN_COLORS.original;
  const grid: string[][] = [];
  const center = 7.5;
  for (let y = 0; y < BRUH_SIZE; y += 1) {
    const row: string[] = [];
    for (let x = 0; x < BRUH_SIZE; x += 1) {
      const distance = Math.hypot(x - center, y - center + 0.5);
      if (distance > 7.6) row.push('.');
      else if (distance > 6.6) row.push('k');
      else if (x + y >= 19 && distance > 4.8) row.push('b');
      else if (x + y <= 8 && distance > 4.2) row.push('c');
      else row.push('a');
    }
    grid.push(row);
  }
  const set = (x: number, y: number, value: string): void => {
    const row = grid[y];
    if (row && x >= 0 && x < BRUH_SIZE) row[x] = value;
  };
  for (const x of [4, 5, 10, 11]) set(x, asleep ? 7 : 6, 'k');
  for (let x = 5; x <= 10; x += 1) set(x, 10, 'm');
  const accessory = ACCESSORIES[skin];
  const extra: Record<string, string> = {};
  if (accessory) {
    accessory.rows.forEach((line, y) => {
      for (let x = 0; x < line.length; x += 1) {
        const value = line[x];
        if (value && value !== '.') set(x, y, value);
      }
    });
    Object.assign(extra, accessory.colors);
  }
  const result = art(
    grid.map((row) => row.join('')),
    { ...colors, ...extra, m: palette['bruh-mouth'] },
  );
  bruhCache.set(key, result);
  return result;
}

// --- item lookup ------------------------------------------------------------------

const LOG_TINTS: Readonly<Record<string, Record<string, string>>> = {
  'pandan-logs': {
    a: palette['pandan-600'],
    b: palette['pandan-800'],
    c: palette['pandan-400'],
    d: palette['durian-300'],
    e: palette['durian-500'],
    o: palette['durian-700'],
  },
  'longan-logs': {
    a: palette['persimmon-700'],
    b: palette['persimmon-900'],
    c: palette['persimmon-500'],
    d: palette['persimmon-200'],
    e: palette['persimmon-400'],
    o: palette['persimmon-600'],
  },
  'mahogany-logs': {
    a: palette['lychee-700'],
    b: palette['lychee-900'],
    c: palette['lychee-500'],
    d: palette['lychee-300'],
    e: palette['lychee-500'],
    o: palette['lychee-700'],
  },
  'moonwood-logs': {
    a: palette['mangosteen-300'],
    b: palette['mangosteen-600'],
    c: palette['rambutan-100'],
    d: palette['blueberry-100'],
    e: palette['mangosteen-200'],
    o: palette['mangosteen-400'],
  },
  'starwood-logs': {
    a: palette['durian-600'],
    b: palette['persimmon-800'],
    c: palette['durian-400'],
    d: palette['durian-100'],
    e: palette['durian-300'],
    o: palette['persimmon-500'],
  },
  'dragonwood-logs': {
    a: palette['dragonfruit-700'],
    b: palette['dragonfruit-900'],
    c: palette['dragonfruit-500'],
    d: palette['durian-300'],
    e: palette['dragonfruit-300'],
    o: palette['dragonfruit-500'],
  },
};
const ORE_TINTS: Readonly<Record<string, Record<string, string>>> = {
  'copper-ore': { o: palette['persimmon-500'], p: palette['persimmon-300'] },
  'tin-ore': { o: palette['rambutan-200'], p: palette['rambutan-50'] },
  'iron-ore': { o: palette['lychee-700'], p: palette['lychee-400'] },
  coal: {
    a: palette['longan-700'],
    b: palette['longan-900'],
    c: palette['longan-500'],
    o: INK,
    p: palette['longan-950'],
  },
  'mithril-ore': { o: palette['blueberry-500'], p: palette['blueberry-200'] },
  'gold-ore': { o: palette['durian-400'], p: palette['durian-100'] },
};
const COOKED = {
  a: palette['persimmon-500'],
  b: palette['persimmon-700'],
  c: palette['durian-300'],
  s: palette['persimmon-700'],
};

// --- materials, gems and chests (v3) ------------------------------------------------

// A sheaf: blue flowers on top, stalks tied at the waist.
const FLAX = art(
  [
    '..b.b..b.b..',
    '.bwbwbbwbwb.',
    '..kbgbbgbk..',
    '...kgaagk...',
    '...kagagk...',
    '....kagk....',
    '...kddddk...',
    '....kagk....',
    '...kagagk...',
    '..kagaagak..',
    '..kgagagak..',
    '...kkkkkk...',
  ],
  {
    b: palette['blueberry-400'],
    w: palette['blueberry-100'],
    g: palette['pandan-400'],
    a: palette['pandan-600'],
    d: palette['persimmon-700'],
  },
);
// Cattails: brown seed heads on green stalks, tied like the flax.
const REEDS_BUNDLE = art(
  [
    '..k..k..k...',
    '.kck.kckkck.',
    '.kbkkcbkkbk.',
    '.kbkkbbkkbk.',
    '.kbkkbbkkbk.',
    '..kgkbkkgk..',
    '...kgkgkk...',
    '...kddddk...',
    '....kagk....',
    '...kagagk...',
    '..kagaagak..',
    '...kkkkkk...',
  ],
  {
    b: palette['persimmon-800'],
    c: palette['persimmon-600'],
    g: palette['pandan-400'],
    a: palette['pandan-600'],
    d: palette['durian-600'],
  },
);

// Folded cloth, two layers with their folds to the right.
const LINEN = art(
  [
    '............',
    '............',
    '...kkkkkkkk.',
    '..kccccccck.',
    '.kcaaaaaaak.',
    '.kkkkkkkkkk.',
    '.kcccccccack',
    'kcaaaaaaaabk',
    'kkkkkkkkkkbk',
    'kcccccccckbk',
    'kbbbbbbbbbkk',
    '.kkkkkkkkkk.',
  ],
  { a: palette['rambutan-200'], b: palette['rambutan-400'], c: palette['rambutan-50'] },
);

const WICKER = art(
  [
    '............',
    '.kkkkkkkkkk.',
    '.kcbcbcbcbk.',
    '.kbcbcbcbck.',
    '.kcbcbcbcbk.',
    '.kbcbcbcbck.',
    '.kcbcbcbcbk.',
    '.kbcbcbcbck.',
    '.kcbcbcbcbk.',
    '.kkkkkkkkkk.',
    '............',
    '............',
  ],
  { b: palette['durian-700'], c: palette['durian-500'] },
);

const CRATE = art(
  [
    '............',
    '.kkkkkkkkkk.',
    '.kcaaaaaabk.',
    '.kkkkkkkkkk.',
    '.kakaaaakak.',
    '.kaakaakaak.',
    '.kaaakkaaak.',
    '.kaakaakaak.',
    '.kakaaaakak.',
    '.kkkkkkkkkk.',
    '.kbbbbbbbbk.',
    '.kkkkkkkkkk.',
  ],
  { a: palette['persimmon-600'], b: palette['persimmon-800'], c: palette['persimmon-400'] },
);

const GEM_COLORS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  sapphire: { a: palette['blueberry-600'], b: palette['blueberry-800'], c: palette['blueberry-300'] },
  emerald: { a: palette['pandan-500'], b: palette['pandan-800'], c: palette['pandan-200'] },
  ruby: { a: palette['lychee-600'], b: palette['lychee-800'], c: palette['lychee-300'] },
  diamond: { a: palette['blueberry-100'], b: palette['mangosteen-400'], c: palette['rambutan-50'] },
  gold: { a: palette['durian-500'], b: palette['durian-700'], c: palette['durian-200'] },
  clover: { a: palette['pandan-400'], b: palette['pandan-700'], c: palette['pandan-200'] },
};

// --- gear templates ---------------------------------------------------------------------

const HAT = art(
  [
    '............',
    '............',
    '....kkkk....',
    '...kccaak...',
    '...kcaaak...',
    '..kkddddkk..',
    '.kccaaaaabk.',
    'kcaaaaaaaabk',
    '.kkkkkkkkkk.',
    '............',
    '............',
    '............',
  ],
  { a: palette['durian-400'], b: palette['durian-600'], c: palette['durian-200'], d: palette['lychee-500'] },
);

// A knit beanie: a pom-pom, a rolled and ribbed cuff.
const CAP = art(
  [
    '.....kk.....',
    '....kwvk....',
    '....kkkk....',
    '...kcaaak...',
    '..kcaaaabk..',
    '.kcaaaaaabk.',
    '.kcaaaaaabk.',
    '.kkkkkkkkkk.',
    '.kdbdbdbdbk.',
    '.kdbdbdbdbk.',
    '.kkkkkkkkkk.',
    '............',
  ],
  {
    a: palette['lychee-500'],
    b: palette['lychee-700'],
    c: palette['lychee-300'],
    d: palette['lychee-800'],
    w: palette['rambutan-50'],
    v: palette['rambutan-200'],
  },
);

// A chef's toque: a puffed top over a pleated band.
const CHEF_HAT = art(
  [
    '....kkkk....',
    '.kkkcccakkk.',
    'kccakcaakaak',
    'kcaaaaaaaabk',
    'kcaaaaaaaabk',
    '.kcaaaaaabk.',
    '..kkkkkkkk..',
    '..kcbcbcbk..',
    '..kcbcbcbk..',
    '..kcbcbcbk..',
    '..kkkkkkkk..',
    '............',
  ],
  { a: palette['rambutan-100'], b: palette['rambutan-300'], c: palette['rambutan-50'] },
);

// A hard hat from the front, its lamp lit on the forehead.
const HELMET = art(
  [
    '............',
    '............',
    '....kkkk....',
    '..kkcaaakk..',
    '.kcakkkkkak.',
    'kcaakwwykabk',
    'kcaakwyykabk',
    'kcaakkkkkabk',
    'kkkkkkkkkkkk',
    'kbbbbbbbbbbk',
    '.kkkkkkkkkk.',
    '............',
  ],
  {
    a: palette['durian-500'],
    b: palette['durian-700'],
    c: palette['durian-300'],
    w: palette['rambutan-50'],
    y: palette['durian-200'],
  },
);

// A glove, palm out: three fingers, the thumb to the side, a cuff.
const GLOVES = art(
  [
    '...kk.kk.kk.',
    '..kcakcakcak',
    '..kcakcakcak',
    '..kcakcakcak',
    '.kkcaaaaaabk',
    'kcakaaaaaabk',
    'kcaaaaaaaabk',
    '.kcaaaaaaabk',
    '..kcaaaaabk.',
    '..kddddddk..',
    '..kddddddk..',
    '..kkkkkkkk..',
  ],
  {
    a: palette['rambutan-200'],
    b: palette['rambutan-400'],
    c: palette['rambutan-50'],
    d: palette['rambutan-400'],
  },
);

// Trousers: a belt and buckle, two legs, darker cuffs.
const TROUSERS = art(
  [
    '............',
    'kkkkkkkkkkkk',
    'kddddyyddddk',
    'kcaaaaaaaabk',
    'kcaaaakaaabk',
    'kcaabkkcaabk',
    'kcabk..kcabk',
    'kcabk..kcabk',
    'kcabk..kcabk',
    'kbbbk..kbbbk',
    'kkkkk..kkkkk',
    '............',
  ],
  {
    a: palette['pandan-700'],
    b: palette['pandan-900'],
    c: palette['pandan-500'],
    d: palette['persimmon-800'],
    y: palette['durian-400'],
  },
);

// An open vest: shoulders, armholes and buttons down both fronts.
const VEST = art(
  [
    '............',
    '..kkk..kkk..',
    '.kcck..kaak.',
    'kccak..kaabk',
    'kcaabkkbaabk',
    '.kcaakkaabk.',
    '.kcadkkdabk.',
    '.kcaakkaabk.',
    '.kcadkkdabk.',
    '.kcaakkaabk.',
    '.kkkkkkkkkk.',
    '............',
  ],
  {
    a: palette['blueberry-600'],
    b: palette['blueberry-800'],
    c: palette['blueberry-400'],
    d: palette['durian-300'],
  },
);

// A bib apron: the neck loop, waist ties, a pocket on the skirt.
const APRON = art(
  [
    '....kkkk....',
    '...k....k...',
    '...k....k...',
    '...kkkkkk...',
    '...kcaabk...',
    '..kkcaabkk..',
    '.k.kcaabk.k.',
    '..kcaaaaabk.',
    '..kcaaaaabk.',
    '..kcadddabk.',
    '..kcaaaaabk.',
    '..kkkkkkkkk.',
  ],
  {
    a: palette['persimmon-700'],
    b: palette['persimmon-900'],
    c: palette['persimmon-500'],
    d: palette['longan-800'],
  },
);

// A backpack: carry loop, rounded flap with a buckle, front pocket.
const PACK = art(
  [
    '....kkkk....',
    '...kk..kk...',
    '..kkkkkkkk..',
    '.kccccaaaak.',
    'kccaaaaaaabk',
    'kcaaakkaaabk',
    'kkkkkyykkkkk',
    'kcakaaaakabk',
    'kcakaaaakabk',
    'kcakkkkkkabk',
    'kbbbbbbbbbbk',
    '.kkkkkkkkkk.',
  ],
  {
    a: palette['durian-600'],
    b: palette['durian-800'],
    c: palette['durian-400'],
    y: palette['persimmon-500'],
  },
);

// A cape from behind: gold collar and clasp, its lining showing as it swings.
const CAPE = art(
  [
    '...kkkkkk...',
    '..kddyyddk..',
    '.kkkkkkkkkk.',
    '.kcaabaalk..',
    '.kcaabaaalk.',
    'kcaabaaaalk.',
    'kcaabaaaaalk',
    'kcaabaaaaalk',
    'kcaaabaaaalk',
    'kcaaabaaallk',
    'kbbbbbbklllk',
    'kkkkkkkkkkk.',
  ],
  {
    a: palette['lychee-600'],
    b: palette['lychee-800'],
    c: palette['lychee-400'],
    d: palette['durian-400'],
    y: palette['durian-200'],
    l: palette['durian-500'],
  },
);

const RING = art(
  [
    '............',
    '............',
    '.....kk.....',
    '....khgk....',
    '...kkggkk...',
    '..kcakkabk..',
    '..kak..kbk..',
    '..kak..kbk..',
    '..kbakkabk..',
    '...kaaaak...',
    '....kkkk....',
    '............',
  ],
  {
    a: palette['durian-500'],
    b: palette['durian-700'],
    c: palette['durian-200'],
    g: palette['durian-400'],
    h: palette['durian-100'],
  },
);

const AMULET = art(
  [
    '.kk......kk.',
    '.kak....kak.',
    '..kak..kak..',
    '...kakkak...',
    '....kkkk....',
    '...khggbk...',
    '...kgggbk...',
    '...kggbbk...',
    '....kbbk....',
    '.....kk.....',
    '............',
    '............',
  ],
  { a: palette['durian-500'], g: palette['durian-400'], h: palette['durian-100'], b: palette['durian-700'] },
);

// A crown: three jewelled points over a band set with gems.
const CROWN = art(
  [
    '............',
    '............',
    '.k...kk...k.',
    'kgk.kcck.kgk',
    'kak.kaak.kak',
    'kaakkaakkaak',
    'kcaaaaaaaabk',
    'kkkkkkkkkkkk',
    'kbgbbhhbbgbk',
    'kbbbbbbbbbbk',
    'kkkkkkkkkkkk',
    '............',
  ],
  {
    a: palette['durian-400'],
    b: palette['durian-600'],
    c: palette['durian-200'],
    g: palette['lychee-500'],
    h: palette['blueberry-400'],
  },
);

// A closed helm: domed top, a T-shaped visor slit.
const HELM = art(
  [
    '............',
    '....kkkk....',
    '...kccaak...',
    '..kcaaaabk..',
    '.kcaaaaaabk.',
    '.kcaaaaaabk.',
    '.kkkkkkkkkk.',
    '.kcaakkaabk.',
    '.kcaakkaabk.',
    '.kbbbkkbbbk.',
    '..kkkkkkkk..',
    '............',
  ],
  { a: palette['rambutan-100'], b: palette['mangosteen-500'], c: palette['rambutan-50'] },
);

// A peaked hood, the face in shadow, draping to the shoulders.
const HOOD = art(
  [
    '.....kk.....',
    '....kcak....',
    '...kcaaak...',
    '..kcaaaabk..',
    '.kcakkkkabk.',
    '.kckffffkbk.',
    '.kckffffkbk.',
    'kcakffffkabk',
    'kcaakkkkaabk',
    'kcaaaaaaaabk',
    'kbbbbbbbbbbk',
    'kkkkkkkkkkkk',
  ],
  {
    a: palette['mangosteen-300'],
    b: palette['mangosteen-600'],
    c: palette['rambutan-100'],
    f: palette['mangosteen-900'],
  },
);

// A long robe: sleeves out, a sash, the hem flaring.
const ROBE = art(
  [
    '...kk..kk...',
    '..kcckkaak..',
    '.kccakkaaak.',
    'kcaaakkaaabk',
    'kcakakkakabk',
    'kkkkddddkkkk',
    '..kcakkabk..',
    '..kcakkabk..',
    '.kcaakkaabk.',
    '.kcaakkaabk.',
    'kcaaakkaaabk',
    'kkkkkkkkkkkk',
  ],
  {
    a: palette['mangosteen-300'],
    b: palette['mangosteen-600'],
    c: palette['rambutan-100'],
    d: palette['durian-300'],
  },
);

// A lychee: round, bumpy red skin, a short stem and leaf.
const LYCHEE = art(
  [
    '......kk....',
    '....kkhgk...',
    '...kkkhkk...',
    '..kccabaak..',
    '.kcaabaabak.',
    '.kbaabaabbk.',
    '.kaabaabaak.',
    '.kabaabaabk.',
    '..kbaabbbk..',
    '...kkkkkk...',
    '............',
    '............',
  ],
  {
    a: palette['lychee-500'],
    b: palette['lychee-700'],
    c: palette['lychee-300'],
    g: palette['pandan-400'],
    h: palette['persimmon-800'],
  },
);

// A spool of thread with a needle through it, for crafting.
const SPOOL = art(
  [
    '..........kk',
    '.........kwk',
    '.kkkkkkkkwk.',
    'khhhhhhhwk..',
    '.kkkkkkwkk..',
    '.kccaawabk..',
    '.kcaawaabk..',
    '.kcawaaabk..',
    '.kkwkkkkk...',
    'khwhhhhhk...',
    '.kkkkkkk....',
    '............',
  ],
  {
    a: palette['lychee-500'],
    b: palette['lychee-700'],
    c: palette['lychee-300'],
    h: palette['persimmon-600'],
    w: palette['rambutan-100'],
  },
);

function jewel(template: Art, gem: string): Art {
  const colors = GEM_COLORS[gem] ?? GEM_COLORS.gold ?? {};
  return tint(template, { g: colors.a ?? INK, b: colors.b ?? INK, h: colors.c ?? INK });
}

const GEAR_ART: Readonly<Record<string, Art>> = {
  'straw-hat': HAT,
  'linen-gloves': GLOVES,
  'woodsman-trousers': TROUSERS,
  'travel-boots': tint(BOOT, {
    a: palette['persimmon-700'],
    b: palette['persimmon-900'],
    c: palette['persimmon-500'],
  }),
  'fisher-vest': VEST,
  'wicker-pack': PACK,
  'chef-hat': CHEF_HAT,
  'explorer-cape': CAPE,
  'forager-pack': tint(PACK, {
    a: palette['pandan-600'],
    b: palette['pandan-800'],
    c: palette['pandan-400'],
  }),
  'gold-ring': jewel(RING, 'gold'),
  'sapphire-ring': jewel(RING, 'sapphire'),
  'emerald-ring': jewel(RING, 'emerald'),
  'ruby-ring': jewel(RING, 'ruby'),
  'sapphire-amulet': jewel(AMULET, 'sapphire'),
  'emerald-amulet': jewel(AMULET, 'emerald'),
  'ruby-amulet': jewel(AMULET, 'ruby'),
  'diamond-amulet': jewel(AMULET, 'diamond'),
  'mining-helmet': HELMET,
  'forge-apron': APRON,
  'steel-gauntlets': tint(GLOVES, {
    a: palette['blueberry-200'],
    b: palette['mangosteen-600'],
    c: palette['rambutan-50'],
    d: palette['mangosteen-700'],
  }),
  'mithril-boots': tint(BOOT, {
    a: palette['blueberry-500'],
    b: palette['blueberry-800'],
    c: palette['blueberry-300'],
  }),
  'moonsilk-robe': ROBE,
  'moonsilk-hood': HOOD,
  'moonsteel-helm': HELM,
  'moonsteel-boots': tint(BOOT, {
    a: palette['rambutan-100'],
    b: palette['mangosteen-500'],
    c: palette['rambutan-50'],
  }),
  'diamond-ring': jewel(RING, 'diamond'),
  'sunsteel-gauntlets': tint(GLOVES, {
    a: palette['durian-400'],
    b: palette['persimmon-600'],
    c: palette['durian-100'],
    d: palette['persimmon-700'],
  }),
  'starwood-pack': tint(PACK, {
    a: palette['durian-600'],
    b: palette['persimmon-800'],
    c: palette['durian-300'],
  }),
  'sun-amulet': tint(jewel(AMULET, 'diamond'), { g: palette['durian-300'], h: palette['durian-100'] }),
  'summit-charm': jewel(AMULET, 'ruby'),
  'bruh-crown': CROWN,
  'legend-cape': tint(CAPE, {
    a: palette['mangosteen-600'],
    b: palette['mangosteen-900'],
    c: palette['durian-300'],
    d: palette['durian-400'],
    l: palette['durian-400'],
  }),
  'lumberjack-cap': CAP,
  'angler-hat': tint(HAT, {
    a: palette['pandan-600'],
    b: palette['pandan-800'],
    c: palette['pandan-400'],
    d: palette['lychee-400'],
  }),
  'four-leaf-charm': jewel(AMULET, 'clover'),
  'seven-league-boots': tint(BOOT, {
    a: palette['mangosteen-600'],
    b: palette['mangosteen-800'],
    c: palette['mangosteen-400'],
  }),
  'treasure-ring': tint(jewel(RING, 'gold'), { g: palette['persimmon-400'], h: palette['durian-100'] }),
  'bruh-cape': tint(CAPE, {
    a: palette['bruh-base'],
    b: palette['durian-600'],
    c: palette['durian-200'],
    d: palette['bruh-mouth'],
    l: palette['bruh-mouth'],
  }),
};

const MATERIAL_ART: Readonly<Record<string, Art>> = {
  flax: FLAX,
  silkweed: tint(FLAX, {
    b: palette['mangosteen-300'],
    w: palette['rambutan-50'],
    g: palette['mangosteen-400'],
    a: palette['mangosteen-600'],
    d: palette['blueberry-200'],
  }),
  moonsilk: tint(LINEN, {
    a: palette['mangosteen-200'],
    b: palette['mangosteen-400'],
    c: palette['rambutan-50'],
  }),
  persimmon: tint(MANGOSTEEN, {
    a: palette['persimmon-500'],
    b: palette['persimmon-700'],
    c: palette['persimmon-300'],
  }),
  lychee: LYCHEE,
  reeds: REEDS_BUNDLE,
  linen: LINEN,
  wicker: WICKER,
  emerald: tint(SAPPHIRE, GEM_COLORS.emerald ?? {}),
  ruby: tint(SAPPHIRE, GEM_COLORS.ruby ?? {}),
  diamond: tint(SAPPHIRE, GEM_COLORS.diamond ?? {}),
  'miner-crate': CRATE,
  'adventurer-chest': tint(CHEST, {
    a: palette['mangosteen-600'],
    b: palette['mangosteen-800'],
    c: palette['mangosteen-400'],
  }),
};

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

const UNIQUE: Readonly<Record<string, Art>> = {
  rambutan: RAMBUTAN,
  mangosteen: MANGOSTEEN,
  durian: DURIAN,
  dragonfruit: DRAGONFRUIT,
  'bird-nest': NEST,
  sapphire: SAPPHIRE,
  bottle: BOTTLE,
  'golden-seed': SEED,
  coins: COINS,
  'moonstone-ore': CRYSTAL_ORE,
  'sunstone-ore': tint(CRYSTAL_ORE, { o: palette['persimmon-400'], p: palette['durian-100'] }),
  ...MATERIAL_ART,
  ...GEAR_ART,
  'burnt-fish': tint(FISH, { a: palette['longan-800'], b: INK, c: palette['longan-700'], s: INK }),
};
const TOOL_ART: Readonly<Record<string, Art>> = {
  axe: AXE,
  pickaxe: PICKAXE,
  harpoon: HARPOON,
  shears: SHEARS,
};

const itemCache = new Map<string, Art>();
export function itemArt(id: string): Art {
  const cached = itemCache.get(id);
  if (cached) return cached;
  let result: Art = COINS;
  const unique = UNIQUE[id];
  const [metal, kind] = id.split('-');
  if (unique) result = unique;
  else if (LOG_TINTS[id]) result = tint(LOG, LOG_TINTS[id]);
  else if (ORE_TINTS[id]) result = tint(ORE, ORE_TINTS[id]);
  else if (id === 'gold-bar') result = tint(BAR, GEM_COLORS.gold ?? {});
  else if (id.endsWith('-bar') && metal && metal in METAL_COLORS)
    result = tint(BAR, METAL_COLORS[metal as keyof typeof METAL_COLORS]);
  else if (id.startsWith('raw-') && FISH_ART[id.slice(4)]) result = FISH_ART[id.slice(4)] ?? FISH;
  else if (FISH_ART[id]) result = tint(FISH_ART[id] ?? FISH, COOKED);
  else if (metal && kind && metal in METAL_COLORS && TOOL_ART[kind])
    result = tint(TOOL_ART[kind] ?? AXE, METAL_COLORS[metal as keyof typeof METAL_COLORS]);
  itemCache.set(id, result);
  return result;
}

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

export const ALL_ART: Readonly<Record<string, Art>> = {
  log: LOG,
  ore: ORE,
  bar: BAR,
  fish: FISH,
  axe: AXE,
  pickaxe: PICKAXE,
  harpoon: HARPOON,
  shears: SHEARS,
  ...UNIQUE,
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
};
