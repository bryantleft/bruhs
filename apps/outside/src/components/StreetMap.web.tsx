import type { GeoJSONSource, Map as MapInstance, Marker as MarkerInstance } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

let stylesheetAttempt = 0;
const stylesheetWaiters = new WeakMap<HTMLLinkElement, number>();

function loadMapStylesheet(assets: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Map loading canceled', 'AbortError'));
  const existing = document.querySelector<HTMLLinkElement>('link#street-map-css');
  const css = existing ?? document.createElement('link');
  if (css.sheet) return Promise.resolve();
  if (!existing) {
    css.id = 'street-map-css';
    css.rel = 'stylesheet';
    // A new href prevents Reload from rejoining an identical stalled browser request.
    const attempt = stylesheetAttempt++;
    css.href = `${assets}/maplibre-gl.css${attempt === 0 ? '' : `?retry=${attempt}`}`;
  }
  // Share pending downloads while a map needs them; retain loaded styles for later screens.
  const release = () => {
    css.onload = null;
    css.onerror = null;
  };
  css.onload = release;
  css.onerror = () => {
    release();
    css.remove();
  };
  return new Promise((resolve, reject) => {
    stylesheetWaiters.set(css, (stylesheetWaiters.get(css) ?? 0) + 1);
    const cleanup = () => {
      css.removeEventListener('load', onLoad);
      css.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      const remaining = (stylesheetWaiters.get(css) ?? 1) - 1;
      if (remaining === 0) stylesheetWaiters.delete(css);
      else stylesheetWaiters.set(css, remaining);
      return remaining;
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Map stylesheet could not be loaded'));
    };
    const onAbort = () => {
      const remaining = cleanup();
      if (remaining === 0 && !css.sheet) {
        release();
        css.remove();
      }
      reject(new DOMException('Map loading canceled', 'AbortError'));
    };
    css.addEventListener('load', onLoad);
    css.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort);
    if (signal.aborted) onAbort();
    else if (!css.isConnected) document.head.append(css);
  });
}

function recapPadding(instance: MapInstance): typeof WALK_MAP_PADDING {
  const canvas = instance.getCanvas().getBoundingClientRect();
  const credits = instance
    .getContainer()
    .querySelector<HTMLElement>('.maplibregl-ctrl-attrib')
    ?.getBoundingClientRect();
  if (!credits?.height) return WALK_MAP_PADDING;
  const bottom = Math.max(
    WALK_MAP_PADDING.bottom,
    Math.ceil(canvas.bottom - credits.top + WALK_MAP_PADDING.top),
  );
  // Retain a marker-sized fitting area when expanded credits leave little space.
  const limit = Math.max(WALK_MAP_PADDING.bottom, canvas.height - WALK_MAP_PADDING.top - MAP_MARKER_SIZE);
  return { ...WALK_MAP_PADDING, bottom: Math.min(bottom, limit) };
}

