import { getAuthSessionId, getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, mutation, type QueryCtx, query } from './_generated/server';
import { day, homeResult, member, profileName, skin, validDate, weekStart } from './validators';

type Reader = QueryCtx | MutationCtx;

async function actor(ctx: Reader): Promise<Id<'users'>> {
  const [userId, sessionId] = await Promise.all([getAuthUserId(ctx), getAuthSessionId(ctx)]);
  if (!userId || !sessionId) throw new ConvexError('sign_in_required');
  const [user, session] = await Promise.all([ctx.db.get(userId), ctx.db.get(sessionId)]);
  // Checking only the JWT subject would let a deleted guest use an unexpired token.
  if (!user || !session || session.userId !== userId || session.expirationTime <= Date.now())
    throw new ConvexError('sign_in_required');
  return userId;
}

async function profile(ctx: Reader, userId: Id<'users'>): Promise<Doc<'outsideProfiles'> | null> {
  return ctx.db
    .query('outsideProfiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
}

async function readHome(ctx: Reader, userId: Id<'users'>) {
  const saved = await profile(ctx, userId);
  const party = saved?.partyId ? await ctx.db.get(saved.partyId) : null;
  if (saved?.partyId && (!party || party.members < 1)) throw new ConvexError('invalid_party');
  return {
    userId,
    home: {
      profile: saved ? { id: userId, name: saved.name, skin: saved.skin } : null,
      party: party
        ? {
            id: party._id,
            invite_code: party.invite,
            created_at: new Date(party._creationTime).toISOString(),
            synced_at: saved?.syncedAt === undefined ? null : new Date(saved.syncedAt).toISOString(),
            member_count: party.members,
          }
        : null,
    },
  };
}

export const home = query({
  args: {},
  returns: homeResult,
  handler: async (ctx) => {
    if ((await getAuthUserId(ctx)) === null) return { userId: null, home: { profile: null, party: null } };
    return readHome(ctx, await actor(ctx));
  },
});

export const enter = mutation({
  args: {
    kind: v.union(v.literal('create'), v.literal('join'), v.literal('profile')),
    name: v.string(),
    skin,
    invite: v.optional(v.string()),
  },
  returns: homeResult,
  handler: async (ctx, args) => {
    const userId = await actor(ctx);
    const name = profileName(args.name);
    const saved = await profile(ctx, userId);
    let partyId = saved?.partyId;
    if (args.kind === 'join') {
      const invite = args.invite?.trim().toLowerCase();
      if (!invite || !/^[a-f0-9]{32}$/.test(invite)) throw new ConvexError('invite_not_found');
      const party = await ctx.db
        .query('outsideParties')
        .withIndex('by_invite', (q) => q.eq('invite', invite))
        .unique();
      if (!party) throw new ConvexError('invite_not_found');
      if (partyId && partyId !== party._id) throw new ConvexError('already_in_party');
      partyId = party._id;
    } else if (args.kind === 'create' && !partyId) {
      // Convex provides a seeded strong PRNG inside mutations. Four 32-bit words
      // retain the existing 128-bit invite format without client-controlled codes.
      const invite = Array.from({ length: 4 }, () =>
        Math.floor(Math.random() * 2 ** 32)
          .toString(16)
          .padStart(8, '0'),
      ).join('');
      if (
        await ctx.db
          .query('outsideParties')
          .withIndex('by_invite', (q) => q.eq('invite', invite))
          .unique()
      )
        throw new ConvexError('invite_collision');
      partyId = await ctx.db.insert('outsideParties', { invite, members: 0 });
    }
    const joining = partyId !== undefined && saved?.partyId !== partyId;
    if (joining && partyId) {
      const party = await ctx.db.get(partyId);
      if (!party) throw new ConvexError('invite_not_found');
      // OCC serializes this update with joins and the last departure.
      await ctx.db.patch(party._id, { members: party.members + 1 });
    }
    const values = { name, skin: args.skin, ...(joining ? { partyId, joinedAt: Date.now() } : {}) };
    if (saved) await ctx.db.patch(saved._id, values);
    else await ctx.db.insert('outsideProfiles', { userId, ...values });
    return readHome(ctx, userId);
  },
});

export const submit = mutation({
  args: { expectedUserId: v.string(), days: v.array(day) },
  returns: v.literal(true),
  handler: async (ctx, { expectedUserId, days }): Promise<true> => {
    const userId = await actor(ctx);
    if (expectedUserId !== userId) throw new ConvexError('sign_in_required');
    const saved = await profile(ctx, userId);
    if (!saved?.partyId) throw new ConvexError('not_in_party');
    // Health reads at most seven daily buckets. Validate all of them before any write.
    if (days.length < 1 || days.length > 7) throw new ConvexError('invalid_steps');
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const dates = new Set<string>();
    const weeks = new Map<string, typeof days>();
    for (const value of days) {
      if (
        !validDate(value.date) ||
        value.date > tomorrow ||
        dates.has(value.date) ||
        !Number.isSafeInteger(value.steps) ||
        value.steps < 0 ||
        value.steps > 2147483647
      )
        throw new ConvexError('invalid_steps');
      dates.add(value.date);
      const week = weekStart(value.date);
      weeks.set(week, [...(weeks.get(week) ?? []), value]);
    }
    const partyId = saved.partyId;
    await Promise.all(
      Array.from(weeks, async ([week, submitted]) => {
        const existing = await ctx.db
          .query('outsideScores')
          .withIndex('by_user_party_week', (q) =>
            q.eq('userId', userId).eq('partyId', partyId).eq('week', week),
          )
          .unique();
        const totals = new Map((existing?.days ?? []).map((value) => [value.date, value.steps]));
        for (const value of submitted)
          totals.set(value.date, Math.max(totals.get(value.date) ?? 0, value.steps));
        const next = Array.from(totals, ([date, steps]) => ({ date, steps })).sort((a, b) =>
          a.date.localeCompare(b.date),
        );
        if (existing) await ctx.db.patch(existing._id, { days: next });
        else await ctx.db.insert('outsideScores', { userId, partyId, week, days: next });
      }),
    );
    await ctx.db.patch(saved._id, { syncedAt: Date.now() });
    return true;
  },
});

export const board = query({
  args: { start: v.string(), end: v.string(), offset: v.number() },
  returns: v.object({ rows: v.array(member), total: v.number() }),
  handler: async (ctx, { start, end, offset }) => {
    const userId = await actor(ctx);
    if (
      !validDate(start) ||
      !validDate(end) ||
      weekStart(start) !== start ||
      Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`) !== 6 * 86400000 ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    )
      throw new ConvexError('invalid_week');
    const saved = await profile(ctx, userId);
    if (!saved?.partyId) throw new ConvexError('not_in_party');
    const partyId = saved.partyId;
    // Two indexed reads for the private party; no per-member/day query waterfall.
    const [members, scores] = await Promise.all([
      ctx.db
        .query('outsideProfiles')
        .withIndex('by_party', (q) => q.eq('partyId', partyId))
        .collect(),
      ctx.db
        .query('outsideScores')
        .withIndex('by_party_week', (q) => q.eq('partyId', partyId).eq('week', start))
        .collect(),
    ]);
    const totals = new Map(
      scores.map((row) => [row.userId, row.days.reduce((sum, value) => sum + value.steps, 0)]),
    );
    const sorted = members
      .map((row) => ({ row, steps: totals.get(row.userId) ?? null }))
      .sort(
        (a, b) =>
          (a.steps === null ? (b.steps === null ? 0 : 1) : b.steps === null ? -1 : b.steps - a.steps) ||
          (a.row.joinedAt ?? a.row._creationTime) - (b.row.joinedAt ?? b.row._creationTime) ||
          a.row.userId.localeCompare(b.row.userId),
      );
    const ties = new Map<number, number>();
    for (const { steps } of sorted) if (steps !== null) ties.set(steps, (ties.get(steps) ?? 0) + 1);
    let previous: number | null = null;
    let place = 0;
    const rows = sorted.map(({ row, steps }, index) => {
      if (steps !== null && (index === 0 || steps !== previous)) place = index + 1;
      previous = steps;
      return {
        user_id: row.userId,
        name: row.name,
        skin: row.skin,
        steps,
        place: steps === null ? null : place,
        tied: steps === null ? null : (ties.get(steps) ?? 1),
        synced_at: row.syncedAt === undefined ? null : new Date(row.syncedAt).toISOString(),
      };
    });
    // Keep the existing twenty-row page (about three phone viewports).
    return { rows: rows.slice(offset, offset + 20), total: members.length };
  },
});

async function leave(ctx: MutationCtx, saved: Doc<'outsideProfiles'> | null): Promise<void> {
  if (!saved?.partyId) return;
  const partyId = saved.partyId;
  const [party, scores] = await Promise.all([
    ctx.db.get(partyId),
    ctx.db
      .query('outsideScores')
      .withIndex('by_user_party_week', (q) => q.eq('userId', saved.userId).eq('partyId', partyId))
      .collect(),
  ]);
  await Promise.all(scores.map((score) => ctx.db.delete(score._id)));
  await ctx.db.patch(saved._id, { partyId: undefined, joinedAt: undefined, syncedAt: undefined });
  if (!party || party.members < 1) throw new ConvexError('invalid_party');
  if (party.members === 1) await ctx.db.delete(partyId);
  else await ctx.db.patch(partyId, { members: party.members - 1 });
}

export const depart = mutation({
  args: { removeAccount: v.boolean() },
  returns: v.literal(true),
  handler: async (ctx, { removeAccount }): Promise<true> => {
    const userId = await actor(ctx);
    const saved = await profile(ctx, userId);
    await leave(ctx, saved);
    if (removeAccount) {
      const [sessions, accounts] = await Promise.all([
        ctx.db
          .query('authSessions')
          .withIndex('userId', (q) => q.eq('userId', userId))
          .collect(),
        ctx.db
          .query('authAccounts')
          .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
          .collect(),
      ]);
      await Promise.all(
        sessions.map(async (session) => {
          const [tokens, verifiers] = await Promise.all([
            ctx.db
              .query('authRefreshTokens')
              .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
              .collect(),
            ctx.db
              .query('authVerifiers')
              .withIndex('by_session', (q) => q.eq('sessionId', session._id))
              .collect(),
          ]);
          await Promise.all([...tokens, ...verifiers].map((row) => ctx.db.delete(row._id)));
          await ctx.db.delete(session._id);
        }),
      );
      await Promise.all(
        accounts.map(async (account) => {
          const codes = await ctx.db
            .query('authVerificationCodes')
            .withIndex('accountId', (q) => q.eq('accountId', account._id))
            .collect();
          await Promise.all(codes.map((code) => ctx.db.delete(code._id)));
          await ctx.db.delete(account._id);
        }),
      );
      if (saved) await ctx.db.delete(saved._id);
      await ctx.db.delete(userId);
    }
    return true;
  },
});
