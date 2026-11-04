import assert from 'node:assert/strict';
import test from 'node:test';
import type { HealthRead, HealthRequest } from '../health/model.ts';
import type { PartyIdentity, PartyService } from './client.ts';
import { createPartyController, type PartyInputs } from './controller.ts';
import { type PartyResult, raceWeek } from './model.ts';

// The controller runs as plain calls: `settle` stands in for React rendering and running
// effects, which is all the provider adds.
const week = raceWeek();
const user = '11111111-1111-4111-8111-111111111111';
const identity: PartyIdentity = {
  userId: user,
  home: {
    profile: { id: user, name: 'moss', skin: 'original' },
    party: {
      id: '22222222-2222-4222-8222-222222222222',
      invite: 'a'.repeat(32),
      createdAt: `${week.start}T12:00:00.000Z`,
      syncedAt: null,
      members: 1,
    },
  },
};
const member = {
  id: user,
  name: 'moss',
  skin: 'original' as const,
  steps: 50,
  place: 1,
  tied: 1,
  syncedAt: `${week.start}T12:00:00.000Z`,
};
const inputs: PartyInputs = {
  health: {
    source: 'apple-health',
    enabled: true,
    startedOn: week.start,
    syncedAt: `${week.start}T11:00:00.000Z`,
  },
  demo: false,
  ready: true,
  resetting: false,
};

function harness(overrides: Partial<PartyService> = {}) {
  const calls = { home: 0, board: [] as number[], submit: 0, reads: [] as HealthRequest[] };
  let signedOut: (() => void) | null = null;
  const service: PartyService = {
    async home() {
      calls.home += 1;
      return { ok: true, value: identity };
    },
    async board(_week, offset) {
      calls.board.push(offset);
      return { ok: true, value: { rows: [member], total: 1 } };
    },
    async submit(): Promise<PartyResult<true>> {
      calls.submit += 1;
      return { ok: true, value: true };
    },
    async enter() {
      return { ok: true, value: identity };
    },
    async depart() {
      return { ok: true, value: true };
    },
    onSignedOut(callback) {
      signedOut = callback;
      return () => {
        signedOut = null;
      };
    },
    ...overrides,
  };
  const controller = createPartyController(
    service,
    async (request): Promise<HealthRead> => {
      calls.reads.push(request);
      return {
        status: 'read',
        source: 'apple-health',
        at: new Date().toISOString(),
        days: [{ date: week.start, steps: 50 }],
      };
    },
    { inputs, active: true },
  );
  const settle = async (): Promise<void> => {
    for (let index = 0; index < 30; index += 1) {
      controller.reconcile();
      await Promise.resolve();
    }
  };
  return { controller, calls, settle, signOut: () => signedOut?.() };
}

test('mounting loads the board and shares steps once, without a share and refresh loop', async () => {
  const h = harness();
  assert.equal(h.controller.getSnapshot().state.status, 'loading');
  h.controller.start();
  await h.settle();
  const { state, sharing, operation } = h.controller.getSnapshot();
  assert.equal(state.status, 'ready');
  assert.deepEqual(state.rows, [member]);
  assert.equal(sharing.status, 'shared');
  assert.equal(operation, null);
  assert.equal(h.calls.submit, 1);
  assert.equal(h.calls.reads[0]?.requestPermission, false);
  await h.settle();
  assert.equal(h.calls.submit, 1);
  h.controller.dispose();
});

test('a failed departure keeps its operation, and the next request clears it', async () => {
  const h = harness({ depart: async () => ({ ok: false, error: 'network' }) });
  h.controller.start();
  await h.settle();
  assert.equal(await h.controller.leave(), false);
  assert.deepEqual(h.controller.getSnapshot().failure, { operation: 'leave', error: 'network' });
  assert.equal(h.controller.getSnapshot().state.identity.home.party?.id, identity.home.party?.id);
  const refreshing = h.controller.refresh();
  assert.equal(h.controller.getSnapshot().failure, null);
  assert.equal(await refreshing, true);
  h.controller.dispose();
});

test('cancelling a read aborts it, and its late result is ignored', async () => {
  let release: (value: PartyResult<PartyIdentity>) => void = () => {};
  const seen: { signal: AbortSignal | null } = { signal: null };
  const h = harness({
    home: (signal) => {
      seen.signal = signal;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  h.controller.start();
  await h.settle();
  const id = h.controller.getSnapshot().readRequestId;
  assert.notEqual(id, null);
  assert.equal(h.controller.cancelRead(id ?? -1), true);
  assert.equal(seen.signal?.aborted, true);
  assert.equal(h.controller.getSnapshot().state.status, 'idle');
  release({ ok: true, value: identity });
  await h.settle();
  assert.equal(h.controller.getSnapshot().state.identity.userId, null);
  // A write is never cancellable as a read.
  assert.equal(h.controller.cancelRead(id ?? -1), false);
  h.controller.dispose();
});

test('pausing Health stops sharing, and signing out clears the board', async () => {
  const h = harness();
  h.controller.start();
  await h.settle();
  h.controller.healthPaused();
  assert.equal(h.controller.getSnapshot().sharing.status, 'paused');
  h.signOut();
  const { state, operation, failure } = h.controller.getSnapshot();
  assert.deepEqual([state.identity.userId, state.rows.length, operation, failure], [null, 0, null, null]);
  h.controller.dispose();
});

test('backgrounding stops sharing; returning refreshes and shares again', async () => {
  const h = harness();
  h.controller.start();
  await h.settle();
  h.controller.appStateChanged('background');
  await h.settle();
  const shared = h.calls.submit;
  const homes = h.calls.home;
  h.controller.appStateChanged('active');
  await h.settle();
  assert.ok(h.calls.home > homes);
  assert.equal(h.calls.submit, shared + 1);
  h.controller.dispose();
});
