import { palette } from '../../theme/palette.ts';
import { type Art, art, tint, WHITE } from './core.ts';

// Fruit, plants and other finds from foraging and the wilds.

// A rambutan: a red ball whose hairs end in green tips all the way round.
export const RAMBUTAN = art(
  [
    '......k..k......',
    '.....ktkktk.....',
    '...kkthtthtkk...',
    '..kthaccaabhtk..',
    '..ktacccaaabtk..',
    '.ktaccccaaabbtk.',
    'kthacccaaaabbhtk',
    '.ktaacaaaabbetk.',
    '.khaaaaaabbbehk.',
    'kthaaaaabbbeehtk',
    '.ktbaaabbbeeetk.',
    '..ktbbbbbeeetk..',
    '..kthbbeeeehtk..',
    '...kkthtthtkk...',
    '.....ktkktk.....',
    '......k..k......',
  ],
  {
    c: palette['lychee-300'],
    a: palette['lychee-500'],
    b: palette['lychee-700'],
    e: palette['lychee-900'],
    h: palette['lychee-600'],
    t: palette['pandan-300'],
  },
);

// A mangosteen: a deep purple ball under a thick four-lobed green calyx and stem.
export const MANGOSTEEN = art(
  [
    '......kkk.......',
    '......kgok......',
    '...kkkkgokkkk...',
    '..kllgggogggnk..',
    '.kllggoggoggnnk.',
    'kclggoggggognnbk',
    'kcaogglgglgoabek',
    'kcaaoggoggoaabek',
    'kcaaaooaaooaabek',
    'kaaaaaaaaaaabbek',
    'kaaaaaaaaaabbbek',
    'kbaaaaaaabbbbeek',
    '.kbaaaabbbbbeek.',
    '.kbbbbbbbbeeeek.',
    '..kkbbbeeeeekk..',
    '....kkkkkkkk....',
  ],
  {
    c: palette['dragonfruit-700'],
    a: palette['dragonfruit-800'],
    b: palette['dragonfruit-900'],
    e: palette['mangosteen-950'],
    l: palette['pandan-300'],
    g: palette['pandan-500'],
    n: palette['pandan-700'],
    o: palette['pandan-800'],
  },
);

// A persimmon: a squat orange fruit under a flat four-leaf calyx.
export const PERSIMMON = art(
  [
    '................',
    '.......kk.......',
    '......kgnk......',
    '.kkk..kgnk..kkk.',
    'kllgkkkggkkkggnk',
    '.kklgglggggnnkk.',
    'kcakklgggnnkkbek',
    'kcaaekgggnkeabek',
    'kcaaaekgnkeaabek',
    'kcaaaaekkeaaabek',
    'kaaaaaaaaaaabbek',
    'kbaaaaaaaabbbeek',
    '.kbaaaaabbbbeek.',
    '.kbbbbbbbbeeeek.',
    '..kkbbbeeeeekk..',
    '....kkkkkkkk....',
  ],
  {
    c: palette['persimmon-300'],
    a: palette['persimmon-500'],
    b: palette['persimmon-600'],
    e: palette['persimmon-800'],
    l: palette['pandan-300'],
    g: palette['pandan-500'],
    n: palette['pandan-700'],
  },
);

// A durian: a tall green-yellow husk studded with thorns, a woody stem on top.
export const DURIAN = art(
  [
    '.......kk.......',
    '....k.khdk.k....',
    '...kakkhdkkak...',
    '..kacacaaacabk..',
    '..kaabaacabcbk..',
    '.kcacacaacabbek.',
    'kacaabaacabbbebk',
    '.kaacacabcbbeek.',
    '.kcaabaacbbebek.',
    'kaacacabcbbebeek',
    '.kaaabacbbebeek.',
    '..kacabcbebeek..',
    '..kbabbebebeek..',
    '...kbbebeeeek...',
    '....kkbeebkk....',
    '......kkkk......',
  ],
  {
    c: palette['durian-500'],
    a: palette['pandan-400'],
    b: palette['pandan-600'],
    e: palette['pandan-800'],
    h: palette['persimmon-700'],
    d: palette['persimmon-900'],
  },
);

