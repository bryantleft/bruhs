import { generateKeyPairSync } from 'node:crypto';
import rateLimiter from '@convex-dev/rate-limiter/test';
import { makeFunctionReference } from 'convex/server';
import type { Value } from 'convex/values';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from '../convex/_generated/api';
import { IDLE_GUEST, rankMembers } from '../convex/outside';
import schema from '../convex/schema';
import { MAX_PARTY } from '../convex/validators';

const modules = {
  '../convex/_generated/server.js': () => import('../convex/_generated/server.js'),
  '../convex/_generated/api.js': () => import('../convex/_generated/api.js'),
  '../convex/auth.ts': () => import('../convex/auth'),
  '../convex/http.ts': () => import('../convex/http'),
  '../convex/limits.ts': () => import('../convex/limits'),
  '../convex/outside.ts': () => import('../convex/outside'),
  '../convex/waitlist.ts': () => import('../convex/waitlist'),
};
function create() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}
type Backend = ReturnType<typeof create>;
async function guest(t: Backend) {
  const { userId, sessionId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { isAnonymous: true });
    const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 3600000 });
    return { userId, sessionId };
  });
  return { userId, sessionId, client: t.withIdentity({ subject: `${userId}|${sessionId}` }) };
}
const entry = { kind: 'create', name: 'moss', skin: 'pandan' } as const;
const week = { start: '2026-10-26', end: '2026-11-01', offset: 0 };
async function party(t: Backend) {
  const owner = await guest(t);
  const home = await owner.client.mutation(api.outside.enter, entry);
  const saved = home.home.party;
  if (!saved) throw new Error('Test party was not created');
  return { ...owner, party: saved };
}

