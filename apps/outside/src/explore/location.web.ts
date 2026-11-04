import { createBrowserLocation } from './browser-location';

export const locationPorts = createBrowserLocation(() =>
  typeof navigator === 'undefined' ? null : navigator,
);
