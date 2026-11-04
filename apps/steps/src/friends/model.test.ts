import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeBoard, decodeHome, inviteCode, raceWeek, validPartyName } from './model.ts';

const user = '915303b0-aacb-4717-8c7d-c882b20ea3bf';
const party = 'af07b88e-3fba-4a07-9a17-3524b13ff6d1';
const at = '2026-10-26T17:13:50.236353+00:00';
const home = {
  profile: { id: user, name: 'moss', skin: 'pandan' },
  party: {
    id: party,
    invite_code: '1234567890abcdef1234567890abcdef',
    created_at: at,
    synced_at: null,
    member_count: 1,
  },
};

test('decodes the actual party RPC shape without losing unread status', () => {
  assert.deepEqual(decodeHome(home), {
    profile: { id: user, name: 'moss', skin: 'pandan' },
    party: { id: party, invite: home.party.invite_code, createdAt: at, syncedAt: null, members: 1 },
  });
});

test('keeps a reported zero, ties and an unread member distinct', () => {
  const row = { user_id: user, name: 'moss', skin: 'pandan', steps: 0, place: 1, tied: 2, synced_at: at };
  assert.deepEqual(decodeBoard([row])?.[0], {
    id: user,
    name: 'moss',
    skin: 'pandan',
    steps: 0,
    place: 1,
    tied: 2,
    syncedAt: at,
  });
  assert.equal(decodeBoard([{ ...row, steps: null, place: null, tied: null }])?.[0].steps, null);
  for (const value of [
    [row, row],
    [{ ...row, steps: -1 }],
    [{ ...row, steps: null }],
    [{ ...row, steps: Number.MAX_SAFE_INTEGER + 1 }],
    [{ ...row, place: 0 }],
  ])
    assert.equal(decodeBoard(value), null);
});

test('party names and invitation codes match the database boundary', () => {
  assert.equal(validPartyName(' 🌱 moss '), true);
  assert.equal(validPartyName('🌱'.repeat(24)), true);
  for (const name of ['', '  ', 'x'.repeat(25), 'hi\nthere', '\u0085', 'hi\u2028there'])
    assert.equal(validPartyName(name), false);
  assert.equal(inviteCode(' ABCDEF1234567890ABCDEF1234567890 '), 'abcdef1234567890abcdef1234567890');
  assert.equal(inviteCode('123456'), null);
});

test('weekly races reset together at Monday 00:00 UTC across offsets and year boundaries', () => {
  const sunday = raceWeek(new Date('2026-10-25T23:59:59.999Z'));
  assert.equal(sunday.start, '2026-10-19');
  assert.equal(sunday.end, '2026-10-25');
  const monday = raceWeek(new Date('2026-10-25T19:00:00-05:00'));
  assert.equal(monday.start, '2026-10-26');
  assert.equal(monday.next, Date.parse('2026-11-02T00:00:00Z'));
  assert.equal(raceWeek(new Date('2027-01-01T12:00:00+14:00')).start, '2026-12-28');
});

test('rejects malformed external party data', () => {
  for (const value of [
    null,
    [],
    {},
    { ...home, profile: null },
    { ...home, party: { ...home.party, member_count: 0 } },
    { ...home, profile: { ...home.profile, skin: 'fake' } },
    { ...home, party: { ...home.party, synced_at: 'today' } },
  ]) {
    assert.equal(decodeHome(value), null);
  }
});
