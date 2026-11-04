import assert from 'node:assert/strict';
import test from 'node:test';
import { checkWaitlistUrl } from './waitlist-url.ts';

test('accepts the local route and a deployed .convex.site route', () => {
  assert.equal(checkWaitlistUrl('http://127.0.0.1:3211/waitlist', false), 'http://127.0.0.1:3211/waitlist');
  const live = 'https://earnest-wren-707.convex.site/waitlist';
  assert.equal(checkWaitlistUrl(live, true), live);
});

test('refuses a missing, malformed or wrong-path URL, naming the variable', () => {
  for (const value of [undefined, '', 'not a url', 'https://x.convex.site/'])
    assert.throws(() => checkWaitlistUrl(value, false), /PUBLIC_WAITLIST_URL/);
});

test('refuses deployed builds that would drop signups', () => {
  assert.throws(() => checkWaitlistUrl('http://x.convex.site/waitlist', true), /https/);
  // The client URL serves queries, not HTTP actions: every signup would 404.
  assert.throws(() => checkWaitlistUrl('https://x.convex.cloud/waitlist', true), /\.convex\.site/);
});
