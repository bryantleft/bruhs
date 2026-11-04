import { ConvexError, v } from 'convex/values';

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
export const member = v.object({
  user_id: v.id('users'),
  name: v.string(),
  skin,
  steps: v.union(v.number(), v.null()),
  place: v.union(v.number(), v.null()),
  tied: v.union(v.number(), v.null()),
  synced_at: v.union(v.string(), v.null()),
});

export function profileName(value: string): string {
  const name = value.trim();
  const characters = Array.from(name);
  if (
    characters.length < 1 ||
    characters.length > 24 ||
    characters.some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || (code >= 127 && code <= 159) || code === 8232 || code === 8233;
    })
  )
    throw new ConvexError('invalid_profile');
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