export function StreetMap({ walk, skin, recenter, onStatus }: StreetMapProps): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const marker = useRef<MarkerInstance | null>(null);
  const [markerNode, setMarkerNode] = useState<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const tracking = useRef(createWalkCamera()).current;
  const point = lastFix(walk);
  const [size, setSize] = useState('');
  const reduced = useReducedMotion();
  useEffect(() => {
    let current = true;
    const loading = new AbortController();
    let releaseAttribution: (() => void) | undefined;
    let releaseExploration: (() => void) | undefined;
    onStatus('loading');
    void import('maplibre-gl')
      .then(async (library) => {
        if (!current || !container.current) return;
        const assets = `/maplibre/${library.getVersion()}`;
        await loadMapStylesheet(assets, loading.signal);
        if (!current || !container.current) return;
        library.setWorkerUrl(`${assets}/maplibre-gl-worker.mjs`);
        const instance = new library.Map({
          container: container.current,
          style: MAP_STYLE,
          center: [0, 20],
          zoom: 1,
          attributionControl: { compact: true },
        });
        map.current = instance;
        const attribution = instance
          .getContainer()
          .querySelector<HTMLDetailsElement>('.maplibregl-ctrl-attrib');
        const credits = attribution?.querySelector<HTMLElement>('.maplibregl-ctrl-attrib-inner');
        const disclosure = attribution?.querySelector('summary');
        if (attribution && credits && disclosure) {
          let chosen = false;
          const choose = () => {
            chosen = true;
          };
          disclosure.addEventListener('click', choose);
          const observer = new ResizeObserver(() => {
            if (chosen || attribution.contains(document.activeElement)) return;
            // Leave the map visible when enlarged credits cannot fit without scrolling.
            if (credits.clientHeight > 0 && credits.scrollHeight > credits.clientHeight) {
              attribution.open = false;
              attribution.classList.remove('maplibregl-compact-show');
            }
          });
          observer.observe(credits);
          releaseAttribution = () => {
            observer.disconnect();
            disclosure.removeEventListener('click', choose);
          };
        }
        instance.on('style.load', () => {
          if (!current) return;
          for (const id of MAP_PLACE_LAYERS) {
            if (instance.getLayer(id)) {
              instance.setLayoutProperty(id, 'icon-image', MAP_PLACE_LAYOUT['icon-image']);
            }
          }
          for (const id of [...MAP_PLACE_LAYERS, ...MAP_MINOR_PLACE_LAYERS, ...MAP_COUNTRY_LAYERS]) {
            if (instance.getLayer(id)) {
              instance.setPaintProperty(id, 'text-color', MAP_PLACE_PAINT['text-color']);
            }
          }
        });
        const explore = (event: { originalEvent?: Event }) => {
          if (!event.originalEvent) return;
          tracking.explore();
          if (
            attribution &&
            !attribution.contains(document.activeElement) &&
            (attribution.open || attribution.classList.contains('maplibregl-compact-show'))
          ) {
            attribution.open = false;
            attribution.classList.remove('maplibregl-compact-show');
          }
        };
        // A gesture can interrupt an existing move; wheel movement can omit originalEvent.
        const explorationEvents = ['movestart', 'move', 'wheel'] as const;
        for (const event of explorationEvents) instance.on(event, explore);
        releaseExploration = () => {
          for (const event of explorationEvents) instance.off(event, explore);
        };
        const node = document.createElement('div');
        node.setAttribute('aria-hidden', 'true');
        setMarkerNode(node);
        marker.current = new library.Marker({ element: node });
        instance.on('load', () => {
          if (!current) return;
          if (instance.getLayer(MAP_WATER_LAYER.id))
            instance.setPaintProperty(MAP_WATER_LAYER.id, 'fill-color', MAP_WATER_LAYER.paint['fill-color']);
          if (instance.getLayer('water')) instance.addLayer(MAP_PARK_FILL, 'water');
          if (instance.getLayer(MAP_PATH_LAYER.id))
            instance.setPaintProperty(MAP_PATH_LAYER.id, 'line-color', MAP_PATH_LAYER.paint['line-color']);
          if (instance.getLayer(MAP_WOODLAND_LAYER)) {
            instance.setLayoutProperty(MAP_WOODLAND_LAYER, 'visibility', 'none');
            instance.addLayer(MAP_WOODLAND_FILL, MAP_WOODLAND_LAYER);
          }
          for (const { id, textColor } of MAP_ROAD_LABELS) {
            if (instance.getLayer(id)) instance.setPaintProperty(id, 'text-color', textColor);
          }
          instance.addSource('your-walk', { type: 'geojson', data: routeData(null) });
          instance.addLayer({
            id: 'walk-outline',
            type: 'line',
            source: 'your-walk',
            paint: { 'line-color': color.canvas, 'line-width': 9 },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          });
          instance.addLayer({
            id: 'walk-trail',
            type: 'line',
            source: 'your-walk',
            paint: { 'line-color': color.primary, 'line-width': 5 },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          });
          if (instance.getLayer('water_name')) instance.addLayer(MAP_WATER_POINT_LAYER);
          instance.addSource(MAP_STAMP_SOURCE, { type: 'geojson', data: stampData(null) });
          instance.addLayer(MAP_STAMP_CIRCLES);
          instance.addLayer(MAP_STAMP_SYMBOLS);
          setReady(true);
          onStatus('ready');
        });
        instance.on('error', () => {
          if (current) onStatus('error');
        });
      })
      .catch(() => {
        if (current) onStatus('error');
      });
    return () => {
      current = false;
      loading.abort();
      releaseExploration?.();
      releaseAttribution?.();
      marker.current?.remove();
      map.current?.remove();
      marker.current = null;
      map.current = null;
    };
  }, [onStatus, tracking]);
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    const source = instance.getSource<GeoJSONSource>('your-walk');
    source?.setData(routeData(walk));
    instance.getSource<GeoJSONSource>(MAP_STAMP_SOURCE)?.setData(stampData(walk));
    if (point) {
      marker.current?.setLngLat([point.longitude, point.latitude]).addTo(instance);
    } else marker.current?.remove();
    const move = tracking.next(walk, recenter, size);
    if (!move) return;
    if (move.kind === 'follow') {
      if (reduced) instance.jumpTo({ center: [...move.center] });
      else instance.easeTo({ center: [...move.center], duration: motion.standard });
    } else {
      if (move.view.kind === 'bounds') {
        const [west, south, east, north] = move.view.bounds;
        instance.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          {
            padding: recapPadding(instance),
            absolutePadding: true,
            duration: 0,
            bearing: 0,
            pitch: 0,
            maxZoom: 16,
          },
        );
      } else {
        instance.jumpTo({
          center: [...move.view.center],
          zoom: 16,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        });
      }
    }
  }, [point, ready, walk, recenter, size, reduced, tracking]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(() => {
      map.current?.resize();
      const element = container.current;
      if (element) {
        element.style.setProperty('--outside-map-height', `${element.clientHeight}px`);
        setSize(`${element.clientWidth}:${element.clientHeight}`);
      }
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: MapLibre mounts into this container div; the element stays as it was. */}
      <div
        ref={container}
        className="outside-street-map"
        role="region"
        aria-label="Real street map. Drag to explore."
        style={{ width: '100%', height: '100%' }}
      />
      {markerNode
        ? createPortal(
            <View style={styles.marker}>
              <Bruh skin={skin} size={42} />
            </View>,
            markerNode,
          )
        : null}
    </>
  );
}

const styles = StyleSheet.create({
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
