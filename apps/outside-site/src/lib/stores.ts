// Outside's store listings. Leave a URL null until that listing is live: Apple and Google only
// allow their badges to link to a live listing (or a pre-order / pre-registration page), so the
// page shows each official badge once its URL is set and says "coming to ..." until then.
// The badge files in public/badges are Apple's and Google's own, unmodified: Apple's from
// toolbox.marketingtools.apple.com, Google's from play.google.com/intl/en_us/badges.
export type StoreId = 'app-store' | 'google-play';
export type Store = Readonly<{ id: StoreId; platform: string; url: string | null }>;

export const STORES: readonly Store[] = [
  { id: 'app-store', platform: 'iPhone', url: null },
  { id: 'google-play', platform: 'Android', url: null },
];

// Where each store's listing pages live, so a pasted link can't point anywhere else.
const HOSTS: Readonly<Record<StoreId, string>> = {
  'app-store': 'apps.apple.com',
  'google-play': 'play.google.com',
};

export type Listing = Readonly<{ id: StoreId; platform: string; url: string }>;

// The stores with a listing, checked so a typo fails the build instead of shipping a dead badge.
export function listings(stores: readonly Store[]): Listing[] {
  return stores.flatMap(({ id, platform, url }) => {
    if (url === null) return [];
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`The ${id} URL in src/lib/stores.ts is not a URL; got "${url}".`);
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== HOSTS[id])
      throw new Error(`The ${id} URL in src/lib/stores.ts must be an https://${HOSTS[id]} link; got "${url}".`);
    return [{ id, platform, url }];
  });
}

// The attribution each store's badge guidelines ask for wherever the badge appears.
const TRADEMARKS: Readonly<Record<StoreId, string>> = {
  'app-store': 'Apple, the Apple logo, iPhone and App Store are trademarks of Apple Inc., registered in the U.S. and other countries.',
  'google-play': 'Google Play and the Google Play logo are trademarks of Google LLC.',
};

export function trademarks(live: readonly Listing[]): string[] {
  return live.map((store) => TRADEMARKS[store.id]);
}

function both(names: readonly string[]): string {
  return names.join(' and ');
}

// The hero chip: what's out, then what's still coming.
export function storeLine(stores: readonly Store[]): string {
  const live = new Set(listings(stores).map((store) => store.id));
  const out = stores.filter((store) => live.has(store.id)).map((store) => store.platform);
  const soon = stores.filter((store) => !live.has(store.id)).map((store) => store.platform);
  if (out.length === 0) return `coming to ${both(soon)}`;
  if (soon.length === 0) return `out now on ${both(out)}`;
  return `out now on ${both(out)}. ${both(soon)} soon.`;
}
