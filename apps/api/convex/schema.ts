import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { day, skin } from './validators';

export default defineSchema({
  ...authTables,
  authVerifiers: authTables.authVerifiers.index('by_session', ['sessionId']),
  outsideProfiles: defineTable({
    userId: v.id('users'),
    name: v.string(),
    skin,
    partyId: v.optional(v.id('outsideParties')),
    joinedAt: v.optional(v.number()),
    syncedAt: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_party', ['partyId']),
  // Outside's launch waitlist: one row per normalised email, written only by the HTTP route.
  waitlist: defineTable({ email: v.string() }).index('by_email', ['email']),
  outsideParties: defineTable({ invite: v.string(), members: v.number() }).index('by_invite', ['invite']),
  // Seven daily buckets per weekly row, instead of a query per member or day.
  outsideScores: defineTable({
    userId: v.id('users'),
    partyId: v.id('outsideParties'),
    week: v.string(),
    days: v.array(day),
  })
    .index('by_party_week', ['partyId', 'week'])
    .index('by_user_party_week', ['userId', 'partyId', 'week']),
});
