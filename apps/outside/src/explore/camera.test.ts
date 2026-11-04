import assert from 'node:assert/strict';
import test from 'node:test';
import { createWalkCamera, walkView } from './camera.ts';
import { finishWalk, pauseWalk, recordFix, resumeWalk, startWalk } from './walk.ts';

test('the completed view includes every recorded segment instead of only the final fix', () => {
  let walk = recordFix(startWalk(0), { latitude: 40, longitude: -74, accuracy: 5, timestamp: 1_000 });
  walk = recordFix(walk, { latitude: 40.01, longitude: -73.99, accuracy: 5, timestamp: 2_000 });
  walk = resumeWalk(pauseWalk(walk, 3_000), 4_000);
  walk = recordFix(walk, { latitude: 40.02, longitude: -74.02, accuracy: 5, timestamp: 5_000 });
  const distance = walk.distanceMeters;
  assert.deepEqual(walkView(finishWalk(walk, 6_000)), {
    kind: 'bounds',
    bounds: [-74.02, 40, -73.99, 40.02],
  });
  assert.equal(walk.distanceMeters, distance);
  assert.equal(walk.segments.length, 2);
});

test('empty, recording, paused, and single-point walks keep their location behavior', () => {
  assert.equal(walkView(null), null);
  assert.equal(walkView(startWalk(0)), null);
  const walk = recordFix(startWalk(0), { latitude: 40, longitude: -74, accuracy: 5, timestamp: 1_000 });
  const view = { kind: 'point', center: [-74, 40] };
  assert.deepEqual(walkView(walk), view);
  assert.deepEqual(walkView(pauseWalk(walk, 2_000)), view);
  assert.deepEqual(walkView(finishWalk(walk, 2_000)), view);
});

test('a completed route crossing the date line uses the short longitude span in either direction', () => {
  for (const longitudes of [
    [179.5, -179.5],
    [-179.5, 179.5],
  ]) {
    let walk = startWalk(0);
    for (const [index, longitude] of longitudes.entries())
      walk = recordFix(walk, { latitude: 10, longitude, accuracy: 5, timestamp: (index + 1) * 1_000 });
    assert.deepEqual(walkView(finishWalk(walk, 3_000)), {
      kind: 'bounds',
      bounds: [179.5, 10, 180.5, 10],
    });
  }
});

test('a live walk follows accepted movement without repeating camera moves for the same fix', () => {
  const camera = createWalkCamera();
  assert.equal(camera.next(null, 0, '348:348'), null);
  let walk = recordFix(startWalk(0), { latitude: 40, longitude: -74, accuracy: 5, timestamp: 1_000 });
  assert.deepEqual(camera.next(walk, 0, '348:348'), {
    kind: 'frame',
    view: { kind: 'point', center: [-74, 40] },
  });
  walk = recordFix(walk, { latitude: 40, longitude: -73.995, accuracy: 5, timestamp: 2_000 });
  const original = JSON.stringify(walk);
  assert.deepEqual(camera.next(walk, 0, '348:348'), { kind: 'follow', center: [-73.995, 40] });
  assert.equal(camera.next(walk, 0, '278:278'), null);
  assert.equal(camera.next({ ...walk }, 0, '278:278'), null);
  assert.equal(JSON.stringify(walk), original);
});

test('exploring keeps the chosen view through fixes and pause gaps until recenter resumes following', () => {
  const camera = createWalkCamera();
  let walk = recordFix(startWalk(0), { latitude: 40, longitude: -74, accuracy: 5, timestamp: 1_000 });
  camera.next(walk, 0, '348:348');
  camera.explore();
  walk = recordFix(walk, { latitude: 40, longitude: -73.995, accuracy: 5, timestamp: 2_000 });
  assert.equal(camera.next(walk, 0, '348:348'), null);
  walk = pauseWalk(walk, 3_000);
  assert.equal(camera.next(walk, 0, '348:348'), null);
  const distance = walk.distanceMeters;
  walk = resumeWalk(walk, 4_000);
  walk = recordFix(walk, { latitude: 40.02, longitude: -73.99, accuracy: 5, timestamp: 5_000 });
  assert.equal(walk.distanceMeters, distance);
  assert.equal(camera.next(walk, 0, '348:348'), null);
  assert.deepEqual(camera.next(walk, 1, '348:348'), {
    kind: 'frame',
    view: { kind: 'point', center: [-73.99, 40.02] },
  });
  walk = recordFix(walk, { latitude: 40.02, longitude: -73.985, accuracy: 5, timestamp: 6_000 });
  assert.deepEqual(camera.next(walk, 1, '348:348'), { kind: 'follow', center: [-73.985, 40.02] });
});

