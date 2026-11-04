// Pure check for the waitlist route, so it can be tested without a build.
export function checkWaitlistUrl(value: string | undefined, deployed: boolean): string {
  if (!value)
    throw new Error(
      'Set PUBLIC_WAITLIST_URL to the Convex waitlist route, e.g. https://<deployment>.convex.site/waitlist (see .env.example).',
    );
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`PUBLIC_WAITLIST_URL is not a URL; got "${value}".`);
  }
  if (parsed.pathname !== '/waitlist') throw new Error(`PUBLIC_WAITLIST_URL must end in /waitlist; got "${value}".`);
  if (!deployed) return value;
  // Deployed builds are live: a loopback or plain-http route would drop every signup, and HTTP
  // actions only answer on .convex.site (the .convex.cloud client URL 404s them).
  if (parsed.protocol !== 'https:')
    throw new Error(`PUBLIC_WAITLIST_URL must use https for deployed builds; got "${value}".`);
  if (!parsed.hostname.endsWith('.convex.site'))
    throw new Error(
      `PUBLIC_WAITLIST_URL must be a .convex.site URL, where Convex serves HTTP actions; got "${value}".`,
    );
  return value;
}
