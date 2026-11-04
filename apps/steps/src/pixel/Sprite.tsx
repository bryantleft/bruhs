import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Art } from './art';
import { artPaths } from './paths';

export { artPaths };

export const Sprite = memo(function Sprite({
  art,
  size,
  flip = false,
}: Readonly<{ art: Art; size: number; flip?: boolean }>): React.JSX.Element {
  const height = (size * art.h) / art.w;
  // aria-hidden lives on a View: react-native-svg leaks it to the web DOM as accessible="false".
  return (
    <View aria-hidden style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
      <Svg width={size} height={height} viewBox={`0 0 ${art.w} ${art.h}`}>
        {artPaths(art).map(([fill, d]) => (
          <Path key={fill} d={d} fill={fill} />
        ))}
      </Svg>
    </View>
  );
});
