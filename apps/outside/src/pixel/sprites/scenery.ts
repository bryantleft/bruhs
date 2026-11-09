import { palette } from '../../theme/palette.ts';
import { art, WOOD } from './core.ts';

// Props for the 96×48 biome scenes, sized against the 16-pixel bruh. The tallest are 21 rows,
// so they stand clear of row 16, where the landing page hero crops the scene. Leaves, stone and roofs
// shade in four steps: `c` light, `a` base, `b` shadow, `e` deep. Wood is `i` light, `h`,
// `d` and `j` deep. scene.ts tints these, so every tint defines every key it shares.

// A broadleaf tree: a round crown of leaf clumps, lit from the top left, on a rooted trunk.
export const TREE = art(
  [
    '.......kkkkk......',
    '....kkkccccck.....',
    '...kcccccccaakk...',
    '..kccccaccacccak..',
    '.kccccaaaacfcaaak.',
    '.kcccaaabcccaaabbk',
    '.kccccaccccaccbbek',
    '.kcccacccafacaaak.',
    'kcccafccaaabbfabk.',
    'kccaaccaaabbbbbbk.',
    '.kaabcaafbbbebeek.',
    '.kabbaaabbeeeeeek.',
    '..kkkkbbbeeeeeek..',
    '......kbeeekkkk...',
    '.......kjjjk......',
    '.......kihdk......',
    '.......kihdk......',
    '.......kihdk......',
    '......kiihddk.....',
    '......kihhddjk....',
    '.......kkkkkk.....',
  ],
  {
    i: palette['persimmon-700'],
    h: palette['persimmon-800'],
    d: palette['persimmon-900'],
    j: palette['persimmon-950'],
    c: palette['pandan-300'],
    a: palette['pandan-500'],
    b: palette['pandan-700'],
    e: palette['pandan-900'],
    f: palette['pandan-500'],
  },
);

// A pine of three stacked tiers, each shading the one below.
export const PINE = art(
  [
    '.....kk.....',
    '....kcbk....',
    '....kcbk....',
    '....kabk....',
    '...kcabbk...',
    '...kcaabk...',
    '...kcaabk...',
    '..kbbbeeek..',
    '...keeeek...',
    '...kcaabk...',
    '..kccaabbk..',
    '..kccaabbk..',
    '.kbbbbeeeek.',
    '..keeeeeek..',
    '..kccaabbk..',
    '.kccaaabbbk.',
    '.kccaaabbbk.',
    'kbbbbbeeeeek',
    '.kkkkjjkkkk.',
    '....khdk....',
    '.....kk.....',
  ],
  {
    i: palette['persimmon-600'],
    ...WOOD,
    j: palette['persimmon-950'],
    c: palette['pandan-400'],
    a: palette['pandan-600'],
    b: palette['pandan-800'],
    e: palette['pandan-950'],
  },
);

// A low boulder with ore in three seams (`o` and `p` are the ore).
export const ROCK = art(
  [
    '.....kkkkk....',
    '...kkccccck...',
    '..kccccccaak..',
    '..kccccaapobk.',
    '.kccpoaaaoobk.',
    'kcccoaapbbbebk',
    'kcaaaaboobeoek',
    'kaaaabbbeeeeek',
    '.kbbbbbbbbeek.',
    '..kkkkkkkkkk..',
  ],
  {
    c: palette['rambutan-400'],
    a: palette['rambutan-600'],
    b: palette['rambutan-800'],
    e: palette['rambutan-950'],
    o: palette['rambutan-700'],
    p: palette['rambutan-300'],
  },
);

// A round shrub dotted with berries.
export const BUSH = art(
  [
    '.....kkkk.....',
    '....kcccck....',
    '...kccccafkk..',
    '..kcccafcccak.',
    '.kccccccaaaabk',
    'kccafcaaabfbbk',
    'kcaacaaabbebek',
    'kaabaafbbeeeek',
    '.kbbabbeeeeek.',
    '..kkkkkkkkkk..',
  ],
  {
    c: palette['pandan-300'],
    a: palette['pandan-500'],
    b: palette['pandan-700'],
    e: palette['pandan-900'],
    f: palette['lychee-500'],
  },
);

// A saguaro with two arms and a flower on top.
export const CACTUS = art(
  [
    '.....kk.....',
    '....kffk....',
    '...kcfabk...',
    '...kcaabkkk.',
    '...kcaabkcbk',
    '.kkkcaabkabk',
    'kcbkcaabkabk',
    'kabkcaabkabk',
    'kabkcaabaabk',
    'kabkcaabbbek',
    'kabkcaabkkk.',
    'kaaacaabk...',
    'kbbecaabk...',
    '.kkkcaabk...',
    '...kcaabk...',
    '...kcaabk...',
    '...kbaaek...',
    '....kkkk....',
  ],
  {
    c: palette['pandan-300'],
    a: palette['pandan-500'],
    b: palette['pandan-700'],
    e: palette['pandan-900'],
    f: palette['dragonfruit-400'],
  },
);