// The submit window is relative to now; pin it inside the test week (Mon 2026-10-26).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('Outside private races', () => {
  it('exposes no party data to unauthenticated, missing-session, expired or deleted identities', async () => {
    const t = create();
    expect(await t.query(api.outside.home)).toEqual({ userId: null, home: { profile: null, party: null } });
    await expect(t.mutation(api.outside.enter, entry)).rejects.toThrow('sign_in_required');
    const owner = await party(t);
    await t.run((ctx) => ctx.db.patch(owner.sessionId, { expirationTime: 0 }));
    await expect(owner.client.query(api.outside.board, week)).rejects.toThrow('sign_in_required');
    await t.run((ctx) => ctx.db.delete(owner.userId));
    await expect(owner.client.mutation(api.outside.enter, entry)).rejects.toThrow('sign_in_required');
  });

  it('keeps create and join retries idempotent and restricts a guest to one party', async () => {
    const t = create();
    const owner = await party(t);
    const again = await owner.client.mutation(api.outside.enter, { ...entry, name: ' fern ' });
    expect(again.home.party?.id).toBe(owner.party.id);
    expect(again.home.party?.member_count).toBe(1);
    expect(again.home.profile?.name).toBe('fern');
    expect(owner.party.invite_code).toMatch(/^[0-9a-f]{32}$/);
    const other = await party(t);
    await expect(
      other.client.mutation(api.outside.enter, { ...entry, kind: 'join', invite: owner.party.invite_code }),
    ).rejects.toThrow('already_in_party');
    const member = await guest(t);
    const join = { ...entry, kind: 'join', invite: owner.party.invite_code.toUpperCase() } as const;
    await member.client.mutation(api.outside.enter, join);
    const repeated = await member.client.mutation(api.outside.enter, join);
    expect(repeated.home.party?.member_count).toBe(2);
    expect((await other.client.query(api.outside.board, week)).rows.map((row) => row.user_id)).toEqual([
      other.userId,
    ]);
    await expect(t.withIdentity({ subject: member.userId }).query(api.outside.board, week)).rejects.toThrow();
  });

  it('validates profiles, invites and strict payload shapes before writing', async () => {
    const t = create();
    const user = await guest(t);
    for (const name of [
      '',
      '  ',
      'x'.repeat(25),
      'hi\nthere',
      '\u0085',
      'a\u2028b',
      'moss\u202e',
      'a\u200bb',
      'mo\ufeffss',
      'x\u2066y',
    ])
      await expect(user.client.mutation(api.outside.enter, { ...entry, name })).rejects.toThrow(
        'invalid_profile',
      );
    for (const invite of ['bad', 'f'.repeat(32)])
      await expect(
        user.client.mutation(api.outside.enter, { ...entry, kind: 'join', invite }),
      ).rejects.toThrow('invite_not_found');
    expect((await user.client.query(api.outside.home)).home.profile).toBeNull();
    const raw = makeFunctionReference<'mutation', Record<string, Value>>('outside:enter');
    await expect(user.client.mutation(raw, { ...entry, skin: 'fake' })).rejects.toThrow();
    await expect(user.client.mutation(raw, { ...entry, coordinates: [1, 2] })).rejects.toThrow();
    // A create can't carry an invite, and a join must.
    await expect(user.client.mutation(raw, { ...entry, invite: 'f'.repeat(32) })).rejects.toThrow(
      'invite_not_found',
    );
    await expect(user.client.mutation(raw, { ...entry, kind: 'join' })).rejects.toThrow('invite_not_found');
  });

  it('pins submission identity and makes weekly totals monotonic, atomic and retry-safe', async () => {
    const t = create();
    const owner = await party(t);
    const other = await guest(t);
    const submit = (days: { date: string; steps: number }[]) =>
      owner.client.mutation(api.outside.submit, { expectedUserId: owner.userId, days });
    await expect(
      owner.client.mutation(api.outside.submit, {
        expectedUserId: other.userId,
        days: [{ date: week.start, steps: 9 }],
      }),
    ).rejects.toThrow('sign_in_required');
    await submit([{ date: week.start, steps: 0 }]);
    await submit([
      { date: week.start, steps: 123 },
      { date: '2026-10-27', steps: 77 },
    ]);
    await submit([{ date: week.start, steps: 12 }]);
    await submit([
      { date: week.start, steps: 123 },
      { date: '2026-10-27', steps: 77 },
    ]);
    const before = await owner.client.query(api.outside.board, week);
    expect(before.rows[0].steps).toBe(200);
    const raw = makeFunctionReference<'mutation', Record<string, Value>>('outside:submit');
    const invalid: Value[] = [
      [],
      'bad',
      [{ date: '2026-02-30', steps: 1 }],
      [{ date: week.start, steps: -1 }],
      [{ date: week.start, steps: 1.5 }],
      [{ date: week.start, steps: 200_001 }],
      [{ date: '2026-10-18', steps: 1 }],
      [{ date: '2001-01-01', steps: 1 }],
      [{ date: week.start, steps: 1, route: [] }],
      [
        { date: week.start, steps: 1 },
        { date: week.start, steps: 2 },
      ],
      [
        { date: week.start, steps: 999 },
        { date: '9999-01-01', steps: 1 },
      ],
    ];
    for (const days of invalid)
      await expect(owner.client.mutation(raw, { expectedUserId: owner.userId, days })).rejects.toThrow();
    expect(await owner.client.query(api.outside.board, week)).toEqual(before);
  });

  it('distinguishes unread, zero, ties, dense positions and new-week scores', async () => {
    const t = create();
    const owner = await party(t);
    const members = await Promise.all(Array.from({ length: 4 }, () => guest(t)));
    for (const member of members)
      await member.client.mutation(api.outside.enter, {
        ...entry,
        kind: 'join',
        invite: owner.party.invite_code,
      });
    for (const [index, value] of [100, 100, 0].entries()) {
      const member = members[index];
      await member.client.mutation(api.outside.submit, {
        expectedUserId: member.userId,
        days: [{ date: week.start, steps: value }],
      });
    }
    const board = await owner.client.query(api.outside.board, week);
    expect(board.rows.map((row) => [row.steps, row.place, row.tied])).toEqual([
      [100, 1, 2],
      [100, 1, 2],
      [0, 3, 1],
      [null, null, null],
      [null, null, null],
    ]);
    expect(board.total).toBe(5);
    expect(
      (
        await owner.client.query(api.outside.board, { start: '2026-11-02', end: '2026-11-08', offset: 0 })
      ).rows.every((row) => row.steps === null),
    ).toBe(true);
  });

  it('paginates a private party without changing ranks and rejects invalid offsets/weeks', async () => {
    const t = create();
    const owner = await party(t);
    for (let i = 0; i < 40; i++) {
      const member = await guest(t);
      await member.client.mutation(api.outside.enter, {
        ...entry,
        kind: 'join',
        name: `bruh ${i}`,
        invite: owner.party.invite_code,
      });
      await member.client.mutation(api.outside.submit, {
        expectedUserId: member.userId,
        days: [{ date: week.start, steps: i }],
      });
    }
    const pages = await Promise.all(
      [0, 20, 40].map((offset) => owner.client.query(api.outside.board, { ...week, offset })),
    );
    expect(pages.map((page) => [page.rows.length, page.total])).toEqual([
      [20, 41],
      [20, 41],
      [1, 41],
    ]);
    expect(new Set(pages.flatMap((page) => page.rows.map((row) => row.user_id))).size).toBe(41);
    expect(pages[1].rows[0].place).toBe(21);
    for (const offset of [-1, 0.5])
      await expect(owner.client.query(api.outside.board, { ...week, offset })).rejects.toThrow(
        'invalid_week',
      );
    await expect(owner.client.query(api.outside.board, { ...week, start: '2026-10-27' })).rejects.toThrow(
      'invalid_week',
    );
  });

  it('erases shared history on leave and invalidates the last invite after account deletion', async () => {
    const t = create();
    const owner = await party(t);
    const other = await guest(t);
    await other.client.mutation(api.outside.enter, {
      ...entry,
      kind: 'join',
      invite: owner.party.invite_code,
    });
    await other.client.mutation(api.outside.submit, {
      expectedUserId: other.userId,
      days: [
        { date: week.start, steps: 12 },
        { date: '2026-10-19', steps: 50 },
      ],
    });
    await other.client.mutation(api.outside.depart, { removeAccount: false });
    await other.client.mutation(api.outside.depart, { removeAccount: false });
    const home = await other.client.query(api.outside.home);
    expect(home.home.party).toBeNull();
    expect(home.home.profile).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.query('outsideScores').collect())).toHaveLength(0);
    await owner.client.mutation(api.outside.depart, { removeAccount: true });
    await expect(owner.client.query(api.outside.home)).rejects.toThrow('sign_in_required');
    await expect(owner.client.mutation(api.outside.enter, entry)).rejects.toThrow('sign_in_required');
    await expect(
      other.client.mutation(api.outside.enter, { ...entry, kind: 'join', invite: owner.party.invite_code }),
    ).rejects.toThrow('invite_not_found');
    expect(await t.run((ctx) => ctx.db.query('outsideParties').collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.get(owner.userId))).toBeNull();
  });

  it('deletes every session, refresh token, account, verifier and verification code for the guest', async () => {
    const t = create();
    const owner = await party(t);
    await t.run(async (ctx) => {
      const sessionId = await ctx.db.insert('authSessions', {
        userId: owner.userId,
        expirationTime: Date.now() + 3600000,
      });
      await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 3600000 });
      await ctx.db.insert('authVerifiers', { sessionId, signature: 'test' });
      const accountId = await ctx.db.insert('authAccounts', {
        userId: owner.userId,
        provider: 'anonymous',
        providerAccountId: 'test',
      });
      await ctx.db.insert('authVerificationCodes', {
        accountId,
        provider: 'anonymous',
        code: 'test',
        expirationTime: Date.now() + 3600000,
      });
    });
    await owner.client.mutation(api.outside.depart, { removeAccount: true });
    for (const table of [
      'users',
      'outsideProfiles',
      'outsideParties',
      'outsideScores',
      'authSessions',
      'authRefreshTokens',
      'authAccounts',
      'authVerifiers',
      'authVerificationCodes',
    ] as const)
      expect(await t.run((ctx) => ctx.db.query(table).collect())).toHaveLength(0);
  });
});

