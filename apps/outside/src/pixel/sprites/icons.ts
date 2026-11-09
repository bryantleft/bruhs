import { palette } from '../../theme/palette.ts';
import { art } from './core.ts';

// Skill, tab and scene icons that aren't items.

// An iron anvil in three-quarter view: horn to the left, a lit top face and a flared foot.
export const ANVIL = art(
  [
    '................',
    '................',
    '...kkkkkkkkkkkk.',
    '.kkccccccwwcccck',
    'kcccccccccccccck',
    '.kkebaaaaaaaaabk',
    '...kkeaaaaaaabek',
    '.....kbaaaabekk.',
    '.....kbaaaabek..',
    '....kkbaaaabek..',
    '...kccbaaaabcck.',
    '..kcccccccccccck',
    '..kaaaaaaaaaabek',
    '..kbbbbbbbbbbeek',
    '...kkkkkkkkkkkk.',
    '................',
  ],
  {
    w: palette['rambutan-50'],
    c: palette['rambutan-300'],
    a: palette['rambutan-500'],
    b: palette['rambutan-700'],
    e: palette['rambutan-900'],
  },
);

// An iron cooking pot of orange stew, with side lugs, over a log fire.
export const POT = art(
  [
    '................',
    '................',
    '....kkkkkkkk....',
    '..kkcccccccckk..',
    '.kcctttttttbcck.',
    'kcassssssssssack',
    'kcccccccccccccck',
    'kacaaaaawaaabebk',
    '.kcaaaaaaaaabek.',
    '.kcaaaaaaaabbek.',
    '.kaaaaaaaabbeek.',
    '..kabbbbbbbeeek.',
    '...kkkkkkkkkkk..',
    '..kkyfkyykfykk..',
    '.kihfyyyyyyfhdk.',
    '..kkkkkkkkkkkk..',
  ],
  {
    w: palette['rambutan-100'],
    c: palette['rambutan-400'],
    a: palette['rambutan-600'],
    b: palette['rambutan-800'],
    e: palette['rambutan-950'],
    s: palette['persimmon-400'],
    t: palette['persimmon-700'],
    f: palette['persimmon-400'],
    y: palette['durian-500'],
    i: palette['persimmon-600'],
    h: palette['persimmon-700'],
    d: palette['persimmon-900'],
  },
);

// A quest scroll between two paper rolls, lines of writing and a red wax seal.
export const SCROLL = art(
  [
    '.kkkkkkkkkkkkkk.',
    'kcccccccccccccck',
    'kaaaaaaaaaaaaabk',
    'kbbbbbbbbbbbbbek',
    '.kkcccccccccakk.',
    '..kceeeeeeccak..',
    '..kcccccccccak..',
    '..kceeeeecccck..',
    '..kcccccccccak..',
    '..kceeeeeeecak..',
    '..kcccccccRrrk..',
    '.kkceeeecRrrsk..',
    'kcccccccccrsskk.',
    'kaaaaaaaaaaaaabk',
    'kbbbbbbbbbbbbbek',
    '.kkkkkkkkkkkkkk.',
  ],
  {
    c: palette['durian-200'],
    a: palette['durian-400'],
    b: palette['durian-600'],
    e: palette['durian-800'],
    R: palette['lychee-400'],
    r: palette['lychee-600'],
    s: palette['lychee-800'],
  },
);

// A map folded in three: green land, blue sea, a red dashed route to an X.
export const MAP = art(
  [
    '.....kk.......k.',
    '....kbGk.....kgk',
    '..kkbgGGkk..kggk',
    '.kbbbgGGGGkkggrk',
    'kbbbggGGGGGggggk',
    'kbbbggGGGGGgrrrk',
    'kbggggGGGGGggggk',
    'kbggggGGGGGgrggk',
    'kggggrrGGrGrgggk',
    'kgggggGGrGGggggk',
    'kgggggGGBBGggggk',
    'kgrrgeEGBBBbggek',
    'kgggekkEBBBbgek.',
    'kgeek..kEEBbek..',
    'kekk....kkEek...',
    '.k........kk....',
  ],
  {
    g: palette['pandan-400'],
    G: palette['pandan-600'],
    b: palette['blueberry-400'],
    B: palette['blueberry-600'],
    e: palette['pandan-700'],
    E: palette['pandan-800'],
    r: palette['lychee-500'],
  },
);

// A cottage seen from above the eaves: red tiled roof, chimney, window and door.
export const HOUSE = art(
  [
    '...........kk...',
    '.....kkkkkkrbk..',
    '....kccccccrbk..',
    '...kcaaaaaabk...',
    '..kcaaaaaaaabk..',
    '.kcaaaaaaaaaabk.',
    'kbbbbbbbbbbbbbbk',
    '.kddddddddddddk.',
    '.kppppppppppqqk.',
    '.kpwgpphhdppqqk.',
    '.kpggpphhdppqqk.',
    '.kppppphhdppqqk.',
    '.kppppphhdppqqk.',
    '.kppppphhdppqqk.',
    '.kqqqqqhhdqqqqk.',
    '..kkkkkkkkkkkk..',
  ],
  {
    c: palette['lychee-400'],
    a: palette['lychee-500'],
    b: palette['lychee-700'],
    r: palette['persimmon-900'],
    p: palette['durian-200'],
    q: palette['durian-500'],
    d: palette['durian-700'],
    h: palette['persimmon-700'],
    g: palette['blueberry-400'],
    w: palette['rambutan-50'],
  },
);

// A rising bar chart of three solid bars, each with a lit top and a shaded side.
export const STATS = art(
  [
    '...........kkkk.',
    '..........kcccck',
    '..........kaaabk',
    '..........kaaabk',
    '......kkkkkaaabk',
    '.....kcccckaaabk',
    '.....kaaabkaaabk',
    '.....kaaabkaaabk',
    '.kkkkkaaabkaaabk',
    'kcccckaaabkaaabk',
    'kaaabkaaabkaaabk',
    'kaaabkaaabkaaabk',
    'kaaabkaaabkaaabk',
    'kaaabkaaabkaaabk',
    'kbbbekbbbekbbbek',
    '.kkkk.kkkk.kkkk.',
  ],
  {
    c: palette['pandan-200'],
    a: palette['pandan-400'],
    b: palette['pandan-600'],
    e: palette['pandan-800'],
  },
);

// Two bare footprints, toes and all, one stepping ahead of the other.
export const STEPS = art(
  [
    '.........kk.k.k.',
    '........kcckakak',
    '........kcckk.k.',
    '.k.k.kk..kkkkkk.',
    'kckakaak.kccaaak',
    '.k.kkaakkccaaaak',
    '.kkkkkk.kcaaaabk',
    'kccaaak..kaaaabk',
    'kcaaaabk..kaaabk',
    'kcaaabk..kcaaabk',
    'kcaabk...kaaabbk',
    'kcaabk....kabbk.',
    'kcaaabk....kkk..',
    'kaaabbk.........',
    '.kabbk..........',
    '..kkk...........',
  ],
  {
    c: palette['durian-200'],
    a: palette['durian-400'],
    b: palette['durian-600'],
  },
);
