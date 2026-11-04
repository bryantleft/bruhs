import type { LocationPorts } from './recorder.ts';

type BrowserLocation = Readonly<{
  geolocation?: Pick<Geolocation, 'watchPosition' | 'clearWatch'>;
  permissions?: Pick<Permissions, 'query'>;
}>;

export function createBrowserLocation(getBrowser: () => BrowserLocation | null): LocationPorts {
  return {
    availability: async () => (getBrowser()?.geolocation ? 'available' : 'unsupported'),
    requestPermission: async () => {
      try {
        const permission = await getBrowser()?.permissions?.query({ name: 'geolocation' });
        if (permission?.state === 'denied') return { status: 'denied', canAskAgain: false };
        if (permission?.state === 'granted') return { status: 'granted' };
      } catch {
        // Some browsers do not support querying geolocation permission.
      }
      return { status: 'prompt' };
    },
    watch: async (fix, error) => {
      const geolocation = getBrowser()?.geolocation;
      if (!geolocation) throw new Error('Geolocation is unavailable.');
      const watchId = geolocation.watchPosition(
        (position) =>
          fix({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          }),
        (failure) => error(failure.code === 1 ? 'permission' : 'unavailable'),
        { enableHighAccuracy: true },
      );
      return { remove: () => geolocation.clearWatch(watchId) };
    },
  };
}
