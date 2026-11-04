import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import { type ActionCtx, httpAction, internalMutation } from './_generated/server';

// RFC 5321 caps an address at 254 characters. Percent-encoding can triple that, plus field
// names and the honeypot: a real form body stays under 1 KiB.
const MAX_BODY = 1024;
const MAX_EMAIL = 254;

export type WaitlistAction = 'join' | 'leave';
export type WaitlistReply = 'joined' | 'left' | 'invalid_email' | 'rate_limited';

// One shared bucket per action. Convex documents no client IP for HTTP actions, so a
// per-visitor limit isn't possible here: this caps floods (20 a minute, bursts of 40), not a
// slow drip. Real launch-day traffic sits well under it.
const FLOOD = { kind: 'token bucket', rate: 20, period: MINUTE, capacity: 40 } as const;
const rateLimiter = new RateLimiter(components.rateLimiter, { waitlistJoin: FLOOD, waitlistLeave: FLOOD });

// Lowercased and trimmed, so "Moss@Example.com " and "moss@example.com" are one signup.
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL) return null;
  // One @, something before it, a dotted domain after it, no spaces. Delivery proves the rest.
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email) ? email : null;
}

const outcome = v.union(
  v.object({ status: v.literal('done') }),
  v.object({ status: v.literal('rate_limited'), retryAfter: v.number() }),
);

// Both mutations count against the limit before looking the email up, and answer the same
// whether or not it was listed, so neither can reveal who signed up.
export const join = internalMutation({
  args: { email: v.string() },
  returns: outcome,
  handler: async (ctx, { email }) => {
    const limit = await rateLimiter.limit(ctx, 'waitlistJoin');
    if (!limit.ok) return { status: 'rate_limited' as const, retryAfter: limit.retryAfter };
    const existing = await ctx.db
      .query('waitlist')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    if (!existing) await ctx.db.insert('waitlist', { email });
    return { status: 'done' as const };
  },
});

export const leave = internalMutation({
  args: { email: v.string() },
  returns: outcome,
  handler: async (ctx, { email }) => {
    const limit = await rateLimiter.limit(ctx, 'waitlistLeave');
    if (!limit.ok) return { status: 'rate_limited' as const, retryAfter: limit.retryAfter };
    const existing = await ctx.db
      .query('waitlist')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return { status: 'done' as const };
  },
});

// WAITLIST_ORIGINS lists the landing page origins, first one canonical, for example
// "https://outside.bruhs.app,https://outside-bruhs.localhost".
function allowedOrigins(): readonly string[] | null {
  // Typed explicitly: apps that import this API's types may not have Node's env typings.
  const raw: string | undefined = process.env.WAITLIST_ORIGINS;
  if (!raw) return null;
  const origins = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return origins.length ? origins : null;
}

function corsHeaders(request: Request, origins: readonly string[]): Record<string, string> {
  const origin = request.headers.get('Origin');
  return origin && origins.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : { Vary: 'Origin' };
}

// Static result pages, so the forms work on a static site without JavaScript.
const RESULT_PAGES: Readonly<Record<WaitlistReply, string>> = {
  joined: 'joined',
  left: 'left',
  invalid_email: 'invalid',
  rate_limited: 'busy',
};

// Form posts come back to the page they came from, but only to a listed origin.
function returnTo(request: Request, origins: readonly string[], reply: WaitlistReply): string {
  const origin = request.headers.get('Origin');
  const base = origin && origins.includes(origin) ? origin : origins[0];
  return `${base}/waitlist/${RESULT_PAGES[reply]}/`;
}

function wantsJson(request: Request): boolean {
  return (request.headers.get('Accept') ?? '').includes('application/json');
}

export const preflight = httpAction(async (_ctx, request) => {
  const origins = allowedOrigins();
  return new Response(null, {
    status: 204,
    headers: {
      ...(origins ? corsHeaders(request, origins) : {}),
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Max-Age': '86400',
    },
  });
});

const DONE: Readonly<Record<WaitlistAction, WaitlistReply>> = { join: 'joined', leave: 'left' };

async function run(ctx: ActionCtx, action: WaitlistAction, email: string) {
  return action === 'join'
    ? ctx.runMutation(internal.waitlist.join, { email })
    : ctx.runMutation(internal.waitlist.leave, { email });
}

// Takes a plain urlencoded form so the page works without JavaScript. Script requests send the
// same body with Accept: application/json and read a JSON reply instead of a redirect.
function formHandler(action: WaitlistAction) {
  return httpAction(async (ctx, request) => {
    const origins = allowedOrigins();
    if (!origins) {
      console.error('Waitlist is off: set WAITLIST_ORIGINS to the landing page origin(s) in Convex.');
      return Response.json({ error: 'waitlist_not_configured' }, { status: 500 });
    }
    const headers = corsHeaders(request, origins);
    const type = request.headers.get('Content-Type') ?? '';
    if (!type.startsWith('application/x-www-form-urlencoded'))
      return Response.json({ error: 'unsupported_content_type' }, { status: 415, headers });
    const body = await request.text();
    if (body.length > MAX_BODY) return Response.json({ error: 'body_too_large' }, { status: 413, headers });
    const form = new URLSearchParams(body);
    const email = normalizeEmail(form.get('email') ?? '');
    // The honeypot is hidden from people; bots that fill it get a normal reply and no change.
    const bot = (form.get('website') ?? '') !== '';
    let reply: WaitlistReply = email ? DONE[action] : 'invalid_email';
    const extra: Record<string, string> = {};
    if (email && !bot) {
      const result = await run(ctx, action, email);
      if (result.status === 'rate_limited') {
        reply = 'rate_limited';
        extra['Retry-After'] = String(Math.max(1, Math.ceil(result.retryAfter / 1000)));
      }
    }
    if (wantsJson(request)) {
      const ok = reply === DONE[action];
      return Response.json(ok ? { status: reply } : { error: reply }, {
        status: ok ? 200 : reply === 'rate_limited' ? 429 : 400,
        headers: { ...headers, ...extra },
      });
    }
    return new Response(null, {
      status: 303,
      headers: { ...headers, ...extra, Location: returnTo(request, origins, reply) },
    });
  });
}

export const submit = formHandler('join');
export const unsubscribe = formHandler('leave');
