import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Biome, SkinId } from '../game/content';
import { SCENE_HEIGHT, SCENE_WIDTH, sceneShapes } from '../pixel/scene';
import { color, layout } from '../theme/theme';
import { useReducedMotion } from './MotionProvider';

export function Scene({
  biome,
  skin,
  working,
  walking,
  tool,
  label,
}: Readonly<{
  biome: Biome;
  skin: SkinId;
  working: boolean;
  walking: boolean;
  tool?: string;
  label: string;
}>): React.JSX.Element {
  const reduced = useReducedMotion();
  // Short screens get a wider, bottom-anchored crop so the status panel stays above the fold.
  const compact = useWindowDimensions().height < 720;
  const [frame, setFrame] = useState(0);
  const animate = !reduced && (working || walking);
  useEffect(() => {
    if (!animate) return;
    const timer = setInterval(() => setFrame((value) => (value + 1) % 4), 380);
    return () => clearInterval(timer);
  }, [animate]);
  const hour = new Date().getHours();
  const night = hour < 6 || hour >= 20;
  const shapes = useMemo(
    () => sceneShapes({ biome, skin, night, frame: animate ? frame : 0, working, walking, tool }),
    [biome, skin, night, frame, animate, working, walking, tool],
  );
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.frame, compact && styles.compact]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
        preserveAspectRatio={compact ? 'xMidYMax slice' : 'xMidYMid slice'}
      >
        {shapes.map((shape, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a scene is a fixed back-to-front list, so the index is stable.
          <Path key={index} d={shape.d} fill={shape.fill} transform={shape.transform} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 2,
    borderWidth: layout.border,
    borderColor: color.ink,
    overflow: 'hidden',
    backgroundColor: color.well,
  },
  compact: { aspectRatio: 3.2 },
});
