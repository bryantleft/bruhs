import { v } from 'convex/values';
import { internal } from './_generated/api';
import { httpAction, internalMutation } from './_generated/server';

// RFC 5321 caps an address at 254 characters. Percent-encoding can triple that, plus field
// names and the honeypot: a real form body stays under 1 KiB.
const MAX_BODY = 1024;
const MAX_EMAIL = 254;

export type WaitlistReply = 'joined' | 'invalid_email';

// Lowercased and trimmed, so "Moss@Example.com " and "moss@example.com" are one signup.
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL) return null;
  // One @, something before it, a dotted domain after it, no spaces. Delivery proves the rest.
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email) ? email : null;
}

export const join = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    const existing = await ctx.db
      .query('waitlist')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();
    if (!existing) await ctx.db.insert('waitlist', { email });
    return null;
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

// Form posts come back to the page they came from, but only to a listed origin.
function returnTo(request: Request, origins: readonly string[], reply: WaitlistReply): string {
  const origin = request.headers.get('Origin');
  const base = origin && origins.includes(origin) ? origin : origins[0];
  // Static result pages, so the form works on a static site without JavaScript.
  return `${base}/waitlist/${reply === 'joined' ? 'joined' : 'invalid'}/`;
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

// Takes a plain urlencoded form so the page works without JavaScript. Script requests send the
// same body with Accept: application/json and read a JSON reply instead of a redirect.
export const submit = httpAction(async (ctx, request) => {
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
  // The honeypot is hidden from people; bots that fill it get a normal reply and no signup.
  const bot = (form.get('website') ?? '') !== '';
  const reply: WaitlistReply = email ? 'joined' : 'invalid_email';
  if (email && !bot) await ctx.runMutation(internal.waitlist.join, { email });
  if (wantsJson(request))
    return Response.json(reply === 'joined' ? { status: 'joined' } : { error: reply }, {
      status: reply === 'joined' ? 200 : 400,
      headers,
    });
  return new Response(null, {
    status: 303,
    headers: { ...headers, Location: returnTo(request, origins, reply) },
  });
});
