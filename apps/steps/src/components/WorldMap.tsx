import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { LOCATIONS, type SkinId } from '../game/content';
import { bruhArt } from '../pixel/art';
import { artPaths } from '../pixel/Sprite';
import { dottedLine, MAP_HEIGHT, MAP_WIDTH, roadPath, terrainPaths, tileCenter } from '../pixel/world';
import { palette } from '../theme/palette';
import { color, font, layout, shadow } from '../theme/theme';

const W = MAP_WIDTH;
const H = MAP_HEIGHT;

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
  const terrain = terrainPaths();
  const roads = roadPath();
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
        {terrain.map(([fill, d]) => (
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
