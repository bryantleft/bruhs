import rateLimiter from '@convex-dev/rate-limiter/test';
import resend from '@convex-dev/resend/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { internal } from '../convex/_generated/api';
import schema from '../convex/schema';
import { CONFIRM_WINDOW, normalizeEmail } from '../convex/waitlist';

// Only the two sends are replaced, so tests can read the emailed link; everything else is real.
const sent = vi.hoisted(() => ({
  confirm: [] as { email: string; link: string }[],
  already: [] as string[],
}));
vi.mock('../convex/emails', async (original) => ({
  ...(await original<typeof import('../convex/emails')>()),
  sendConfirmation: async (_ctx: unknown, email: string, _site: string, link: string) => {
    sent.confirm.push({ email, link });
  },
  sendAlreadyListed: async (_ctx: unknown, email: string) => {
    sent.already.push(email);
  },
}));

const modules = {
  '../convex/_generated/server.js': () => import('../convex/_generated/server.js'),
  '../convex/_generated/api.js': () => import('../convex/_generated/api.js'),
  '../convex/auth.ts': () => import('../convex/auth'),
  '../convex/crons.ts': () => import('../convex/crons'),
  '../convex/emails.ts': () => import('../convex/emails'),
  '../convex/http.ts': () => import('../convex/http'),
  '../convex/limits.ts': () => import('../convex/limits'),
  '../convex/waitlist.ts': () => import('../convex/waitlist'),
};
const SITE = 'https://outside.bruhs.app';
const DEV = 'https://outside-bruhs.localhost';
function create() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  resend.register(t);
  return t;
}

function post(
  t: ReturnType<typeof create>,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
  path = '/waitlist',
): Promise<Response> {
  return t.fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: SITE, ...headers },
    body: new URLSearchParams(fields).toString(),
  });
}
const json = { Accept: 'application/json' };
const emails = (t: ReturnType<typeof create>) =>
  t.run(async (ctx) => (await ctx.db.query('waitlist').collect()).map((row) => row.email));

