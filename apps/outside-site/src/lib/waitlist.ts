// Where the form posts. Required at build time: a page whose waitlist silently goes nowhere
// would lose every signup.
const url = import.meta.env.PUBLIC_WAITLIST_URL;

function checked(value: string | undefined): string {
  if (!value)
    throw new Error(
      'Set PUBLIC_WAITLIST_URL to the Convex waitlist route, e.g. https://<deployment>.convex.site/waitlist (see .env.example).',
    );
  const parsed = new URL(value);
  if (parsed.pathname !== '/waitlist')
    throw new Error(`PUBLIC_WAITLIST_URL must end in /waitlist; got "${value}".`);
  // Vercel builds are deploys: a loopback or plain-http route there would drop every signup.
  if (process.env.VERCEL === '1' && parsed.protocol !== 'https:')
    throw new Error(`PUBLIC_WAITLIST_URL must use https for deployed builds; got "${value}".`);
  return value;
}

export const WAITLIST_URL = checked(url);
// Removal lives beside signup on the same Convex route.
export const LEAVE_URL = `${WAITLIST_URL}/leave`;