test('pausing retains follow intent and resumes on the first fix without joining the unrecorded gap', () => {
  const camera = createWalkCamera();
  let walk = recordFix(startWalk(0), { latitude: 40, longitude: -74, accuracy: 5, timestamp: 1_000 });
  camera.next(walk, 0, '348:348');
  walk = pauseWalk(walk, 2_000);
  assert.equal(camera.next(walk, 0, '348:348'), null);
  walk = resumeWalk(walk, 3_000);
  assert.equal(camera.next(walk, 0, '348:348'), null);
  walk = recordFix(walk, { latitude: 41, longitude: -73, accuracy: 5, timestamp: 4_000 });
  assert.deepEqual(camera.next(walk, 0, '348:348'), { kind: 'follow', center: [-73, 41] });
  assert.equal(walk.distanceMeters, 0);
});

test('completion, recap resize, repeated recenter, and a new walk retain their framing behavior', () => {
  const camera = createWalkCamera();
  let walk = recordFix(startWalk(0), { latitude: 40, longitude: -74, accuracy: 5, timestamp: 1_000 });
  walk = recordFix(walk, { latitude: 40.01, longitude: -73.99, accuracy: 5, timestamp: 2_000 });
  camera.next(walk, 0, '348:348');
  camera.explore();
  walk = finishWalk(walk, 3_000);
  const frame = { kind: 'frame', view: { kind: 'bounds', bounds: [-74, 40, -73.99, 40.01] } };
  assert.deepEqual(camera.next(walk, 0, '348:348'), frame);
  camera.explore();
  assert.equal(camera.next(walk, 0, '348:348'), null);
  assert.deepEqual(camera.next(walk, 0, '278:278'), frame);
  assert.deepEqual(camera.next(walk, 1, '278:278'), frame);
  assert.deepEqual(camera.next(walk, 2, '278:278'), frame);
  camera.explore();
  const next = recordFix(startWalk(4_000), { latitude: 42, longitude: -72, accuracy: 5, timestamp: 5_000 });
  assert.deepEqual(camera.next(next, 2, '278:278'), {
    kind: 'frame',
    view: { kind: 'point', center: [-72, 42] },
  });
  camera.explore();
  assert.equal(camera.next(null, 2, '278:278'), null);
  assert.deepEqual(camera.next(next, 2, '278:278'), {
    kind: 'frame',
    view: { kind: 'point', center: [-72, 42] },
  });
});

test('following crosses the date line in either direction without changing the route or recap bounds', () => {
  for (const [first, second] of [
    [179.999, -179.999],
    [-179.999, 179.999],
  ]) {
    const camera = createWalkCamera();
    let walk = recordFix(startWalk(0), { latitude: 10, longitude: first, accuracy: 5, timestamp: 1_000 });
    camera.next(walk, 0, '348:348');
    walk = recordFix(walk, { latitude: 10, longitude: second, accuracy: 5, timestamp: 2_000 });
    const original = JSON.stringify(walk);
    assert.deepEqual(camera.next(walk, 0, '348:348'), { kind: 'follow', center: [second, 10] });
    assert.equal(JSON.stringify(walk), original);
    const frame = camera.next(finishWalk(walk, 3_000), 0, '348:348');
    assert.deepEqual(frame, {
      kind: 'frame',
      view: { kind: 'bounds', bounds: [179.999, 10, 180.001, 10] },
    });
  }
});