describe('Outside limits and repairs', () => {
  it(`refuses the ${MAX_PARTY + 1}st member with party_full and keeps the count`, async () => {
    const t = create();
    const owner = await party(t);
    await t.run(async (ctx) => {
      const partyId = owner.party.id;
      for (let index = 1; index < MAX_PARTY; index += 1) {
        const userId = await ctx.db.insert('users', { isAnonymous: true });
        await ctx.db.insert('outsideProfiles', { userId, name: `bruh ${index}`, skin: 'original', partyId });
      }
      await ctx.db.patch(partyId, { members: MAX_PARTY });
    });
    const late = await guest(t);
    await expect(
      late.client.mutation(api.outside.enter, { ...entry, kind: 'join', invite: owner.party.invite_code }),
    ).rejects.toThrow('party_full');
    expect((await owner.client.query(api.outside.home)).home.party?.member_count).toBe(MAX_PARTY);
    expect((await owner.client.query(api.outside.board, week)).total).toBe(MAX_PARTY);
  });

  it('lets a guest leave when the member count has drifted, repairing it from the real members', async () => {
    const t = create();
    const owner = await party(t);
    const other = await guest(t);
    await other.client.mutation(api.outside.enter, {
      ...entry,
      kind: 'join',
      invite: owner.party.invite_code,
    });
    // A counter that went wrong (for example a profile deleted from the dashboard).
    await t.run((ctx) => ctx.db.patch(owner.party.id, { members: 0 }));
    await other.client.mutation(api.outside.depart, { removeAccount: false });
    expect(await t.run((ctx) => ctx.db.get(owner.party.id))).toMatchObject({ members: 1 });
    await owner.client.mutation(api.outside.depart, { removeAccount: false });
    expect(await t.run((ctx) => ctx.db.query('outsideParties').collect())).toHaveLength(0);
  });

  it('treats a profile pointing at a deleted party as having none, so the guest can carry on', async () => {
    const t = create();
    const owner = await party(t);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await t.run((ctx) => ctx.db.delete(owner.party.id));
    expect((await owner.client.query(api.outside.home)).home.party).toBeNull();
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('missing party'));
    const again = await owner.client.mutation(api.outside.enter, entry);
    expect(again.home.party?.member_count).toBe(1);
    await owner.client.mutation(api.outside.depart, { removeAccount: true });
    errors.mockRestore();
  });

  it('accepts the board end for older clients but rejects a wrong one', async () => {
    const t = create();
    const owner = await party(t);
    const { end: _end, ...withoutEnd } = week;
    expect((await owner.client.query(api.outside.board, withoutEnd)).total).toBe(1);
    await expect(owner.client.query(api.outside.board, { ...week, end: '2026-11-02' })).rejects.toThrow(
      'invalid_week',
    );
  });

  it('ranks scores first with shared places, then members without one in join order', () => {
    const row = (userId: string, joinedAt: number) =>
      ({ _id: `p${userId}`, _creationTime: 0, userId, name: userId, skin: 'original', joinedAt }) as never;
    const totals = new Map([
      ['b', 5],
      ['c', 9],
      ['d', 5],
    ]) as never;
    const ranked = rankMembers([row('a', 1), row('b', 2), row('c', 3), row('d', 4)], totals);
    expect(ranked.map((m) => [m.user_id, m.steps, m.place, m.tied])).toEqual([
      ['c', 9, 1, 1],
      ['b', 5, 2, 2],
      ['d', 5, 2, 2],
      ['a', null, null, null],
    ]);
  });
});

