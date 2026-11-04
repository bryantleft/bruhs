import { getAuthSessionId, getAuthUserId } from '@convex-dev/auth/server';
import { type Infer, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, mutation, type QueryCtx, query } from './_generated/server';
import {
  day,
  fail,
  homeResult,
  MAX_PARTY,
  type Member,
  member,
  profileName,
  skin,
  validDate,
  weekStart,
} from './validators';

type Reader = QueryCtx | MutationCtx;
type Home = Infer<typeof homeResult>;

const DAY = 86400000;
// Health reports a day's total, and no real day comes near this; it keeps one call from
// winning every race.
const MAX_DAILY_STEPS = 200_000;

async function actor(ctx: Reader): Promise<Id<'users'>> {
  const [userId, sessionId] = await Promise.all([getAuthUserId(ctx), getAuthSessionId(ctx)]);
  if (!userId || !sessionId) fail('sign_in_required');
  const [user, session] = await Promise.all([ctx.db.get(userId), ctx.db.get(sessionId)]);
  // Checking only the JWT subject would let a deleted guest use an unexpired token.
  if (!user || !session || session.userId !== userId || session.expirationTime <= Date.now())
    fail('sign_in_required');
  return userId;
}

async function profile(ctx: Reader, userId: Id<'users'>): Promise<Doc<'outsideProfiles'> | null> {
  return ctx.db
    .query('outsideProfiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
}

// The party a profile points at, or null when it points nowhere. A dangling pointer (a party
// deleted from the dashboard) is logged and treated as no party, so the guest can still join,
// leave or delete their account instead of being stuck on an error.
async function currentParty(
  ctx: Reader,
  saved: Doc<'outsideProfiles'> | null,
): Promise<Doc<'outsideParties'> | null> {
  if (!saved?.partyId) return null;
  const party = await ctx.db.get(saved.partyId);
  if (!party) console.error(`Profile ${saved._id} points at missing party ${saved.partyId}.`);
  return party;
}

async function readHome(ctx: Reader, userId: Id<'users'>): Promise<Home> {
  const saved = await profile(ctx, userId);
  const party = await currentParty(ctx, saved);
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

type Entry =
  | Readonly<{ kind: 'join'; invite: string; name: string; skin: Infer<typeof skin> }>
  | Readonly<{ kind: 'create' | 'profile'; name: string; skin: Infer<typeof skin> }>;

// Convex requires an object for top-level args, so the join/create split can't live in the
// validator. Narrow it here, before anything reads the fields: a join needs an invite, and the
// others must not carry one.
function entryOf(
  args: Readonly<{ kind: Entry['kind']; name: string; skin: Entry['skin']; invite?: string }>,
): Entry {
  const { kind, name, skin: chosen, invite } = args;
  if (kind === 'join') {
    if (invite === undefined) fail('invite_not_found');
    return { kind, invite, name, skin: chosen };
  }
  if (invite !== undefined) fail('invite_not_found');
  return { kind, name, skin: chosen };
}

export const enter = mutation({
  args: {
    kind: v.union(v.literal('create'), v.literal('join'), v.literal('profile')),
    name: v.string(),
    skin,
    invite: v.optional(v.string()),
  },
  returns: homeResult,
  handler: async (ctx, raw) => {
    const args = entryOf(raw);
    const userId = await actor(ctx);
    const name = profileName(args.name);
    const saved = await profile(ctx, userId);
    let partyId = (await currentParty(ctx, saved))?._id;
    if (args.kind === 'join') {
      const invite = args.invite.trim().toLowerCase();
      if (!/^[a-f0-9]{32}$/.test(invite)) fail('invite_not_found');
      const party = await ctx.db
        .query('outsideParties')
        .withIndex('by_invite', (q) => q.eq('invite', invite))
        .unique();
      if (!party) fail('invite_not_found');
      if (partyId && partyId !== party._id) fail('already_in_party');
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
        fail('invite_collision');
      partyId = await ctx.db.insert('outsideParties', { invite, members: 0 });
    }
    const joining = partyId !== undefined && saved?.partyId !== partyId;
    if (joining && partyId) {
      const party = await ctx.db.get(partyId);
      if (!party) fail('invite_not_found');
      if (party.members >= MAX_PARTY) fail('party_full');
      // OCC serializes this update with joins and the last departure.
      await ctx.db.patch(party._id, { members: party.members + 1 });
    }
    const values = { name, skin: args.skin, ...(joining ? { partyId, joinedAt: Date.now() } : {}) };
    if (saved) await ctx.db.patch(saved._id, values);
    else await ctx.db.insert('outsideProfiles', { userId, ...values });
    return readHome(ctx, userId);
  },
});

// The client only sends the current race week; allowing last week too covers a late sync
// across Monday. Older dates would let one guest grow their score rows without bound.
function submitWindow(now: number): Readonly<{ earliest: string; latest: string }> {
  const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
  return { earliest: weekStart(iso(now - 7 * DAY)), latest: iso(now + DAY) };
}

export const submit = mutation({
  // A plain string on purpose: the client keeps this id as text, and any mismatch (including a
  // malformed id) must read as a stale login, sign_in_required, not as a validation error.
  args: { expectedUserId: v.string(), days: v.array(day) },
  returns: v.literal(true),
  handler: async (ctx, { expectedUserId, days }): Promise<true> => {
    const userId = await actor(ctx);
    if (expectedUserId !== userId) fail('sign_in_required');
    const saved = await profile(ctx, userId);
    if (!saved?.partyId) fail('not_in_party');
    // Health reads at most seven daily buckets. Validate all of them before any write.
    if (days.length < 1 || days.length > 7) fail('invalid_steps');
    const { earliest, latest } = submitWindow(Date.now());
    const dates = new Set<string>();
    const weeks = new Map<string, typeof days>();
    for (const value of days) {
      if (
        !validDate(value.date) ||
        value.date < earliest ||
        value.date > latest ||
        dates.has(value.date) ||
        !Number.isSafeInteger(value.steps) ||
        value.steps < 0 ||
        value.steps > MAX_DAILY_STEPS
      )
        fail('invalid_steps');
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

type Ranked = Readonly<{ row: Doc<'outsideProfiles'>; steps: number | null }>;

// Most steps first, then members without a score; ties keep join order. Places are dense
// ("1, 1, 3"), and `tied` counts members sharing a score.
export function rankMembers(
  members: readonly Doc<'outsideProfiles'>[],
  totals: ReadonlyMap<Id<'users'>, number>,
): Member[] {
  const joined = (row: Doc<'outsideProfiles'>) => row.joinedAt ?? row._creationTime;
  const byScore = (a: Ranked, b: Ranked): number => {
    if (a.steps === null || b.steps === null) return (a.steps === null ? 1 : 0) - (b.steps === null ? 1 : 0);
    return b.steps - a.steps;
  };
  const sorted = members
    .map((row): Ranked => ({ row, steps: totals.get(row.userId) ?? null }))
    .sort(
      (a, b) => byScore(a, b) || joined(a.row) - joined(b.row) || a.row.userId.localeCompare(b.row.userId),
    );
  const ties = new Map<number, number>();
  for (const { steps } of sorted) if (steps !== null) ties.set(steps, (ties.get(steps) ?? 0) + 1);
  return sorted.map(({ row, steps }, index): Member => {
    const base = {
      user_id: row.userId,
      name: row.name,
      skin: row.skin,
      synced_at: row.syncedAt === undefined ? null : new Date(row.syncedAt).toISOString(),
    };
    if (steps === null) return { ...base, steps: null, place: null, tied: null };
    const first = sorted.findIndex((other) => other.steps === steps);
    return { ...base, steps, place: (first < 0 ? index : first) + 1, tied: ties.get(steps) ?? 1 };
  });
}

export const board = query({
  // `end` is always `start` + 6 days; it stays optional for clients that still send it.
  args: { start: v.string(), end: v.optional(v.string()), offset: v.number() },
  returns: v.object({ rows: v.array(member), total: v.number() }),
  handler: async (ctx, { start, end, offset }) => {
    const userId = await actor(ctx);
    const expectedEnd = validDate(start)
      ? new Date(Date.parse(`${start}T00:00:00Z`) + 6 * DAY).toISOString().slice(0, 10)
      : null;
    if (
      !expectedEnd ||
      weekStart(start) !== start ||
      (end !== undefined && end !== expectedEnd) ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    )
      fail('invalid_week');
    const saved = await profile(ctx, userId);
    if (!saved?.partyId) fail('not_in_party');
    const partyId = saved.partyId;
    // Two indexed reads for the private party, both bounded by the party cap.
    const [members, scores] = await Promise.all([
      ctx.db
        .query('outsideProfiles')
        .withIndex('by_party', (q) => q.eq('partyId', partyId))
        .take(MAX_PARTY),
      ctx.db
        .query('outsideScores')
        .withIndex('by_party_week', (q) => q.eq('partyId', partyId).eq('week', start))
        .take(MAX_PARTY),
    ]);
    const totals = new Map(
      scores.map((row) => [row.userId, row.days.reduce((sum, value) => sum + value.steps, 0)]),
    );
    // Keep the existing twenty-row page (about three phone viewports).
    return { rows: rankMembers(members, totals).slice(offset, offset + 20), total: members.length };
  },
});

async function leave(ctx: MutationCtx, saved: Doc<'outsideProfiles'> | null): Promise<void> {
  if (!saved?.partyId) return;
  const partyId = saved.partyId;
  const [party, scores] = await Promise.all([
    currentParty(ctx, saved),
    ctx.db
      .query('outsideScores')
      .withIndex('by_user_party_week', (q) => q.eq('userId', saved.userId).eq('partyId', partyId))
      .collect(),
  ]);
  await Promise.all(scores.map((score) => ctx.db.delete(score._id)));
  await ctx.db.patch(saved._id, { partyId: undefined, joinedAt: undefined, syncedAt: undefined });
  if (!party) return;
  // Count who is really left rather than trusting the counter, so a drifted count repairs
  // itself here instead of locking the last member in.
  const remaining = (
    await ctx.db
      .query('outsideProfiles')
      .withIndex('by_party', (q) => q.eq('partyId', partyId))
      .take(MAX_PARTY + 1)
  ).filter((row) => row._id !== saved._id).length;
  if (remaining === 0) await ctx.db.delete(partyId);
  else await ctx.db.patch(partyId, { members: remaining });
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
