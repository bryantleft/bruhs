import { ConvexCredentials } from '@convex-dev/auth/providers/ConvexCredentials';
import { convexAuth, createAccount } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import { rateLimiter } from './limits';

// The library's Anonymous provider, plus a global rate limit: every sign-in creates a user and a
// session, so an unthrottled endpoint lets a script grow both tables (and parties) without bound.
const Anonymous = ConvexCredentials({
  id: 'anonymous',
  authorize: async (_params, ctx) => {
    const limit = await rateLimiter.limit(ctx, 'anonymousSignIn');
    if (!limit.ok) throw new ConvexError('rate_limited');
    const { user } = await createAccount(ctx, {
      provider: 'anonymous',
      account: { id: crypto.randomUUID() },
      profile: { isAnonymous: true },
    });
    return { userId: user._id };
  },
});

export const { auth, signIn, signOut, store } = convexAuth({ providers: [Anonymous] });
