import type { ConfigContext, ExpoConfig } from 'expo/config';

const URL_ERROR =
  'Set EXPO_PUBLIC_CONVEX_URL to the HTTPS URL of a hosted Convex deployment (ending in .convex.cloud) before building production.';

function productionBackendError(endpoint: string | undefined): string | null {
  if (!endpoint || endpoint !== endpoint.trim()) return URL_ERROR;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return URL_ERROR;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.port ||
    url.pathname !== '/' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*\.convex\.cloud$/.test(url.hostname)
  )
    return URL_ERROR;

  return null;
}

export default ({ config }: ConfigContext): Partial<ExpoConfig> => {
  if (process.env.BRUHS_BUILD_ENV === 'production' || process.env.EAS_BUILD_PROFILE === 'production') {
    const error = productionBackendError(process.env.EXPO_PUBLIC_CONVEX_URL);
    if (error) throw new Error(error);
  }
  // app.json remains the source of native settings; environment values are not
  // copied into the public manifest. URL validation does not verify a deployment.
  return config;
};
