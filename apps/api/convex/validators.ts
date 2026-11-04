import { ConvexError, type Infer, v } from 'convex/values';

// Every error code the Outside API can throw. Clients match on these, so the list is the
// contract: add a code here first, then handle it in apps/outside/src/friends/client.ts.
export const OUTSIDE_ERRORS = [
  'sign_in_required',
  'rate_limited',
  'invalid_profile',
  'invite_not_found',
  'already_in_party',
  'party_full',
  'invite_collision',
  'not_in_party',
  'invalid_steps',
  'invalid_week',
] as const;
export type OutsideError = (typeof OUTSIDE_ERRORS)[number];

export function fail(code: OutsideError): never {
  throw new ConvexError(code);
}

// Small private races; also bounds every per-party read below.
export const MAX_PARTY = 50;

export const skin = v.union(
  v.literal('original'),
  v.literal('pandan'),
  v.literal('durian'),
  v.literal('mangosteen'),
  v.literal('dragonfruit'),
  v.literal('blueberry'),
);
export const day = v.object({ date: v.string(), steps: v.number() });
export const homeResult = v.object({
  userId: v.union(v.id('users'), v.null()),
  home: v.object({
    profile: v.union(v.null(), v.object({ id: v.id('users'), name: v.string(), skin })),
    party: v.union(
      v.null(),
      v.object({
        id: v.id('outsideParties'),
        invite_code: v.string(),
        created_at: v.string(),
        synced_at: v.union(v.string(), v.null()),
        member_count: v.number(),
      }),
    ),
  }),
});
const memberBase = {
  user_id: v.id('users'),
  name: v.string(),
  skin,
  synced_at: v.union(v.string(), v.null()),
};
// A member either has a score this week (with its place and tie count) or has none of the three.
export const member = v.union(
  v.object({ ...memberBase, steps: v.number(), place: v.number(), tied: v.number() }),
  v.object({ ...memberBase, steps: v.null(), place: v.null(), tied: v.null() }),
);
export type Member = Infer<typeof member>;

export function profileName(value: string): string {
  const name = value.trim();
  const characters = Array.from(name);
  if (
    characters.length < 1 ||
    characters.length > 24 ||
    characters.some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (
        code <= 31 ||
        (code >= 127 && code <= 159) ||
        // Zero-width characters and bidi controls: invisible, and able to reverse or disguise
        // a name other members see.
        (code >= 0x200b && code <= 0x200f) ||
        (code >= 0x2028 && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069) ||
        code === 0xfeff
      );
    })
  )
    fail('invalid_profile');
  return name;
}

export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

export function weekStart(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
