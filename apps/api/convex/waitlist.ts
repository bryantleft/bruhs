import { v } from 'convex/values';
import { internal } from './_generated/api';
import { type ActionCtx, httpAction, internalMutation } from './_generated/server';
import { sendAlreadyListed, sendConfirmation } from './emails';
import { rateLimiter } from './limits';

// RFC 5321 caps an address at 254 characters. Percent-encoding can triple that, plus field
// names and the honeypot: a real form body stays under 1 KiB.
const MAX_BODY = 1024;
const MAX_EMAIL = 254;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
// A confirmation link works this long; unconfirmed rows are deleted after it (see crons.ts).
export const CONFIRM_WINDOW = 7 * 24 * HOUR;
// Posting the form again within this window re-sends nothing, so nobody can flood an inbox.
const RESEND_COOLDOWN = 10 * MINUTE;

export type WaitlistAction = 'join' | 'leave' | 'confirm';
export type WaitlistReply =
  | 'joined'
  | 'left'
  | 'confirmed'
  | 'invalid_email'
  | 'invalid_link'
  | 'rate_limited';

// Lowercased and trimmed, so "Moss@Example.com " and "moss@example.com" are one signup.
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL) return null;
  // One @, something before it, a dotted domain after it, no spaces. Delivery proves the rest.
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email) ? email : null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// 32 random bytes as base64url. Mutations get Convex's seeded strong PRNG.
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const outcome = v.union(
  v.object({ status: v.literal('done') }),
  v.object({ status: v.literal('invalid_link') }),
  v.object({ status: v.literal('rate_limited'), retryAfter: v.number() }),
);
type Outcome = typeof outcome.type;

async function limited(
  ctx: Parameters<typeof rateLimiter.limit>[0],
  name: 'waitlistJoin' | 'waitlistLeave' | 'waitlistConfirm' | 'waitlistEmail',
): Promise<Outcome | null> {
  const limit = await rateLimiter.limit(ctx, name);
  return limit.ok ? null : { status: 'rate_limited', retryAfter: limit.retryAfter };
}

// Join and leave count against the limit before looking the email up, and answer the same
// whether or not it was listed, so neither can reveal who signed up. A new or still-pending
// address gets a confirmation link; a confirmed one gets a note that it's already listed.
export const join = internalMutation({
  args: { email: v.string(), site: v.string() },
  returns: outcome,
  handler: async (ctx, { email, site }): Promise<Outcome> => {
    const flood = await limited(ctx, 'waitlistJoin');
    if (flood) return flood;
    const now = Date.now();
    const existing = await ctx.db
      .query('waitlist')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    if (existing?.sentAt !== undefined && now - existing.sentAt < RESEND_COOLDOWN) return { status: 'done' };
    const mail = await limited(ctx, 'waitlistEmail');
    if (mail) return mail;
    const emailKey = (await sha256(email)).slice(0, 32);
    if (existing && existing.status !== 'pending') {
      await ctx.db.patch(existing._id, { sentAt: now });
      await sendAlreadyListed(ctx, email, site, `${emailKey}/${Math.floor(now / HOUR)}`);
      return { status: 'done' };
    }
    const token = newToken();
    const tokenHash = await sha256(token);
    if (existing) await ctx.db.patch(existing._id, { tokenHash, sentAt: now });
    else await ctx.db.insert('waitlist', { email, status: 'pending', tokenHash, sentAt: now });
    const link = `${site}/waitlist/confirm/?token=${token}`;
    await sendConfirmation(ctx, email, site, link, tokenHash.slice(0, 32));
    return { status: 'done' };
  },
});

