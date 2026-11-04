import assert from 'node:assert/strict';
import test from 'node:test';
import { listings, STORES, type Store, storeLine } from './stores.ts';

const apple = 'https://apps.apple.com/app/id6830522823';
const play = 'https://play.google.com/store/apps/details?id=dev.bruhs.outside';
const withUrls = (appStore: string | null, googlePlay: string | null): Store[] => [
  { id: 'app-store', platform: 'iPhone', url: appStore },
  { id: 'google-play', platform: 'Android', url: googlePlay },
];

test('the shipped config is valid', () => {
  assert.doesNotThrow(() => listings(STORES));
});

test('shows no badges and says coming soon before any listing', () => {
  assert.deepEqual(listings(withUrls(null, null)), []);
  assert.equal(storeLine(withUrls(null, null)), 'coming to iPhone and Android');
});

test('says what is out and what is still coming', () => {
  assert.equal(storeLine(withUrls(apple, null)), 'out now on iPhone. Android soon.');
  assert.equal(storeLine(withUrls(null, play)), 'out now on Android. iPhone soon.');
  assert.equal(storeLine(withUrls(apple, play)), 'out now on iPhone and Android');
  assert.deepEqual(
    listings(withUrls(apple, play)).map((store) => store.id),
    ['app-store', 'google-play'],
  );
});

test('refuses links that are not the store listing pages', () => {
  for (const bad of ['apps.apple.com/app/id1', 'http://apps.apple.com/app/id1', play, 'https://testflight.apple.com/join/abc'])
    assert.throws(() => listings(withUrls(bad, null)), /app-store/);
  assert.throws(() => listings(withUrls(null, apple)), /google-play/);
});
