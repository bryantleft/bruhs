import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeWalk,
  distanceParts,
  type Fix,
  finishWalk,
  formatDistance,
  formatWalkTime,
  metersBetween,
  pauseWalk,
  recordFix,
  resumeWalk,
  routeData,
  stampData,
  startWalk,
} from './walk.ts';

const origin: Fix = { latitude: 0, longitude: 0, accuracy: 5, timestamp: 1_000 };

function north(meters: number, timestamp = 2_000): Fix {
  return { ...origin, latitude: (meters / 6_371_008.8) * (180 / Math.PI), timestamp };
}

test('earned stamp points are interpolated along a recorded segment without changing the walk', () => {
  const walk = recordFix(recordFix(startWalk(0), origin), north(1_500));
  const original = JSON.stringify(walk);
  const stamps = stampData(walk);
  assert.deepEqual(
    stamps.features.map(({ id }) => id),
    [250, 500, 1_000],
  );
  for (const [index, meters] of [250, 500, 1_000].entries()) {
    const coordinates = stamps.features[index]?.geometry.coordinates;
    assert.ok(coordinates);
    assert.equal(coordinates[0], 0);
    assert.ok(Math.abs(coordinates[1] - north(meters).latitude) < 1e-10);
  }
  assert.equal(JSON.stringify(walk), original);
  assert.deepEqual(stampData(walk), stamps);
});

test('stamp points appear only after their existing distance thresholds are earned', () => {
  assert.deepEqual(stampData(null).features, []);
  assert.deepEqual(stampData(startWalk(0)).features, []);
  assert.deepEqual(stampData(recordFix(startWalk(0), origin)).features, []);
  for (const [meters, expected] of [
    [249.9, 0],
    [250.1, 1],
    [499.9, 1],
    [500.1, 2],
    [999.9, 2],
    [1_000.1, 3],
  ]) {
    const walk = recordFix(recordFix(startWalk(0), origin), north(meters));
    assert.equal(stampData(walk).features.length, expected);
  }
});

test('stamp interpolation skips unrecorded pause gaps and survives completion and reload', () => {
  let walk = recordFix(recordFix(startWalk(0), origin), north(150));
  walk = resumeWalk(pauseWalk(walk, 3_000), 4_000);
  walk = recordFix(walk, { ...origin, latitude: 10, longitude: 20, timestamp: 5_000 });
  assert.deepEqual(stampData(walk).features, []);
  walk = recordFix(walk, {
    ...north(200),
    latitude: 10 + north(200).latitude,
    longitude: 20,
    timestamp: 6_000,
  });
  const data = stampData(walk);
  assert.equal(data.features.length, 1);
  const point = data.features[0]?.geometry.coordinates;
  assert.ok(point);
  assert.equal(point[0], 20);
  assert.ok(Math.abs(point[1] - (10 + north(100).latitude)) < 1e-10);
  const finished = finishWalk(walk, 7_000);
  const restored = decodeWalk(JSON.stringify(finished));
  assert.equal(restored.ok, true);
  assert.deepEqual(stampData(restored.walk), data);
});

test('stamp points follow the short date-line crossing in either direction', () => {
  for (const direction of [1, -1]) {
    const first = { ...origin, longitude: direction * 179.998 };
    const last = { ...origin, longitude: direction * -179.988, timestamp: 2_000 };
    const walk = recordFix(recordFix(startWalk(0), first), last);
    const points = stampData(walk).features;
    assert.equal(points.length, 3);
    for (const feature of points) {
      const [longitude, latitude] = feature.geometry.coordinates;
      assert.ok(Number.isFinite(longitude) && Math.abs(longitude) <= 180);
      assert.ok(Math.abs(longitude) > 179.98);
      assert.equal(latitude, 0);
    }
  }
});

test('stamp points retain the rendered route direction for exact half-world edges', () => {
  for (const direction of [1, -1]) {
    const walk = recordFix(recordFix(startWalk(0), origin), {
      ...origin,
      longitude: 180 * direction,
      timestamp: 2_000,
    });
    assert.deepEqual(routeData(walk).features[0]?.geometry.coordinates, [
      [
        [0, 0],
        [180 * direction, 0],
      ],
    ]);
    const points = stampData(walk).features;
    assert.equal(points.length, 3);
    for (const [index, meters] of [250, 500, 1_000].entries()) {
      const point = points[index]?.geometry.coordinates;
      assert.ok(point);
      assert.ok(Math.abs(point[0] - direction * north(meters).latitude) < 1e-10);
      assert.equal(point[1], 0);
    }
  }
});

test('repeated valid positions do not create non-finite stamp coordinates', () => {
  const end = north(1_500, 3_000);
  const walk = finishWalk(recordFix(recordFix(startWalk(0), origin), end), 4_000);
  const restored = decodeWalk(
    JSON.stringify({
      ...walk,
      segments: [[origin, { ...origin, timestamp: 2_000 }, end]],
      distanceMeters: metersBetween(origin, end),
    }),
  );
  assert.equal(restored.ok, true);
  const points = stampData(restored.walk).features;
  assert.equal(points.length, 3);
  assert.ok(points.every(({ geometry }) => geometry.coordinates.every(Number.isFinite)));
});

test('walk time keeps minutes and seconds until the first whole hour', () => {
  for (const [ms, clock, label] of [
    [0, '0:00', 'Walk time: 0 seconds'],
    [999, '0:00', 'Walk time: 0 seconds'],
    [1_000, '0:01', 'Walk time: 1 second'],
    [59_999, '0:59', 'Walk time: 59 seconds'],
    [60_000, '1:00', 'Walk time: 1 minute'],
    [3_599_999, '59:59', 'Walk time: 59 minutes, 59 seconds'],
  ] as const) {
    assert.deepEqual(formatWalkTime(ms), { clock, label });
  }
});