export const confirm = internalMutation({
  args: { token: v.string() },
  returns: outcome,
  handler: async (ctx, { token }): Promise<Outcome> => {
    const flood = await limited(ctx, 'waitlistConfirm');
    if (flood) return flood;
    const tokenHash = await sha256(token);
    const row = await ctx.db
      .query('waitlist')
      .withIndex('by_token', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    // A used, replaced or expired link reads the same: ask for a fresh one.
    if (row?.status !== 'pending' || row.sentAt === undefined || Date.now() - row.sentAt > CONFIRM_WINDOW)
      return { status: 'invalid_link' };
    await ctx.db.patch(row._id, { status: 'confirmed', confirmedAt: Date.now(), tokenHash: undefined });
    return { status: 'done' };
  },
});

export const leave = internalMutation({
  args: { email: v.string() },
  returns: outcome,
  handler: async (ctx, { email }): Promise<Outcome> => {
    const flood = await limited(ctx, 'waitlistLeave');
    if (flood) return flood;
    const existing = await ctx.db
      .query('waitlist')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return { status: 'done' };
  },
});

// Unconfirmed signups expire with their link, so the list only ever holds people who said yes.
export const expirePending = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const cutoff = Date.now() - CONFIRM_WINDOW;
    const stale = (
      await ctx.db
        .query('waitlist')
        .withIndex('by_status', (q) => q.eq('status', 'pending'))
        .take(500)
    ).filter((row) => (row.sentAt ?? row._creationTime) < cutoff);
    await Promise.all(stale.map((row) => ctx.db.delete(row._id)));
    return stale.length;
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

// The listed origin a request came from, or the canonical one.
function siteOf(request: Request, origins: readonly string[]): string {
  const origin = request.headers.get('Origin');
  return origin && origins.includes(origin) ? origin : (origins[0] ?? '');
}

// Static result pages, so the forms work on a static site without JavaScript.
const RESULT_PAGES: Readonly<Record<WaitlistReply, string>> = {
  joined: 'joined',
  left: 'left',
  confirmed: 'confirmed',
  invalid_email: 'invalid',
  invalid_link: 'expired',
  rate_limited: 'busy',
};

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

const DONE: Readonly<Record<WaitlistAction, WaitlistReply>> = {
  join: 'joined',
  leave: 'left',
  confirm: 'confirmed',
};

// What the action needs from the form, or the reply that refuses it.
type Parsed = Readonly<{ value: string } | { reply: WaitlistReply }>;
function parse(action: WaitlistAction, form: URLSearchParams): Parsed {
  if (action === 'confirm') {
    const token = form.get('token') ?? '';
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? { value: token } : { reply: 'invalid_link' };
  }
  const email = normalizeEmail(form.get('email') ?? '');
  return email ? { value: email } : { reply: 'invalid_email' };
}

async function run(ctx: ActionCtx, action: WaitlistAction, value: string, site: string): Promise<Outcome> {
  switch (action) {
    case 'join':
      return ctx.runMutation(internal.waitlist.join, { email: value, site });
    case 'leave':
      return ctx.runMutation(internal.waitlist.leave, { email: value });
    case 'confirm':
      return ctx.runMutation(internal.waitlist.confirm, { token: value });
  }
}

function notConfigured(): string | null {
  // Typed explicitly, as in allowedOrigins.
  const origins: string | undefined = process.env.WAITLIST_ORIGINS;
  const key: string | undefined = process.env.RESEND_API_KEY;
  if (!origins) return 'set WAITLIST_ORIGINS to the landing page origin(s)';
  if (!key) return 'set RESEND_API_KEY (a sending-only key for bruhs.app) so confirmations can go out';
  return null;
}

// Takes a plain urlencoded form so the pages work without JavaScript. Script requests send the
// same body with Accept: application/json and read a JSON reply instead of a redirect.
function formHandler(action: WaitlistAction) {
  return httpAction(async (ctx, request) => {
    const missing = notConfigured();
    const origins = allowedOrigins();
    if (missing || !origins) {
      console.error(`Waitlist is off: ${missing} in Convex.`);
      return Response.json({ error: 'waitlist_not_configured' }, { status: 500 });
    }
    const headers = corsHeaders(request, origins);
    // Browsers always send Origin on POST, and a page can't forge it. Refusing unlisted ones
    // (including "null" from sandboxed frames) stops other sites signing up a visitor's email
    // with a hidden form. Clients without Origin (curl) could fake one anyway, so they pass.
    const origin = request.headers.get('Origin');
    if (origin && !origins.includes(origin))
      return Response.json({ error: 'origin_not_allowed' }, { status: 403, headers });
    const type = request.headers.get('Content-Type') ?? '';
    if (!type.startsWith('application/x-www-form-urlencoded'))
      return Response.json({ error: 'unsupported_content_type' }, { status: 415, headers });
    // Refuse a declared oversize body before buffering it; the length check after reading
    // catches bodies that lie about it.
    if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY)
      return Response.json({ error: 'body_too_large' }, { status: 413, headers });
    const body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_BODY)
      return Response.json({ error: 'body_too_large' }, { status: 413, headers });
    const form = new URLSearchParams(body);
    const parsed = parse(action, form);
    // The honeypot is hidden from people; bots that fill it get a normal reply and no change.
    const bot = (form.get('website') ?? '') !== '';
    let reply: WaitlistReply = 'reply' in parsed ? parsed.reply : DONE[action];
    const extra: Record<string, string> = {};
    if ('value' in parsed && !bot) {
      const result = await run(ctx, action, parsed.value, siteOf(request, origins));
      if (result.status === 'rate_limited') {
        reply = 'rate_limited';
        extra['Retry-After'] = String(Math.max(1, Math.ceil(result.retryAfter / 1000)));
      } else if (result.status === 'invalid_link') reply = 'invalid_link';
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
      headers: {
        ...headers,
        ...extra,
        Location: `${siteOf(request, origins)}/waitlist/${RESULT_PAGES[reply]}/`,
      },
    });
  });
}

export const submit = formHandler('join');
export const unsubscribe = formHandler('leave');
export const confirmSignup = formHandler('confirm');
