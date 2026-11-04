import * as Location from 'expo-location';
import type { LocationPorts } from './recorder';

export const locationPorts: LocationPorts = {
  availability: async () => ((await Location.hasServicesEnabledAsync()) ? 'available' : 'disabled'),
  requestPermission: async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    return permission.granted
      ? { status: 'granted' }
      : { status: 'denied', canAskAgain: permission.canAskAgain };
  },
  watch: (fix, error) =>
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High },
      (value) =>
        fix({
          latitude: value.coords.latitude,
          longitude: value.coords.longitude,
          accuracy: value.coords.accuracy,
          timestamp: value.timestamp,
        }),
      () => error('unavailable'),
    ),
};