test('walk time carries into hours and does not wrap after a day', () => {
  for (const [ms, clock, label] of [
    [3_600_000, '1:00:00', 'Walk time: 1 hour'],
    [4_500_000, '1:15:00', 'Walk time: 1 hour, 15 minutes'],
    [3_661_000, '1:01:01', 'Walk time: 1 hour, 1 minute, 1 second'],
    [90_061_000, '25:01:01', 'Walk time: 25 hours, 1 minute, 1 second'],
  ] as const) {
    assert.deepEqual(formatWalkTime(ms), { clock, label });
  }
});

test('date-line route geometry follows the short crossing in both directions without joining pause gaps', () => {
  for (const direction of [1, -1]) {
    let walk = recordFix(startWalk(0), {
      ...origin,
      longitude: direction * 179.999,
    });
    walk = recordFix(walk, {
      ...origin,
      longitude: direction * -179.999,
      latitude: 0.002,
      timestamp: 2_000,
    });
    walk = resumeWalk(pauseWalk(walk, 3_000), 4_000);
    walk = recordFix(walk, { ...origin, longitude: 1, timestamp: 5_000 });
    walk = recordFix(walk, { ...origin, longitude: 1.001, timestamp: 6_000 });
    const original = JSON.stringify(walk);
    assert.deepEqual(routeData(walk).features[0]?.geometry.coordinates, [
      [
        [direction * 179.999, 0],
        [direction * 180, 0.001],
      ],
      [
        [direction * -180, 0.001],
        [direction * -179.999, 0.002],
      ],
      [
        [1, 0],
        [1.001, 0],
      ],
    ]);
    assert.equal(JSON.stringify(walk), original);
  }
});

test('route points exactly on the date line stay finite and produce no duplicate-only segment', () => {
  let walk = recordFix(startWalk(0), { ...origin, longitude: 180 });
  walk = recordFix(walk, { ...origin, longitude: -180, latitude: 0.001, timestamp: 2_000 });
  walk = recordFix(walk, { ...origin, longitude: -179.999, latitude: 0.002, timestamp: 3_000 });
  assert.deepEqual(routeData(walk).features[0]?.geometry.coordinates, [
    [
      [180, 0],
      [180, 0.001],
    ],
    [
      [-180, 0.001],
      [-179.999, 0.002],
    ],
  ]);
});

test('distance values keep their units and useful decimal places across the kilometer boundary', () => {
  for (const [meters, value, unit] of [
    [0, '0', 'm'],
    [999.9, '999', 'm'],
    [1_000, '1', 'km'],
    [1_010, '1.01', 'km'],
    [1_200, '1.2', 'km'],
    [12_260.365, '12.26', 'km'],
    [123_456, '123.46', 'km'],
  ] as const) {
    assert.deepEqual(distanceParts(meters), { value, unit });
    assert.equal(formatDistance(meters), `${value} ${unit}`);
  }
});

test('a real route measures GPS movement rather than inventing steps', () => {
  const walk = recordFix(recordFix(startWalk(0), origin), {
    ...origin,
    latitude: 0.001,
    timestamp: 101_000,
  });
  assert.ok(walk.distanceMeters > 111 && walk.distanceMeters < 112);
  assert.equal(walk.segments[0]?.length, 2);
});

test('pausing stops recording and resuming never joins an unrecorded gap', () => {
  const first = recordFix(startWalk(0), origin);
  const paused = pauseWalk(first, 2_000);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.elapsedMs, 2_000);
  assert.equal(recordFix(paused, { ...origin, latitude: 1, timestamp: 3_000 }), paused);
  const resumed = resumeWalk(paused, 10_000);
  const next = recordFix(resumed, { ...origin, latitude: 1, timestamp: 11_000 });
  assert.equal(next.distanceMeters, 0);
  assert.equal(next.segments.length, 2);
  const complete = finishWalk(next, 12_000);
  assert.equal(complete.status, 'complete');
  assert.equal(complete.elapsedMs, 4_000);
  assert.equal(finishWalk(complete, 30_000), complete);
  assert.equal(resumeWalk(complete, 30_000), complete);
});

test('weak GPS, jitter, invalid coordinates and stale fixes do not earn distance', () => {
  const walk = recordFix(startWalk(0), origin);
  for (const fix of [
    { ...origin, latitude: 0.001, accuracy: 80, timestamp: 2_000 },
    { ...origin, latitude: 0.00001, timestamp: 2_000 },
    { ...origin, latitude: 91, timestamp: 2_000 },
    { ...origin, longitude: Number.NaN, timestamp: 2_000 },
    { ...origin, latitude: 0.001, timestamp: 500 },
  ])
    assert.equal(recordFix(walk, fix), walk);
});

test('restoring an interrupted walk pauses at its saved time and rejects corrupt totals', () => {
  const walk = recordFix(recordFix(startWalk(0), origin), { ...origin, latitude: 0.001, timestamp: 101_000 });
  const restored = decodeWalk(JSON.stringify(walk));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.walk.status, 'paused');
  assert.equal(restored.walk.elapsedMs, 101_000);
  assert.equal(restored.walk.distanceMeters, walk.distanceMeters);
  assert.equal(decodeWalk(JSON.stringify({ ...walk, distanceMeters: 1_000 })).ok, false);
  assert.equal(
    decodeWalk(JSON.stringify({ ...walk, segments: [[{ ...origin, longitude: 181 }]] })).ok,
    false,
  );
  assert.equal(decodeWalk('{').ok, false);
  const complete = finishWalk(walk, 110_000);
  assert.deepEqual(decodeWalk(JSON.stringify(complete)), { ok: true, walk: complete });
});
