import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserLocation } from './browser-location.ts';
import type { LocationFailure } from './recorder.ts';

test('browser GPS requests high accuracy, delivers errors, and cancels its returned watch ID', async () => {
  let receive: PositionCallback = () => {};
  let failure: PositionErrorCallback | null = null;
  let options: PositionOptions | undefined;
  const cleared: number[] = [];
  const port = createBrowserLocation(() => ({
    geolocation: {
      watchPosition: (success, error, config) => {
        receive = success;
        failure = error ?? null;
        options = config;
        return 941;
      },
      clearWatch: (id) => cleared.push(id),
    },
  }));
  assert.equal(await port.availability(), 'available');
  assert.deepEqual(await port.requestPermission(), { status: 'prompt' });
  const fixes: unknown[] = [];
  const errors: LocationFailure[] = [];
  const watch = await port.watch(
    (value) => fixes.push(value),
    (value) => errors.push(value),
  );
  assert.equal(options?.enableHighAccuracy, true);
  receive({
    coords: {
      latitude: 40.7,
      longitude: -73.9,
      accuracy: 8,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: 1_000.25,
    toJSON: () => ({}),
  });
  assert.deepEqual(fixes, [{ latitude: 40.7, longitude: -73.9, accuracy: 8, timestamp: 1_000.25 }]);
  const report = failure as PositionErrorCallback | null;
  assert.ok(report);
  const error: GeolocationPositionError = {
    code: 1,
    message: 'denied',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };
  report(error);
  report({ ...error, code: 2 });
  assert.deepEqual(errors, ['permission', 'unavailable']);
  watch.remove();
  assert.deepEqual(cleared, [941]);
});

test('a denied browser permission is actionable and unsupported querying still allows the prompt', async () => {
  const denied = createBrowserLocation(() => ({
    permissions: { query: async () => ({ state: 'denied' }) as PermissionStatus },
  }));
  assert.deepEqual(await denied.requestPermission(), { status: 'denied', canAskAgain: false });
  const unsupported = createBrowserLocation(() => ({
    permissions: {
      query: async () => {
        throw new Error('Unsupported permission');
      },
    },
  }));
  assert.deepEqual(await unsupported.requestPermission(), { status: 'prompt' });
  assert.equal(await unsupported.availability(), 'unsupported');
  assert.equal(await createBrowserLocation(() => null).availability(), 'unsupported');
});
