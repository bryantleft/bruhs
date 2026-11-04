import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { SkinId } from '../game/game';
import { palette } from '../theme/palette';
import { color, layout, space } from '../theme/theme';
import type { Walk } from './walk';

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
export const MAP_STAMP_SOURCE = 'outside-walk-stamps';
export const MAP_STAMP_CIRCLES = {
  id: 'outside-walk-stamp-badges',
  type: 'circle',
  source: MAP_STAMP_SOURCE,
  paint: {
    'circle-radius': 14,
    'circle-color': color.panel,
    'circle-stroke-color': color.success,
    'circle-stroke-width': 2,
  },
} satisfies CircleLayerSpecification;
export const MAP_STAMP_SYMBOLS = {
  id: 'outside-walk-stamp-symbols',
  type: 'symbol',
  source: MAP_STAMP_SOURCE,
  layout: {
    'text-field': '✓',
    'text-font': ['Noto Sans Regular'],
    'text-size': 12,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  paint: { 'text-color': color.success },
} satisfies SymbolLayerSpecification;
export const MAP_WATER_LAYER = {
  id: 'water',
  type: 'fill',
  source: 'openmaptiles',
  'source-layer': 'water',
  paint: { 'fill-color': palette['blueberry-950'] },
} satisfies FillLayerSpecification;
// Current tiles also contain water-name points, which the provider's line-only layer excludes.
export const MAP_WATER_POINT_LAYER = {
  id: 'outside-water-names',
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': 'water_name',
  filter: ['==', ['geometry-type'], 'Point'],
  layout: {
    'symbol-placement': 'point',
    'text-field': [
      'case',
      ['has', 'name:nonlatin'],
      ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']],
      ['coalesce', ['get', 'name_en'], ['get', 'name']],
    ],
    'text-font': ['Noto Sans Regular'],
    'text-rotation-alignment': 'viewport',
    'text-size': 12,
  },
  paint: {
    'text-color': palette['blueberry-200'],
    'text-halo-color': palette['blueberry-950'],
    'text-halo-width': 1,
  },
} satisfies SymbolLayerSpecification;
export const MAP_ROAD_LABELS = [
  { id: 'highway_name_other', textColor: color.secondary },
  { id: 'highway_name_motorway', textColor: color.text },
] as const;
export const MAP_PLACE_LAYERS = ['place_town', 'place_city', 'place_city_large'] as const;
export const MAP_MINOR_PLACE_LAYERS = [
  'place_other',
  'place_suburb',
  'place_village',
  'place_state',
] as const;
export const MAP_COUNTRY_LAYERS = [
  'place_country_other',
  'place_country_minor',
  'place_country_major',
] as const;
// The provider's atlas uses an underscore; its place layers request a missing hyphenated name.
export const MAP_PLACE_LAYOUT = {
  'icon-image': ['step', ['zoom'], 'circle_11', 9, ''],
} satisfies NonNullable<SymbolLayerSpecification['layout']>;
export const MAP_PLACE_PAINT = {
  'text-color': color.muted,
} satisfies NonNullable<SymbolLayerSpecification['paint']>;
export const MAP_PATH_LAYER = {
  id: 'highway_path',
  type: 'line',
  source: 'openmaptiles',
  'source-layer': 'transportation',
  paint: { 'line-color': color.faint },
} satisfies LineLayerSpecification;
const greenSpacePaint = {
  'fill-color': palette['pandan-900'],
  'fill-opacity': ['interpolate', ['exponential', 0.3], ['zoom'], 8, 0, 10, 0.8, 13, 0.4],
  'fill-translate': [0, 0],
} satisfies NonNullable<FillLayerSpecification['paint']>;
// Current tiles encode park grounds as grass landcover, not park landuse.
export const MAP_PARK_FILL = {
  id: 'outside-parks',
  type: 'fill',
  source: 'openmaptiles',
  'source-layer': 'landcover',
  minzoom: 10,
  filter: [
    'all',
    ['match', ['geometry-type'], ['MultiPolygon', 'Polygon'], true, false],
    ['==', ['get', 'class'], 'grass'],
    ['==', ['get', 'subclass'], 'park'],
  ],
  paint: greenSpacePaint,
} satisfies FillLayerSpecification;
export const MAP_WOODLAND_LAYER = 'landcover_wood';
// Keep woodland visible without the provider's missing wood-pattern sprite.
export const MAP_WOODLAND_FILL = {
  id: 'outside-woodland',
  type: 'fill',
  source: 'openmaptiles',
  'source-layer': 'landcover',
  minzoom: 10,
  filter: [
    'all',
    ['match', ['geometry-type'], ['MultiPolygon', 'Polygon'], true, false],
    ['==', ['get', 'class'], 'wood'],
  ],
  paint: greenSpacePaint,
} satisfies FillLayerSpecification;
export const MAP_MARKER_SIZE = 52;
const markerInset = MAP_MARKER_SIZE / 2 + space.related;
// Leave room for the whole marker, with a touch target below for map attribution.
export const WALK_MAP_PADDING = {
  top: markerInset,
  right: markerInset,
  bottom: markerInset + layout.touch,
  left: markerInset,
};
export type MapStatus = 'loading' | 'ready' | 'error';
export type StreetMapProps = Readonly<{
  walk: Walk | null;
  skin: SkinId;
  recenter: number;
  onStatus: (status: MapStatus) => void;
}>;