// A dragonfruit: a pink oval wrapped in scales that curl out to green tips.
export const DRAGONFRUIT = art(
  [
    '.....k..k..k....',
    '....kgkkgkkgk...',
    '.....kgacbgk....',
    '..k.kacaaabk.k..',
    '.kgkacgcaaabkgk.',
    '.kgbcgcnaaabbgk.',
    '..kacccaaaabek..',
    '.kkacccaaagbekk.',
    'kgkaaaaaaganekgk',
    'kgbaagaaaabbebgk',
    '.kkagcnaabbeekk.',
    '..kkbbbbbbeebgk.',
    '.kgbbbbgbeeekk..',
    '..kkkbgcneek....',
    '.....kkeekk.....',
    '.......kk.......',
  ],
  {
    c: palette['dragonfruit-300'],
    a: palette['dragonfruit-400'],
    b: palette['dragonfruit-600'],
    e: palette['dragonfruit-800'],
    g: palette['pandan-400'],
    n: palette['pandan-600'],
  },
);

// A lychee: a round red shell covered in small bumps, with a stem and one leaf.
export const LYCHEE = art(
  [
    '.......kk.kkk...',
    '......khdkgggk..',
    '......khdkggnnk.',
    '....kkacabkkkk..',
    '...kacaababbk...',
    '..kacccacaaaek..',
    '.kaaccaaababeek.',
    '.kcaccaacababek.',
    '.kabaabaabbbeek.',
    '.kacaacaaabbbek.',
    '.kbabaabbbeeeek.',
    '.kbbabbabbbeebk.',
    '..kbbebbeeeeek..',
    '...kebeebeebk...',
    '....keeeeeek....',
    '.....kkkkkk.....',
  ],
  {
    c: palette['lychee-400'],
    a: palette['lychee-600'],
    b: palette['lychee-800'],
    e: palette['lychee-950'],
    g: palette['pandan-500'],
    n: palette['pandan-700'],
    h: palette['persimmon-700'],
    d: palette['persimmon-900'],
  },
);

// A woven twig nest in three-quarter view, three blue eggs in its hollow.
export const NEST = art(
  [
    '................',
    '...kkk....kkk...',
    '..kccak..kccak..',
    '.kccaabkkccaabk.',
    '.kcaaakcakaaabk.',
    'kicaakccabkabbhk',
    'khjabkcaabkbbjhk',
    'kijjbkaabbkbjjik',
    'kiihiihiihiihhdk',
    'khiihhiihhiihhdk',
    'kdhhiihhiihhdddk',
    '.kdhhddhhddhhdk.',
    '.kjddhhddhhddjk.',
    '..kjjddjjddjjk..',
    '...kkjjjjjjkk...',
    '.....kkkkkk.....',
  ],
  {
    c: palette['blueberry-100'],
    a: palette['blueberry-300'],
    b: palette['blueberry-500'],
    i: palette['durian-600'],
    h: palette['durian-700'],
    d: palette['durian-800'],
    j: palette['durian-900'],
  },
);

// A corked glass bottle, light catching its left side and shoulder.
export const BOTTLE = art(
  [
    '......kkkk......',
    '......kihk......',
    '......khdk......',
    '.....kkkkkk.....',
    '......kcak......',
    '......kcak......',
    '.....kccabk.....',
    '...kkcwcaabkk...',
    '..kcwcaaaaabek..',
    '..kcccaaaaabek..',
    '..kccaaaaaabek..',
    '..kccaaaaaabek..',
    '..kccaaaaabbek..',
    '..kcaaaaabbbek..',
    '..kbbbbbbbeeek..',
    '...kkkkkkkkkk...',
  ],
  {
    w: WHITE,
    c: palette['blueberry-100'],
    a: palette['blueberry-300'],
    b: palette['blueberry-500'],
    e: palette['blueberry-700'],
    i: palette['persimmon-400'],
    h: palette['persimmon-600'],
    d: palette['persimmon-800'],
  },
);