// A clump of reed blades with two brown cattails.
export const REEDS = art(
  [
    '..kk.......',
    '.kihk.kk...',
    '.khdkkihk..',
    '.khdkkhdk..',
    '.khdkkhdk..',
    '.kjdkkhdkk.',
    '.kkakkjdkbk',
    'kckakkakkbk',
    'kckakcakbk.',
    '.kcakcakbk.',
    '.kcakcaabk.',
    '..kaacaabk.',
    '.kcaaaabbek',
    '..kbbbbbek.',
    '...kkkkkk..',
  ],
  {
    i: palette['persimmon-600'],
    ...WOOD,
    j: palette['persimmon-950'],
    c: palette['pandan-300'],
    a: palette['pandan-500'],
    b: palette['pandan-700'],
    e: palette['pandan-900'],
  },
);

// A sailing boat: two white sails on a mast, the hull open to show its inside.
export const BOAT = art(
  [
    '..........k...........',
    '.........khk..........',
    '.........khck.........',
    '........kahcck........',
    '.......kcahccck.......',
    '......kcaahcccck......',
    '.....kcaaahccccck.....',
    '....kcaaaahcaaaabk....',
    '..kkbbbbbbhbbbbbbbkk..',
    '.kiiiiiiiiiiiiiiiiiik.',
    'kijjjjjjjjhjjjjjjjjjik',
    'kiiiiiiiiiiiiiiiiiiiik',
    '.kihhhhhhhhhhhhhhhhdk.',
    '..kdddddddddddddddjk..',
    '...kkkkkkkkkkkkkkkk...',
  ],
  {
    i: palette['persimmon-600'],
    ...WOOD,
    j: palette['persimmon-950'],
    c: palette['rambutan-50'],
    a: palette['rambutan-200'],
    b: palette['rambutan-400'],
  },
);

// A cottage for the scenes, half as tall again as the bruh: hip roof, chimney, door and windows.
export const COTTAGE = art(
  [
    '...................kk.....',
    '........kkkkkkkkkkkbek....',
    '......kkcccccccccckbek....',
    '....kkcaaaaaaaaaaaabek....',
    '..kkccaaaaaaaaaaaaaabbkk..',
    '.kaaabbbbbbbbbbbbbbbbeeek.',
    'kcccaaaaaaaaaaaaaaaaaabbbk',
    'kccaaaaaaaaaaaaaaaaaaaabbk',
    'kabbbbbbbbbbbbbbbbbbbbbbek',
    'kaaaaaaaaaaaaaaaaaaaaaaaak',
    'kbbbbbbbbbbbbbbbbbbeeeeeek',
    '.krrrrrrrrrrrrrrrrrrrrrrk.',
    '.kppppppppppppppprqqqqqqk.',
    '.kpppppppppwggdpprqGGqqqk.',
    '.kpppppppppgggdpprqGGqqqk.',
    '.kpphhhdpppgggdpprqqqqqqk.',
    '.kphhhhhdppddddpprqqqqqqk.',
    '.kphhhhhdpppppppprqqqqqqk.',
    '.kphhhhhdpppppppprqqqqqqk.',
    '.kqhhhhhdqqqqqqqqrrrrrrrk.',
    '..kkkkkkkkkkkkkkkkkkkkkk..',
  ],
  {
    c: palette['lychee-400'],
    a: palette['lychee-500'],
    b: palette['lychee-700'],
    e: palette['lychee-900'],
    p: palette['durian-200'],
    q: palette['durian-400'],
    r: palette['durian-600'],
    h: palette['persimmon-700'],
    d: palette['persimmon-900'],
    g: palette['blueberry-300'],
    G: palette['blueberry-600'],
    w: palette['rambutan-50'],
  },
);

// A small anvil for the scenes, about half a bruh tall.
export const SCENE_ANVIL = art(
  [
    '............',
    '...kkkkkkk..',
    '.kkcccwccck.',
    'kcccccccccck',
    '.kkbaaaaabek',
    '...kbaaabek.',
    '..kkbaaabek.',
    '.kcccccccck.',
    'kbaaaaaaabek',
    '.kkkkkkkkkk.',
  ],
  {
    w: palette['rambutan-50'],
    c: palette['rambutan-300'],
    a: palette['rambutan-500'],
    b: palette['rambutan-700'],
    e: palette['rambutan-900'],
  },
);
