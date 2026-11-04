import { lastFix, type Walk } from './walk.ts';

export type WalkView =
  | Readonly<{ kind: 'point'; center: readonly [longitude: number, latitude: number] }>
  | Readonly<{ kind: 'bounds'; bounds: readonly [west: number, south: number, east: number, north: number] }>;

type CameraMove =
  | Readonly<{ kind: 'frame'; view: WalkView }>
  | Readonly<{ kind: 'follow'; center: readonly [longitude: number, latitude: number] }>;

// Follow accepted fixes until the player moves the map. Recenter and a new walk
// resume following; paused views and completed recaps keep their framing rules.
export function createWalkCamera(): Readonly<{
  explore: () => void;
  next: (walk: Walk | null, recenter: number, size: string) => CameraMove | null;
}> {
  let previousWalk: Walk | null = null;
  let view: WalkView | null = null;
  let framed: string | null = null;
  let following = true;
  let previousCenter: readonly [number, number] | null = null;
  return {
    explore: () => {
      following = false;
    },
    next: (walk, recenter, size) => {
      if (walk !== previousWalk) {
        previousWalk = walk;
        view = walkView(walk);
      }
      if (!walk || !view) {
        framed = null;
        following = true;
        previousCenter = null;
        return null;
      }
      const key = `${walk.startedAt}:${walk.status === 'complete' ? `recap:${size}` : 'walk'}:${recenter}`;
      const center = view.kind === 'point' ? view.center : null;
      const moved =
        center !== null && (center[0] !== previousCenter?.[0] || center[1] !== previousCenter?.[1]);
      previousCenter = center;
      if (key !== framed) {
        framed = key;
        following = true;
        return { kind: 'frame', view };
      }
      return walk.status === 'recording' && following && moved && center ? { kind: 'follow', center } : null;
    },
  };
}

export function walkView(walk: Walk | null): WalkView | null {
  const point = lastFix(walk);
  if (!point || !walk) return null;
  const location: WalkView = { kind: 'point', center: [point.longitude, point.latitude] };
  if (walk.status !== 'complete') return location;

  const points = walk.segments.flat();
  const longitudes = points.map((fix) => fix.longitude).sort((a, b) => a - b);
  const first = longitudes[0];
  const last = longitudes.at(-1);
  if (first === undefined || last === undefined) return location;
  let west = first;
  let east = last;
  let largestGap = first + 360 - last;
  // Excluding the largest empty arc also frames walks crossing the date line.
  for (let index = 1; index < longitudes.length; index += 1) {
    const previous = longitudes[index - 1];
    const current = longitudes[index];
    if (current - previous > largestGap) {
      largestGap = current - previous;
      west = current;
      east = previous + 360;
    }
  }
  let south = point.latitude;
  let north = point.latitude;
  for (const fix of points) {
    south = Math.min(south, fix.latitude);
    north = Math.max(north, fix.latitude);
  }
  return west === east && south === north ? location : { kind: 'bounds', bounds: [west, south, east, north] };
}