// The golden seed: a big gold teardrop, a ridge down its face, a glint and a sparkle beside it.
export const SEED = art(
  [
    '..k.........kk..',
    '.kwk.....kkkcak.',
    'kwwwk..kkccaaak.',
    '.kwk.kkccacbabk.',
    '..kkkccaacbabek.',
    '..kccwaacbaabek.',
    '.kccwaacbaabeek.',
    'kccaaacbaabeek..',
    'kcaaaaaaabbeek..',
    'kcaaaaaabbeek...',
    'kaaaaaabbbeek...',
    'kbaaabbbbeeek...',
    'kbbbbbbeeeek....',
    '.kebbeeeeek.....',
    '..keeeeeek......',
    '...kkkkkk.......',
  ],
  {
    w: WHITE,
    c: palette['durian-200'],
    a: palette['durian-500'],
    b: palette['persimmon-400'],
    e: palette['persimmon-700'],
  },
);

// A harvested sheaf of flax: blue flowers on top, stalks tied at the waist, cut ends below.
export const FLAX = art(
  [
    '.....k...k......',
    '....kak.kak.....',
    '..kkacbkacbk.k..',
    '.kakkbkakbkkkak.',
    'kacbalacblkaacbk',
    '.kbacbkbklacbbk.',
    '..kkbggggngbkk..',
    '...klnggggngk...',
    '....klggggnk....',
    '....kttttuuk....',
    '.....klgngk.....',
    '.....klgngk.....',
    '.....klgngk.....',
    '....klglgnnk....',
    '....klgnlgnk....',
    '.....kkkkkk.....',
  ],
  {
    c: palette['blueberry-200'],
    a: palette['blueberry-400'],
    b: palette['blueberry-600'],
    l: palette['pandan-400'],
    g: palette['pandan-600'],
    n: palette['pandan-800'],
    t: palette['durian-600'],
    u: palette['durian-800'],
  },
);

// A tied bundle of cattails: three brown seed heads with spikes on green stalks.
export const REEDS_BUNDLE = art(
  [
    '.......k........',
    '......knk...k...',
    '...k.kihdk.knk..',
    '..knkkihdkkihdk.',
    '.kihdkihdkkihdk.',
    '.kihdkihdkkihdk.',
    '.kihdkihdkkihdk.',
    '.kihdkihdkkihdk.',
    '.kihdkkgnkkihdk.',
    '.kihdkkgnkkgnk..',
    '..kgnkkgnkgnk...',
    '...kgnkgngnk....',
    '....ktttuuuk....',
    '....klgnlgnk....',
    '...klgnkklgnk...',
    '....kkk..kkk....',
  ],
  {
    i: palette['persimmon-600'],
    h: palette['persimmon-800'],
    d: palette['persimmon-900'],
    l: palette['pandan-300'],
    g: palette['pandan-500'],
    n: palette['pandan-700'],
    t: palette['durian-500'],
    u: palette['durian-700'],
  },
);

export const NATURE_ITEMS: Readonly<Record<string, Art>> = {
  rambutan: RAMBUTAN,
  mangosteen: MANGOSTEEN,
  durian: DURIAN,
  dragonfruit: DRAGONFRUIT,
  persimmon: PERSIMMON,
  lychee: LYCHEE,
  'bird-nest': NEST,
  bottle: BOTTLE,
  'golden-seed': SEED,
  flax: FLAX,
  silkweed: tint(FLAX, {
    c: palette['rambutan-50'],
    a: palette['mangosteen-200'],
    b: palette['mangosteen-400'],
    l: palette['mangosteen-300'],
    g: palette['mangosteen-600'],
    n: palette['mangosteen-800'],
    t: palette['blueberry-200'],
    u: palette['blueberry-400'],
  }),
  reeds: REEDS_BUNDLE,
};