describe('anonymous sign-in', () => {
  // Real Convex Auth signing keys, generated per run; nothing leaves the test.
  beforeEach(() => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: 'jwk' }), use: 'sig', alg: 'RS256' };
    vi.stubEnv('JWT_PRIVATE_KEY', privateKey.export({ format: 'pem', type: 'pkcs8' }).toString());
    vi.stubEnv('JWKS', JSON.stringify({ keys: [jwk] }));
    vi.stubEnv('CONVEX_SITE_URL', 'https://test.convex.site');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('signs guests in until the flood limit, then refuses with rate_limited', async () => {
    const t = create();
    for (let index = 0; index < 40; index += 1)
      expect(await t.action(api.auth.signIn, { provider: 'anonymous' })).toHaveProperty('tokens');
    await expect(t.action(api.auth.signIn, { provider: 'anonymous' })).rejects.toThrow('rate_limited');
    expect(await t.run((ctx) => ctx.db.query('users').collect())).toHaveLength(40);
  });
});

describe('idle guests', () => {
  const DAY = 86400000;
  it('deletes profiles idle for 90 days with their scores and login, keeping active ones', async () => {
    const t = create();
    const idle = await party(t);
    const active = await guest(t);
    await active.client.mutation(api.outside.enter, {
      ...entry,
      kind: 'join',
      invite: idle.party.invite_code,
    });
    const lurker = await guest(t);
    await lurker.client.mutation(api.outside.enter, { ...entry, kind: 'profile' });
    const now = Date.now();
    await t.run(async (ctx) => {
      const profiles = await ctx.db.query('outsideProfiles').collect();
      const of = (userId: unknown) => profiles.find((row) => row.userId === userId);
      const idleRow = of(idle.userId);
      const activeRow = of(active.userId);
      if (!idleRow?.partyId || !activeRow) throw new Error('profiles missing');
      await ctx.db.patch(idleRow._id, { syncedAt: now - 10 * DAY });
      await ctx.db.patch(activeRow._id, { syncedAt: now - 10 * DAY });
      await ctx.db.insert('outsideScores', {
        userId: idle.userId,
        partyId: idleRow.partyId,
        week: '2026-10-26',
        days: [{ date: '2026-10-27', steps: 4000 }],
      });
    });
    // 85 days on, the idle guest last synced 95 days ago, the active one synced yesterday, and
    // the lurker (a profile with no party, never synced) was made 85 days ago.
    vi.setSystemTime(new Date(now + 85 * DAY));
    await t.run(async (ctx) => {
      const activeRow = (await ctx.db.query('outsideProfiles').collect()).find(
        (row) => row.userId === active.userId,
      );
      if (activeRow) await ctx.db.patch(activeRow._id, { syncedAt: Date.now() - DAY });
    });
    expect(await t.mutation(internal.outside.expireIdleGuests, {})).toBe(1);
    const left = await t.run(async (ctx) => ({
      users: (await ctx.db.query('users').collect()).map((row) => row._id),
      sessions: (await ctx.db.query('authSessions').collect()).map((row) => row.userId),
      scores: await ctx.db.query('outsideScores').collect(),
      party: (await ctx.db.query('outsideParties').collect()).map((row) => row.members),
    }));
    expect(left.users).toEqual([active.userId, lurker.userId]);
    expect(left.sessions).not.toContain(idle.userId);
    expect(left.scores).toEqual([]);
    expect(left.party).toEqual([1]);
    // Past 90 days since it was made, the never-synced lurker goes too.
    vi.setSystemTime(new Date(now + IDLE_GUEST + DAY));
    expect(await t.mutation(internal.outside.expireIdleGuests, {})).toBe(1);
    expect(await t.run(async (ctx) => (await ctx.db.query('users').collect()).map((row) => row._id))).toEqual(
      [active.userId],
    );
  });
});
