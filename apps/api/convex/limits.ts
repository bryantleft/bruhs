import { DAY, MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { components } from './_generated/api';

// Global buckets for unauthenticated writes. Convex documents no client IP for HTTP actions or
// sign-in, so none of these can be per visitor: they cap floods (20 a minute, bursts of 40),
// not a slow drip. Real launch-day traffic sits well under them.
const FLOOD = { kind: 'token bucket', rate: 20, period: MINUTE, capacity: 40 } as const;

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  waitlistJoin: FLOOD,
  waitlistLeave: FLOOD,
  anonymousSignIn: FLOOD,
  waitlistConfirm: FLOOD,
  // A new sending domain starts around 150 emails a day (Resend's warm-up guidance), so cap
  // waitlist mail below that rather than let a flood burn the domain's reputation.
  waitlistEmail: { kind: 'fixed window', rate: 120, period: DAY },
});
