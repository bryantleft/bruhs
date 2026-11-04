import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { getLocation, LOCATIONS, ROADS, type SkinId } from '../game/content';
import { bruhArt } from '../pixel/art';
import { artPaths } from '../pixel/Sprite';
import { palette } from '../theme/palette';
import { color, font, layout, shadow } from '../theme/theme';

export const MAP_COLUMNS = 24;
export const MAP_ROWS = 32;
const TILE = 4;
const W = MAP_COLUMNS * TILE;
const H = MAP_ROWS * TILE;

// ~ sea · - lake · . grass · T forest · : sand · ^ mountain · , marsh · M moonlit grove · X crater
export const MAP_TILES: readonly string[] = [
  '~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~...........,,,,~~~~~',
  '~~...TT.......,,,,,,~~~~',
  '~..TTTT......,,,-,,,,~~~',
  '~.TTT----....,,---,,,~~~',
  '~.TT------...,,,,,,,..~~',
  '~.T--------.....,,....~~',
  '~.T--------...........~~',
  '~..-------.......TT...~~',
  '~...-----.......TTT..~~~',
  '~.TT.............T...:~~',
  '~TTTT...............:~~~',
  '~TTTTT..............:~~~',
  '~TTTTT..............::~~',
  '~TTTT................:~~',
  '~.TT..................~~',
  '~.....................~~',
  '~.....................~~',
  '~...............^.....~~',
  '~^^............^^^....~~',
  '~^^^...........^^.....~~',
  '~^^^^.....MMMM........~~',
  '~^^^^^...MMMMMM..:....~~',
  '~^^^^^^..MMMMMMM::::..~~',
  '~^^^^^^^.MMMMM::::::::~~',
  '~^^^^^^......:::::::::~~',
  '~^^^^^^.....::::::::::~~',
  '~^^^^^.....:::::::::::~~',
  '~~^^^.....::::::::::::~~',
  '~~XXXXX..:::::::::::~~~~',
  '~~XXXXXX~~~~~~~~~~~~~~~~',
  '~~~XXX~~~~~~~~~~~~~~~~~~',
];

type Terrain = Readonly<{ base: string; detail: string; pattern: readonly string[] }>;
const TERRAIN: Readonly<Record<string, Terrain>> = {
  '~': {
    base: palette['blueberry-800'],
    detail: palette['blueberry-600'],
    pattern: ['....', '.##.', '....', '#..#'],
  },
  '-': {
    base: palette['blueberry-600'],
    detail: palette['blueberry-400'],
    pattern: ['....', '..##', '....', '##..'],
  },
  '.': {
    base: palette['pandan-500'],
    detail: palette['pandan-400'],
    pattern: ['....', '.#..', '....', '...#'],
  },
  T: {
    base: palette['pandan-700'],
    detail: palette['pandan-400'],
    pattern: ['.##.', '####', '.##.', '....'],
  },
  ':': {
    base: palette['durian-500'],
    detail: palette['durian-600'],
    pattern: ['....', '..#.', '....', '#...'],
  },
  '^': {
    base: palette['rambutan-700'],
    detail: palette['rambutan-300'],
    pattern: ['.#..', '###.', '####', '....'],
  },
  ',': {
    base: palette['pandan-800'],
    detail: palette['mangosteen-500'],
    pattern: ['....', '.#..', '...#', '....'],
  },
  M: {
    base: palette['mangosteen-800'],
    detail: palette['rambutan-100'],
    pattern: ['....', '.#..', '...#', '#...'],
  },
  X: {
    base: palette['longan-800'],
    detail: palette['persimmon-400'],
    pattern: ['.#..', '....', '...#', '#...'],
  },
};

function tileCenter(id: string): Readonly<{ x: number; y: number }> {
  const place = getLocation(id);
  return { x: (place?.x ?? 0) * TILE + TILE / 2, y: (place?.y ?? 0) * TILE + TILE / 2 };
}

function dottedLine(from: string, to: string, gap = 2): string {
  const a = tileCenter(from);
  const b = tileCenter(to);
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  let d = '';
  for (let index = 0; index <= steps; index += gap) {
    const x = Math.round(a.x + ((b.x - a.x) * index) / steps);
    const y = Math.round(a.y + ((b.y - a.y) * index) / steps);
    d += `M${x} ${y}h1v1h-1z`;
  }
  return d;
}

function terrainPaths(): readonly (readonly [string, string])[] {
  const paths = new Map<string, string>();
  const add = (fill: string, d: string): void => {
    paths.set(fill, (paths.get(fill) ?? '') + d);
  };
  MAP_TILES.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx += 1) {
      const terrain = TERRAIN[row[tx] ?? '~'] ?? TERRAIN['~'];
      if (!terrain) continue;
      add(terrain.base, `M${tx * TILE} ${ty * TILE}h${TILE}v${TILE}h${-TILE}z`);
      terrain.pattern.forEach((line, py) => {
        for (let px = 0; px < line.length; px += 1)
          if (line[px] === '#') add(terrain.detail, `M${tx * TILE + px} ${ty * TILE + py}h1v1h-1z`);
      });
    }
  });
  return [...paths];
}

