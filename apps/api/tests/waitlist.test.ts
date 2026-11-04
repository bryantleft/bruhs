import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import schema from '../convex/schema';
import { normalizeEmail } from '../convex/waitlist';

const modules = {
  '../convex/_generated/server.js': () => import('../convex/_generated/server.js'),
  '../convex/_generated/api.js': () => import('../convex/_generated/api.js'),
  '../convex/auth.ts': () => import('../convex/auth'),
  '../convex/http.ts': () => import('../convex/http'),
  '../convex/waitlist.ts': () => import('../convex/waitlist'),
};
const SITE = 'https://outside.bruhs.app';
const DEV = 'https://outside-bruhs.localhost';
const create = () => convexTest(schema, modules);

function post(
  t: ReturnType<typeof create>,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return t.fetch('/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: SITE, ...headers },
    body: new URLSearchParams(fields).toString(),
  });
}
const json = { Accept: 'application/json' };
const emails = (t: ReturnType<typeof create>) =>
  t.run(async (ctx) => (await ctx.db.query('waitlist').collect()).map((row) => row.email));

beforeEach(() => vi.stubEnv('WAITLIST_ORIGINS', `${SITE}, ${DEV}`));
afterEach(() => vi.unstubAllEnvs());

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
    const forged = await post(t, { email: 'nope' }, { Origin: 'https://evil.example' });
    expect(forged.headers.get('Location')).toBe(`${SITE}/waitlist/invalid/`);
    expect(forged.headers.get('Access-Control-Allow-Origin')).toBeNull();
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
