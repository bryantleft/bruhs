import { checkWaitlistUrl } from './waitlist-url.ts';

// Where the forms post. Required at build time: a page whose waitlist silently goes nowhere
// would lose every signup. Vercel builds are deploys, so they get the strict checks.
export const WAITLIST_URL = checkWaitlistUrl(import.meta.env.PUBLIC_WAITLIST_URL, process.env.VERCEL === '1');
// Removal lives beside signup on the same Convex route.
export const LEAVE_URL = `${WAITLIST_URL}/leave`;
