import { cronJobs } from 'convex/server';
import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import { internalMutation } from './_generated/server';

const crons = cronJobs();
const WEEK = 7 * 24 * 60 * 60 * 1000;

// Unconfirmed waitlist signups expire with their link.
crons.interval('expire unconfirmed waitlist signups', { hours: 6 }, internal.waitlist.expirePending);

// The Resend component keeps finished emails until told otherwise (its README's cron).
crons.interval('remove old emails from the resend component', { hours: 1 }, internal.crons.cleanupResend);

export const cleanupResend = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, components.resend.lib.cleanupOldEmails, { olderThan: WEEK });
    // Abandoned emails usually mean a bug, so keep them longer for a look.
    await ctx.scheduler.runAfter(0, components.resend.lib.cleanupAbandonedEmails, { olderThan: 4 * WEEK });
    return null;
  },
});

export default crons;
