export type Fix = Readonly<{
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}>;

export type Walk = Readonly<{
  version: 1;
  startedAt: number;
  updatedAt: number;
  elapsedMs: number;
  distanceMeters: number;
  status: 'recording' | 'paused' | 'complete';
  activeSince: number | null;
  segments: readonly (readonly Fix[])[];
}>;

// First-walk game balance. These are distance achievements, separate from step XP.
export const STAMPS = [
  { id: 'outside', name: 'out the door', meters: 250 },
  { id: 'wander', name: 'little wanderer', meters: 500 },
  { id: 'scenic', name: 'scenic bruh', meters: 1_000 },
] as const;
// Reject uncertainty greater than one fifth of the shortest achievement.
export const MAX_ROUTE_ACCURACY = STAMPS[0].meters / 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFix(value: unknown): value is Fix {
  return (
    isRecord(value) &&
    typeof value.latitude === 'number' &&
    Number.isFinite(value.latitude) &&
    Math.abs(value.latitude) <= 90 &&
    typeof value.longitude === 'number' &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.longitude) <= 180 &&
    typeof value.accuracy === 'number' &&
    Number.isFinite(value.accuracy) &&
    value.accuracy >= 0 &&
    isTime(value.timestamp)
  );
}

export function startWalk(now: number): Walk {
  return {
    version: 1,
    startedAt: now,
    updatedAt: now,
    elapsedMs: 0,
    distanceMeters: 0,
    status: 'recording',
    activeSince: now,
    segments: [[]],
  };
}

export function metersBetween(a: Fix, b: Fix): number {
  const radians = Math.PI / 180;
  const latitude = Math.sin(((b.latitude - a.latitude) * radians) / 2);
  const longitude = Math.sin(((b.longitude - a.longitude) * radians) / 2);
  const arc =
    latitude ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * longitude ** 2;
  // IUGG mean Earth radius, also used by MapLibre/Turf's spherical distance.
  return 6_371_008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, arc)));
}

export function recordFix(walk: Walk, fix: Fix): Walk {
  if (
    walk.status !== 'recording' ||
    !isFix(fix) ||
    fix.accuracy > MAX_ROUTE_ACCURACY ||
    fix.timestamp < walk.updatedAt
  )
    return walk;
  const segment = walk.segments.at(-1) ?? [];
  const previous = segment.at(-1);
  const distance = previous ? metersBetween(previous, fix) : 0;
  if (
    previous &&
    (fix.timestamp <= previous.timestamp || distance <= Math.max(previous.accuracy, fix.accuracy))
  )
    return walk;
  return {
    ...walk,
    updatedAt: fix.timestamp,
    distanceMeters: walk.distanceMeters + distance,
    segments: [...walk.segments.slice(0, -1), [...segment, fix]],
  };
}

export function elapsedWalk(walk: Walk, now: number): number {
  return walk.elapsedMs + (walk.activeSince === null ? 0 : Math.max(0, now - walk.activeSince));
}

export function formatWalkTime(ms: number): Readonly<{ clock: string; label: string }> {
  const seconds = Math.floor(ms / 1_000);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remaining = seconds % 60;
  const padded = (value: number): string => String(value).padStart(2, '0');
  const clock = hours
    ? `${hours}:${padded(minutes)}:${padded(remaining)}`
    : `${minutes}:${padded(remaining)}`;
  const parts = [
    [hours, 'hour'],
    [minutes, 'minute'],
    [remaining, 'second'],
  ] as const;
  const duration = parts
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `${value.toLocaleString()} ${unit}${value === 1 ? '' : 's'}`)
    .join(', ');
  return { clock, label: `Walk time: ${duration || '0 seconds'}` };
}

export function pauseWalk(walk: Walk, now: number): Walk {
  if (walk.status !== 'recording') return walk;
  const at = Math.max(walk.updatedAt, now);
  return { ...walk, status: 'paused', activeSince: null, elapsedMs: elapsedWalk(walk, at), updatedAt: at };
}

export function resumeWalk(walk: Walk, now: number): Walk {
  if (walk.status !== 'paused') return walk;
  const at = Math.max(walk.updatedAt, now);
  return {
    ...walk,
    status: 'recording',
    activeSince: at,
    updatedAt: at,
    segments: walk.segments.at(-1)?.length ? [...walk.segments, []] : walk.segments,
  };
}

export function finishWalk(walk: Walk, now: number): Walk {
  if (walk.status === 'complete') return walk;
  return { ...pauseWalk(walk, now), status: 'complete', updatedAt: Math.max(walk.updatedAt, now) };
}

function isTime(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    !Number.isNaN(new Date(value).getTime())
  );
}

