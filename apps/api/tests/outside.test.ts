import { makeFunctionReference } from 'convex/server';
import type { Value } from 'convex/values';
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../convex/_generated/api';
import schema from '../convex/schema';

const modules = {
  '../convex/_generated/server.js': () => import('../convex/_generated/server.js'),
  '../convex/auth.ts': () => import('../convex/auth'),
  '../convex/outside.ts': () => import('../convex/outside'),
};
const create = () => convexTest(schema, modules);
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
    for (const name of ['', '  ', 'x'.repeat(25), 'hi\nthere', '\u0085', 'a\u2028b'])
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
      [{ date: week.start, steps: 2147483648 }],
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