beforeEach(() => {
  vi.stubEnv('WAITLIST_ORIGINS', `${SITE}, ${DEV}`);
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
  sent.confirm.length = 0;
  sent.already.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
const tokenOf = (link: string) => new URL(link).searchParams.get('token') ?? '';
const rows = (t: ReturnType<typeof create>) =>
  t.run(async (ctx) =>
    (await ctx.db.query('waitlist').collect()).map(({ email, status }) => ({ email, status })),
  );

describe('normalizeEmail', () => {
  it('trims and lowercases real addresses and rejects malformed ones', () => {
    expect(normalizeEmail('  Moss@Example.COM ')).toBe('moss@example.com');
    for (const bad of ['', 'moss', 'moss@', '@example.com', 'moss@example', 'mo ss@example.com', 'a@b@c.com'])
      expect(normalizeEmail(bad), bad).toBeNull();
    expect(normalizeEmail(`${'a'.repeat(250)}@b.co`)).toBeNull();
  });
});

describe('POST /waitlist', () => {
  it('stores one normalised row per email and replies the same for repeats', async () => {
    const t = create();
    const first = await post(t, { email: 'Moss@Example.com' }, json);
    const again = await post(t, { email: 'moss@example.com ' }, json);
    expect(first.status).toBe(200);
    // Same reply for a repeat, so the form cannot reveal who already signed up.
    expect(await again.json()).toEqual(await first.json());
    expect(await emails(t)).toEqual(['moss@example.com']);
    expect(first.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
  });

  it('rejects malformed emails with an actionable code and stores nothing', async () => {
    const t = create();
    const response = await post(t, { email: 'moss' }, json);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_email' });
    expect(await emails(t)).toEqual([]);
  });

  it('gives a filled honeypot a normal reply but no signup', async () => {
    const t = create();
    const response = await post(t, { email: 'bot@example.com', website: 'http://spam.example' }, json);
    expect(response.status).toBe(200);
    expect(await emails(t)).toEqual([]);
  });

  it('redirects form posts back to a listed origin, never an unlisted one', async () => {
    const t = create();
    const fromDev = await post(t, { email: 'moss@example.com' }, { Origin: DEV });
    expect(fromDev.status).toBe(303);
    expect(fromDev.headers.get('Location')).toBe(`${DEV}/waitlist/joined/`);
    const noOrigin = await post(t, { email: 'nope' }, { Origin: '' });
    expect(noOrigin.headers.get('Location')).toBe(`${SITE}/waitlist/invalid/`);
  });

  it('refuses posts from unlisted origins, including sandboxed frames, before storing anything', async () => {
    const t = create();
    for (const Origin of ['https://evil.example', 'null']) {
      const forged = await post(t, { email: 'victim@example.com' }, { Origin });
      expect(forged.status, Origin).toBe(403);
      expect(await forged.json()).toEqual({ error: 'origin_not_allowed' });
      expect(forged.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    expect(await emails(t)).toEqual([]);
  });

  it('answers preflight with CORS headers for listed origins only', async () => {
    const t = create();
    const listed = await t.fetch('/waitlist', { method: 'OPTIONS', headers: { Origin: DEV } });
    expect(listed.status).toBe(204);
    expect(listed.headers.get('Access-Control-Allow-Origin')).toBe(DEV);
    const other = await t.fetch('/waitlist', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(other.headers.get('Vary')).toBe('Origin');
  });

  it('refuses other content types and oversized bodies', async () => {
    const t = create();
    const typed = await t.fetch('/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...json },
      body: JSON.stringify({ email: 'moss@example.com' }),
    });
    expect(typed.status).toBe(415);
    const huge = await post(t, { email: 'moss@example.com', website: 'x'.repeat(2000) }, json);
    expect(huge.status).toBe(413);
    expect(await emails(t)).toEqual([]);
  });

  it('caps a flood of signups with a 429 and Retry-After, storing nothing past the cap', async () => {
    const t = create();
    // The bucket holds a burst of 40.
    for (let index = 0; index < 40; index += 1) {
      const response = await post(t, { email: `moss${index}@example.com` }, json);
      expect(response.status, `signup ${index}`).toBe(200);
    }
    const limited = await post(t, { email: 'late@example.com' }, json);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate_limited' });
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    const form = await post(t, { email: 'later@example.com' });
    expect(form.status).toBe(303);
    expect(form.headers.get('Location')).toBe(`${SITE}/waitlist/busy/`);
    expect(await emails(t)).toHaveLength(40);
    expect(await emails(t)).not.toContain('late@example.com');
  });

  it('does not spend the limit on malformed emails or honeypot hits', async () => {
    const t = create();
    for (let index = 0; index < 45; index += 1) {
      await post(t, { email: 'nope' }, json);
      await post(t, { email: `bot${index}@example.com`, website: 'x' }, json);
    }
    const real = await post(t, { email: 'moss@example.com' }, json);
    expect(real.status).toBe(200);
    expect(await emails(t)).toEqual(['moss@example.com']);
  });

  it('removes an email on request, answering the same whether or not it was listed', async () => {
    const t = create();
    await post(t, { email: 'moss@example.com' }, json);
    await post(t, { email: 'fern@example.com' }, json);
    const left = await post(t, { email: ' Moss@Example.com' }, json, '/waitlist/leave');
    const never = await post(t, { email: 'nobody@example.com' }, json, '/waitlist/leave');
    expect(left.status).toBe(200);
    expect(await never.json()).toEqual(await left.json());
    expect(await emails(t)).toEqual(['fern@example.com']);
    const form = await post(t, { email: 'fern@example.com' }, {}, '/waitlist/leave');
    expect(form.headers.get('Location')).toBe(`${SITE}/waitlist/left/`);
    expect(await emails(t)).toEqual([]);
    const bad = await post(t, { email: 'nope' }, json, '/waitlist/leave');
    expect(bad.status).toBe(400);
  });

  it('fails loudly when the landing origins are not configured', async () => {
    vi.stubEnv('WAITLIST_ORIGINS', '');
    const t = create();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await post(t, { email: 'moss@example.com' }, json);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'waitlist_not_configured' });
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('WAITLIST_ORIGINS'));
    expect(await emails(t)).toEqual([]);
  });
});

describe('double opt-in', () => {
  it('emails a confirm link, and only the link holder can confirm, once', async () => {
    const t = create();
    expect((await post(t, { email: 'Moss@Example.com' }, json)).status).toBe(200);
    expect(await rows(t)).toEqual([{ email: 'moss@example.com', status: 'pending' }]);
    expect(sent.confirm).toHaveLength(1);
    const { email, link } = sent.confirm[0] ?? { email: '', link: '' };
    expect(email).toBe('moss@example.com');
    expect(link.startsWith(`${SITE}/waitlist/confirm/?token=`)).toBe(true);
    // The stored row never holds the token itself.
    const stored = await t.run(async (ctx) => (await ctx.db.query('waitlist').collect())[0]);
    expect(JSON.stringify(stored)).not.toContain(tokenOf(link));
    const confirmed = await post(t, { token: tokenOf(link) }, json, '/waitlist/confirm');
    expect(await confirmed.json()).toEqual({ status: 'confirmed' });
    expect(await rows(t)).toEqual([{ email: 'moss@example.com', status: 'confirmed' }]);
    const again = await post(t, { token: tokenOf(link) }, {}, '/waitlist/confirm');
    expect(again.headers.get('Location')).toBe(`${SITE}/waitlist/expired/`);
    const forged = await post(t, { token: 'x'.repeat(43) }, json, '/waitlist/confirm');
    expect(await forged.json()).toEqual({ error: 'invalid_link' });
    expect((await post(t, { token: 'short' }, json, '/waitlist/confirm')).status).toBe(400);
  });

  it('re-sends nothing inside the cooldown, then replaces the link', async () => {
    const t = create();
    await post(t, { email: 'moss@example.com' }, json);
    await post(t, { email: 'moss@example.com' }, json);
    expect(sent.confirm).toHaveLength(1);
    vi.setSystemTime(new Date('2026-11-03T12:11:00Z'));
    await post(t, { email: 'moss@example.com' }, json);
    expect(sent.confirm).toHaveLength(2);
    const [first, second] = sent.confirm.map((entry) => tokenOf(entry.link));
    expect(await (await post(t, { token: first ?? '' }, json, '/waitlist/confirm')).json()).toEqual({
      error: 'invalid_link',
    });
    expect((await post(t, { token: second ?? '' }, json, '/waitlist/confirm')).status).toBe(200);
  });

  it('tells a confirmed or pre-opt-in address it is already listed, with the same reply', async () => {
    const t = create();
    await t.run((ctx) => ctx.db.insert('waitlist', { email: 'early@example.com' }));
    const reply = await post(t, { email: 'early@example.com' }, json);
    expect(await reply.json()).toEqual({ status: 'joined' });
    expect(sent.already).toEqual(['early@example.com']);
    expect(sent.confirm).toHaveLength(0);
  });

  it('expires unconfirmed signups and their links after the window, keeping confirmed ones', async () => {
    const t = create();
    await t.run((ctx) => ctx.db.insert('waitlist', { email: 'early@example.com' }));
    await post(t, { email: 'moss@example.com' }, json);
    const token = tokenOf(sent.confirm[0]?.link ?? '');
    vi.setSystemTime(new Date(Date.parse('2026-11-03T12:00:00Z') + CONFIRM_WINDOW + 1000));
    expect(await (await post(t, { token }, json, '/waitlist/confirm')).json()).toEqual({
      error: 'invalid_link',
    });
    expect(await t.mutation(internal.waitlist.expirePending, {})).toBe(1);
    expect(await emails(t)).toEqual(['early@example.com']);
  });

  it('caps confirmation mail per day so a flood cannot burn the sending domain', async () => {
    const t = create();
    for (let index = 0; index < 120; index += 1) {
      if (index % 40 === 0) vi.setSystemTime(new Date(Date.parse('2026-11-03T12:00:00Z') + index * 60_000));
      await post(t, { email: `moss${index}@example.com` }, json);
    }
    expect(sent.confirm).toHaveLength(120);
    vi.setSystemTime(new Date('2026-11-03T16:00:00Z'));
    expect((await post(t, { email: 'late@example.com' }, json)).status).toBe(429);
  });

  it('fails loudly without a Resend key, naming it', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const t = create();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await post(t, { email: 'moss@example.com' }, json);
    expect(response.status).toBe(500);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('RESEND_API_KEY'));
    expect(await emails(t)).toEqual([]);
    errors.mockRestore();
  });
});