export function decodeWalk(
  raw: string,
): Readonly<{ ok: true; walk: Walk }> | Readonly<{ ok: false; message: string }> {
  const failure = {
    ok: false,
    message: 'couldn’t open your saved walk. it has been kept on this device.',
  } as const;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return failure;
  }
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isTime(value.startedAt) ||
    !isTime(value.updatedAt) ||
    value.updatedAt < value.startedAt ||
    typeof value.elapsedMs !== 'number' ||
    !Number.isFinite(value.elapsedMs) ||
    value.elapsedMs < 0 ||
    value.elapsedMs > value.updatedAt - value.startedAt ||
    typeof value.distanceMeters !== 'number' ||
    !Number.isFinite(value.distanceMeters) ||
    value.distanceMeters < 0 ||
    !['recording', 'paused', 'complete'].includes(String(value.status)) ||
    !Array.isArray(value.segments) ||
    value.segments.length === 0
  )
    return failure;
  const status = value.status;
  if (status !== 'recording' && status !== 'paused' && status !== 'complete') return failure;
  const activeSince = value.activeSince;
  if (
    status === 'recording'
      ? !isTime(activeSince) || activeSince < value.startedAt || activeSince > value.updatedAt
      : activeSince !== null
  )
    return failure;
  if (
    typeof activeSince === 'number' &&
    value.elapsedMs + value.updatedAt - activeSince > value.updatedAt - value.startedAt
  )
    return failure;
  const segments: Fix[][] = [];
  let at = value.startedAt;
  let distance = 0;
  for (const segment of value.segments) {
    if (!Array.isArray(segment) || !segment.every(isFix)) return failure;
    let previous: Fix | null = null;
    for (const fix of segment) {
      if (
        fix.accuracy > MAX_ROUTE_ACCURACY ||
        fix.timestamp < at ||
        fix.timestamp > value.updatedAt ||
        (previous && fix.timestamp <= previous.timestamp)
      )
        return failure;
      if (previous) distance += metersBetween(previous, fix);
      at = fix.timestamp;
      previous = fix;
    }
    segments.push(segment);
  }
  if (distance !== value.distanceMeters) return failure;
  const walk: Walk = {
    version: 1,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    elapsedMs: value.elapsedMs,
    distanceMeters: distance,
    status,
    activeSince: typeof activeSince === 'number' ? activeSince : null,
    segments,
  };
  return { ok: true, walk: pauseWalk(walk, walk.updatedAt) };
}

export function lastFix(walk: Walk | null): Fix | null {
  if (!walk) return null;
  for (let index = walk.segments.length - 1; index >= 0; index -= 1) {
    const fix = walk.segments[index]?.at(-1);
    if (fix) return fix;
  }
  return null;
}

export type RouteData = {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: Record<string, never>;
    geometry: { type: 'MultiLineString'; coordinates: number[][][] };
  }[];
};

export type StampData = {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    id: number;
    properties: Record<string, never>;
    geometry: { type: 'Point'; coordinates: [number, number] };
  }[];
};

export function stampData(walk: Walk | null): StampData {
  const data: StampData = { type: 'FeatureCollection', features: [] };
  if (!walk || walk.distanceMeters < STAMPS[0].meters) return data;
  let traveled = 0;
  for (const segment of walk.segments) {
    let previous: Fix | null = null;
    for (const fix of segment) {
      if (previous) {
        const distance = metersBetween(previous, fix);
        let next = STAMPS[data.features.length];
        while (distance > 0 && next && next.meters <= traveled + distance) {
          const fraction = (next.meters - traveled) / distance;
          // Match the route's short date-line crossing rather than passing Greenwich.
          const delta = fix.longitude - previous.longitude;
          const longitudeArc = delta > 180 ? delta - 360 : delta < -180 ? delta + 360 : delta;
          data.features.push({
            type: 'Feature',
            // Vector tiles encode numeric IDs; the existing meter targets are unique.
            id: next.meters,
            properties: {},
            geometry: {
              type: 'Point',
              coordinates: [
                ((previous.longitude + longitudeArc * fraction + 540) % 360) - 180,
                previous.latitude + (fix.latitude - previous.latitude) * fraction,
              ],
            },
          });
          // Later fixes cannot earn additional stamps beyond the existing final target.
          if (data.features.length === STAMPS.length) return data;
          next = STAMPS[data.features.length];
        }
        traveled += distance;
      }
      previous = fix;
    }
  }
  return data;
}

function routeLines(segment: readonly Fix[]): number[][][] {
  const lines: number[][][] = [];
  let line: number[][] = [];
  let previous: Fix | null = null;
  for (const fix of segment) {
    if (previous && Math.abs(fix.longitude - previous.longitude) > 180) {
      const eastward = fix.longitude < previous.longitude;
      const boundary = eastward ? 180 : -180;
      const unwrapped = fix.longitude + (eastward ? 360 : -360);
      // Opposite ±180 coordinates describe the same meridian, even at different latitudes.
      const fraction =
        unwrapped === previous.longitude
          ? 1
          : (boundary - previous.longitude) / (unwrapped - previous.longitude);
      const latitude = previous.latitude + (fix.latitude - previous.latitude) * fraction;
      if (previous.longitude !== boundary || previous.latitude !== latitude) line.push([boundary, latitude]);
      if (line.length > 1) lines.push(line);
      line = [[-boundary, latitude]];
    }
    const end = line.at(-1);
    if (!end || end[0] !== fix.longitude || end[1] !== fix.latitude) line.push([fix.longitude, fix.latitude]);
    previous = fix;
  }
  if (line.length > 1) lines.push(line);
  return lines;
}

export function routeData(walk: Walk | null): RouteData {
  const coordinates = walk?.segments.flatMap(routeLines) ?? [];
  return {
    type: 'FeatureCollection',
    features: coordinates.length
      ? [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates } }]
      : [],
  };
}

export function distanceParts(meters: number): Readonly<{ value: string; unit: 'm' | 'km' }> {
  return meters < 1_000
    ? { value: Math.floor(meters).toLocaleString(), unit: 'm' }
    : { value: Number((meters / 1_000).toFixed(2)).toString(), unit: 'km' };
}

export function formatDistance(meters: number): string {
  const { value, unit } = distanceParts(meters);
  return `${value} ${unit}`;
}