let cachedTerrain: readonly (readonly [string, string])[] | null = null;

export function WorldMap({
  location,
  selected,
  onSelect,
  skin,
  travel,
  locked,
}: Readonly<{
  location: string;
  selected: string;
  onSelect: (id: string) => void;
  skin: SkinId;
  travel: Readonly<{ path: readonly string[]; progress: number }> | null;
  locked: ReadonlySet<string>;
}>): React.JSX.Element {
  cachedTerrain ??= terrainPaths();
  const roads = useMemo(() => ROADS.map(([a, b]) => dottedLine(a, b)).join(''), []);
  const route = useMemo(() => {
    if (!travel) return '';
    let d = '';
    for (let index = 1; index < travel.path.length; index += 1)
      d += dottedLine(travel.path[index - 1] ?? location, travel.path[index] ?? location, 1);
    return d;
  }, [travel, location]);
  const marker = useMemo(() => {
    if (!travel || travel.path.length < 2) return tileCenter(location);
    // Walk the route's legs in proportion to their pixel length.
    const legs = travel.path.slice(1).map((id, index) => {
      const a = tileCenter(travel.path[index] ?? id);
      const b = tileCenter(id);
      return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y) };
    });
    let remaining = legs.reduce((sum, leg) => sum + leg.length, 0) * travel.progress;
    for (const leg of legs) {
      if (remaining <= leg.length) {
        const t = leg.length ? remaining / leg.length : 0;
        return { x: leg.a.x + (leg.b.x - leg.a.x) * t, y: leg.a.y + (leg.b.y - leg.a.y) * t };
      }
      remaining -= leg.length;
    }
    return legs.at(-1)?.b ?? tileCenter(location);
  }, [travel, location]);
  const bruh = bruhArt(skin);
  return (
    <View style={styles.frame}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        {cachedTerrain.map(([fill, d]) => (
          <Path key={fill} d={d} fill={fill} />
        ))}
        <Path d={roads} fill={palette['durian-200']} />
        {route ? <Path d={route} fill={palette['persimmon-400']} /> : null}
        {LOCATIONS.map((place) => {
          const { x, y } = tileCenter(place.id);
          const isHere = place.id === location && !travel;
          const fill = locked.has(place.id)
            ? palette['rambutan-600']
            : place.store
              ? palette['durian-400']
              : palette['lychee-400'];
          return (
            <G key={place.id}>
              <Path
                d={`M${x - 3} ${y - 3}h6v6h-6z`}
                fill={place.id === selected ? palette['rambutan-50'] : color.ink}
              />
              <Path d={`M${x - 2} ${y - 2}h4v4h-4z`} fill={isHere ? palette['pandan-300'] : fill} />
            </G>
          );
        })}
        <G transform={`translate(${Math.round(marker.x) - 5} ${Math.round(marker.y) - 13}) scale(0.625)`}>
          {artPaths(bruh).map(([fill, d]) => (
            <Path key={fill} d={d} fill={fill} />
          ))}
        </G>
      </Svg>
      {LOCATIONS.map((place) => {
        const { x, y } = tileCenter(place.id);
        const left = (x / W) * 100;
        const top = (y / H) * 100;
        const isSelected = place.id === selected;
        return (
          <Pressable
            key={place.id}
            accessibilityRole="button"
            accessibilityLabel={`${place.name}${place.id === location ? ', you are here' : ''}${locked.has(place.id) ? ', locked' : ''}`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(place.id)}
            hitSlop={6}
            style={[styles.hit, { left: `${left}%`, top: `${top}%` }]}
          >
            <View
              style={[
                styles.labelBox,
                top > 80 ? styles.labelAbove : null,
                // Near an edge, the plate grows inward so the map frame never clips it.
                left > 75 ? styles.labelEnd : left < 15 ? styles.labelStart : null,
              ]}
            >
              <Text style={[styles.label, isSelected && { color: color.gold }]}>{place.name}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: W / H,
    borderWidth: layout.border,
    borderColor: color.ink,
    overflow: 'hidden',
    backgroundColor: palette['blueberry-800'],
  },
  hit: {
    position: 'absolute',
    width: 44,
    height: 44,
    marginLeft: -22,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 30,
    overflow: 'visible',
  },
  // The plate keeps names readable over any terrain.
  labelBox: { position: 'absolute', top: 30, left: -38, width: 120, alignItems: 'center' },
  label: {
    paddingHorizontal: 3,
    backgroundColor: 'rgba(10,8,6,0.72)',
    fontFamily: font.label,
    fontSize: 9,
    lineHeight: 12,
    color: color.text,
    ...shadow,
  },
  labelAbove: { top: -4 },
  labelStart: { left: -4, alignItems: 'flex-start' },
  labelEnd: { left: -72, alignItems: 'flex-end' },
});
