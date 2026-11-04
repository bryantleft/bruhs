import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Marker,
  Map as NativeMap,
} from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createWalkCamera } from '../explore/camera';
import {
  MAP_COUNTRY_LAYERS,
  MAP_MARKER_SIZE,
  MAP_MINOR_PLACE_LAYERS,
  MAP_PARK_FILL,
  MAP_PATH_LAYER,
  MAP_PLACE_LAYERS,
  MAP_PLACE_LAYOUT,
  MAP_PLACE_PAINT,
  MAP_ROAD_LABELS,
  MAP_STAMP_CIRCLES,
  MAP_STAMP_SOURCE,
  MAP_STAMP_SYMBOLS,
  MAP_STYLE,
  MAP_WATER_LAYER,
  MAP_WATER_POINT_LAYER,
  MAP_WOODLAND_FILL,
  MAP_WOODLAND_LAYER,
  type StreetMapProps,
  WALK_MAP_PADDING,
} from '../explore/map';
import { lastFix, routeData, stampData } from '../explore/walk';
import { color, motion, radius } from '../theme/theme';
import { Bruh } from './Bruh';
import { useReducedMotion } from './MotionProvider';

export function StreetMap({ walk, skin, recenter, onStatus }: StreetMapProps): React.JSX.Element {
  const point = lastFix(walk);
  const [size, setSize] = useState('');
  const [ready, setReady] = useState(false);
  const camera = useRef<CameraRef>(null);
  const tracking = useRef(createWalkCamera()).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!ready || !camera.current) return;
    const move = tracking.next(walk, recenter, size);
    if (!move) return;
    if (move.kind === 'follow') {
      if (reduced) camera.current.jumpTo({ center: [...move.center] });
      else camera.current.easeTo({ center: [...move.center], duration: motion.standard });
    } else {
      if (move.view.kind === 'bounds') {
        // iOS fits using the current orientation before applying overrides.
        // Preserve that orientation so the fitted bounds retain their padding.
        camera.current.fitBounds([...move.view.bounds], {
          padding: WALK_MAP_PADDING,
          duration: 0,
        });
      } else {
        camera.current.jumpTo({
          center: [...move.view.center],
          zoom: 16,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        });
      }
    }
  }, [walk, recenter, size, ready, reduced, tracking]);
  return (
    <NativeMap
      style={styles.map}
      mapStyle={MAP_STYLE}
      tintColor={color.primary}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        setSize(`${Math.round(width)}:${Math.round(height)}`);
      }}
      onRegionWillChange={({ nativeEvent }) => {
        if (nativeEvent.userInteraction) tracking.explore();
      }}
      onRegionIsChanging={({ nativeEvent }) => {
        if (nativeEvent.userInteraction) tracking.explore();
      }}
      onDidFinishLoadingMap={() => {
        setReady(true);
        onStatus('ready');
      }}
      onDidFailLoadingMap={() => onStatus('error')}
      accessibilityLabel="Real street map with your recorded walking route"
    >
      <Camera ref={camera} initialViewState={{ center: [0, 20], zoom: 1 }} />
      {[...MAP_COUNTRY_LAYERS, ...MAP_MINOR_PLACE_LAYERS].map((id) => (
        <Layer
          key={id}
          id={id}
          type="symbol"
          source="openmaptiles"
          source-layer="place"
          paint={MAP_PLACE_PAINT}
        />
      ))}
      {MAP_PLACE_LAYERS.map((id) => (
        <Layer
          key={id}
          id={id}
          type="symbol"
          source="openmaptiles"
          source-layer="place"
          layout={MAP_PLACE_LAYOUT}
          paint={MAP_PLACE_PAINT}
        />
      ))}
      {ready ? <Layer {...MAP_WATER_LAYER} /> : null}
      {ready ? <Layer {...MAP_PARK_FILL} beforeId="water" /> : null}
      {ready ? <Layer {...MAP_PATH_LAYER} /> : null}
      {ready ? (
        <Layer
          id={MAP_WOODLAND_LAYER}
          type="fill"
          source="openmaptiles"
          source-layer="landcover"
          layout={{ visibility: 'none' }}
        />
      ) : null}
      {ready ? <Layer {...MAP_WOODLAND_FILL} beforeId={MAP_WOODLAND_LAYER} /> : null}
      {ready
        ? MAP_ROAD_LABELS.map(({ id, textColor }) => (
            <Layer
              key={id}
              id={id}
              type="symbol"
              source="openmaptiles"
              source-layer="transportation_name"
              paint={{ 'text-color': textColor }}
            />
          ))
        : null}
      <GeoJSONSource id="your-walk" data={routeData(walk)}>
        <Layer
          id="walk-outline"
          type="line"
          paint={{ 'line-color': color.canvas, 'line-width': 9 }}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        />
        <Layer
          id="walk-trail"
          type="line"
          paint={{ 'line-color': color.primary, 'line-width': 5 }}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        />
      </GeoJSONSource>
      <GeoJSONSource id={MAP_STAMP_SOURCE} data={stampData(walk)}>
        <Layer {...MAP_STAMP_CIRCLES} />
        <Layer {...MAP_STAMP_SYMBOLS} />
      </GeoJSONSource>
      {ready ? <Layer {...MAP_WATER_POINT_LAYER} afterId="walk-trail" /> : null}
      {point ? (
        <Marker id="your-bruh" lngLat={[point.longitude, point.latitude]}>
          <View style={styles.marker}>
            <Bruh skin={skin} size={42} />
          </View>
        </Marker>
      ) : null}
    </NativeMap>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  marker: {
    width: MAP_MARKER_SIZE,
    height: MAP_MARKER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.orb,
    backgroundColor: color.canvas,
    borderWidth: 2,
    borderColor: color.primary,
  },
});
