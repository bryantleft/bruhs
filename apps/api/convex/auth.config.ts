import type { AuthConfig } from 'convex/server';

const domain = process.env.CONVEX_SITE_URL;
if (!domain) throw new Error('Convex Auth requires the deployment CONVEX_SITE_URL. Run convex dev first.');

export default {
  providers: [{ domain, applicationID: 'convex' }],
} satisfies AuthConfig;
