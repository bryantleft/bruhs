// The party as a plain controller: the board, the one request in flight, its failure, and step
// sharing. PartyProvider publishes it to React and forwards app, Health and game changes.
//
// Timing follows the provider it replaced. `setWeek`, `setActive` and a sharing request are
// pending until `reconcile`, which the host calls after each render; reconcile commits them and
// then runs the week and sharing reactions in that order. Requests read the committed week.
import type { HealthConnection } from '../game/game.ts';
import type { HealthReader } from '../health/model.ts';
import type { PartyEntry, PartyIdentity, PartyService } from './client.ts';
import { type PartyError, type PartyMember, type RaceWeek, raceWeek } from './model.ts';
import { createStepSharing, type SharingState, type StepSharing } from './sharing.ts';

export type PartyState = Readonly<{
  status: 'idle' | 'loading' | 'ready';
  identity: PartyIdentity;
  rows: readonly PartyMember[];
  total: number;
  offset: number;
  week: string;
}>;
export type Operation = 'refresh' | 'session' | 'enter' | 'leave' | 'delete' | 'more' | null;
type PartyWork = Readonly<{
  kind: Exclude<Operation, null>;
  version: number;
  controller: AbortController;
}>;
export type PartyFailure = Readonly<{ operation: Exclude<Operation, null>; error: PartyError }>;

// What the game says about sharing: consent, the save's lifecycle and the demo flag.
export type PartyInputs = Readonly<{
  health: HealthConnection | undefined;
  demo: boolean;
  ready: boolean;
  resetting: boolean;
}>;

export type PartySnapshot = Readonly<{
  state: PartyState;
  operation: Operation;
  readRequestId: number | null;
  failure: PartyFailure | null;
  sharing: SharingState;
  week: RaceWeek;
}>;

export type PartyController = Readonly<{
  getSnapshot: () => PartySnapshot;
  subscribe: (listener: () => void) => () => void;
  // Mount and unmount: the first refresh and the sign-out subscription, then full cleanup.
  start: () => void;
  dispose: () => void;
  setInputs: (inputs: PartyInputs) => void;
  // Commits pending changes and runs the week and sharing reactions; call after each render.
  reconcile: () => void;
  appStateChanged: (state: string) => void;
  healthPaused: () => void;
  refresh: () => Promise<boolean>;
  enter: (entry: PartyEntry) => Promise<boolean>;
  leave: () => Promise<boolean>;
  deleteProfile: () => Promise<boolean>;
  loadMore: () => Promise<boolean>;
  cancelRead: (requestId: number) => boolean;
}>;

const EMPTY: PartyIdentity = { userId: null, home: { profile: null, party: null } };

export function createPartyController(
  service: PartyService | null,
  readHealth: HealthReader,
  initial: Readonly<{ inputs: PartyInputs; active: boolean }>,
): PartyController {
  const listeners = new Set<() => void>();
  let inputs = initial.inputs;
  // Committed values (what the last reconcile saw) and pending ones (set since).
  let week = raceWeek();
  let pendingWeek = week;
  let active = initial.active;
  let pendingActive = active;
  let syncRequest = 0;
  let pendingSyncRequest = 0;
  let state: PartyState = {
    status: service ? 'loading' : 'ready',
    identity: EMPTY,
    rows: [],
    total: 0,
    offset: 0,
    week: week.start,
  };
  let work: PartyWork | null = null;
  let failure: PartyFailure | null = null;
  // `sharing` is shown; `shared` is the last state sharing itself published.
  let sharing: SharingState = { status: inputs.demo ? 'preview' : 'paused' };
  let shared: SharingState = sharing;
  let pendingRefresh = false;
  let pendingSharing = false;
  let version = 0;
  let alive = true;
  let request: PartyWork | null = null;
  let unsubscribe: (() => void) | undefined;
  let weekTimer: ReturnType<typeof setTimeout> | null = null;
  // The step sharing for the current member and party, rebuilt when either changes.
  let sharingKey: string | null = null;
  let stepSharing: StepSharing = createSharing(null, null);
  // What the week and sharing reactions last ran with.
  let ranWeek: Readonly<{ start: string; next: number }> | null = null;
  let ranSync: readonly unknown[] | null = null;
  let ranSharing: StepSharing | null = null;

  let snapshot: PartySnapshot = makeSnapshot();
  function makeSnapshot(): PartySnapshot {
    return {
      state,
      operation: work?.kind ?? null,
      readRequestId: work && (work.kind === 'refresh' || work.kind === 'more') ? work.version : null,
      failure,
      sharing,
      week,
    };
  }
  function changed(): void {
    snapshot = makeSnapshot();
    for (const listener of listeners) listener();
  }
  function setState(next: PartyState | ((previous: PartyState) => PartyState)): void {
    state = typeof next === 'function' ? next(state) : next;
    changed();
  }
  function setWork(next: PartyWork | null): void {
    work = next;
    changed();
  }
  function setFailure(next: PartyFailure | null): void {
    failure = next;
    changed();
  }
  function setSharing(next: SharingState): void {
    sharing = next;
    changed();
  }
  function setWeek(next: RaceWeek): void {
    pendingWeek = next;
    changed();
  }

  function createSharing(userId: string | null, partyId: string | undefined | null): StepSharing {
    return createStepSharing(
      readHealth,
      async (days, signal) => {
        if (!service || !userId || !partyId) return { ok: false, error: 'session' };
        return service.submit(userId, days, signal);
      },
      (next) => {
        shared = next;
        setSharing(next);
      },
    );
  }

  const current = (v: number): boolean => alive && v === version;

  const begin = (
    kind: Exclude<Operation, null>,
  ): Readonly<{ version: number; signal: AbortSignal }> | null => {
    if (!service || request || !alive) return null;
    stepSharing.cancel();
    if (sharing.status === 'syncing') setSharing({ status: 'idle' });
    const controller = new AbortController();
    const next = { kind, version: ++version, controller };
    request = next;
    setWork(next);
    setFailure(null);
    return { version: next.version, signal: controller.signal };
  };

  const requestSharing = (): void => {
    if (pendingSharing) return;
    pendingSharing = true;
    if (!request) {
      pendingSyncRequest += 1;
      changed();
    }
  };

  const finish = (v: number): void => {
    if (!current(v)) return;
    request = null;
    setWork(null);
    if (pendingRefresh) {
      pendingRefresh = false;
      void Promise.resolve().then(() => refresh());
      return;
    }
    if (pendingSharing) {
      pendingSyncRequest += 1;
      changed();
    }
  };

  function cancelRead(requestId: number): boolean {
    const reading = request;
    if (
      !alive ||
      !reading ||
      reading.version !== requestId ||
      (reading.kind !== 'refresh' && reading.kind !== 'more')
    )
      return false;
    version += 1;
    request = null;
    pendingRefresh = false;
    pendingSharing = false;
    reading.controller.abort();
    setWork(null);
    const currentWeek = raceWeek();
    if (pendingWeek.start !== currentWeek.start) setWeek(currentWeek);
    setState((previous) => {
      const next: PartyState = previous.status === 'loading' ? { ...previous, status: 'idle' } : previous;
      return next.week === currentWeek.start
        ? next
        : { ...next, rows: [], total: 0, offset: 0, week: currentWeek.start };
    });
    return true;
  }

  async function refresh(): Promise<boolean> {
    if (!service) return false;
    const started = begin('refresh');
    if (!started) {
      pendingRefresh = true;
      return false;
    }
    const target = week;
    setState((previous) => {
      const next: PartyState = previous.status === 'idle' ? { ...previous, status: 'loading' } : previous;
      return next.week === target.start
        ? next
        : { ...next, rows: [], total: 0, offset: 0, week: target.start };
    });
    try {
      const home = await service.home(started.signal, () => {
        const reading = request;
        if (!current(started.version) || reading?.kind !== 'refresh') return false;
        const resetting: PartyWork = { ...reading, kind: 'session' };
        request = resetting;
        setWork(resetting);
        return true;
      });
      if (!current(started.version)) return false;
      if (!home.ok) {
        setFailure({ operation: 'refresh', error: home.error });
        setState((previous) => ({ ...previous, status: 'ready' }));
        return false;
      }
      if (!home.value.home.party) {
        setState({
          status: 'ready',
          identity: home.value,
          rows: [],
          total: 0,
          offset: 0,
          week: target.start,
        });
        return true;
      }
      const board = await service.board(target, 0, started.signal);
      if (!current(started.version)) return false;
      if (!board.ok) {
        setFailure({ operation: 'refresh', error: board.error });
        setState((previous) => {
          const sameBoard =
            previous.identity.home.party?.id === home.value.home.party?.id && previous.week === target.start;
          return {
            status: 'ready',
            identity: home.value,
            rows: sameBoard ? previous.rows : [],
            total: sameBoard ? previous.total : 0,
            offset: sameBoard ? previous.offset : 0,
            week: target.start,
          };
        });
        return false;
      }
      setState({
        status: 'ready',
        identity: home.value,
        rows: board.value.rows,
        total: board.value.total,
        offset: board.value.rows.length,
        week: target.start,
      });
      return true;
    } finally {
      finish(started.version);
    }
  }

  async function sync(): Promise<void> {
    const userId = state.identity.userId;
    const partyId = state.identity.home.party?.id;
    if (!service || !partyId || !userId || !active || !inputs.ready || inputs.resetting) {
      pendingSharing = false;
      return;
    }
    if (request) {
      pendingSharing = true;
      return;
    }
    pendingSharing = false;
    const before = version;
    await stepSharing.run({ week, connection: inputs.health, demo: inputs.demo });
    if (!current(before) || state.identity.home.party?.id !== partyId || shared.status !== 'shared') return;
    await refresh();
  }

  async function enter(entry: PartyEntry): Promise<boolean> {
    if (!service) return false;
    const started = begin('enter');
    if (!started) return false;
    const target = week;
    let committed = false;
    try {
      const result = await service.enter(entry, started.signal);
      if (!current(started.version)) return false;
      if (!result.ok) {
        setFailure({ operation: 'enter', error: result.error });
        return false;
      }
      // A successful write must settle independently of its follow-up board read.
      setState({
        status: 'ready',
        identity: result.value,
        rows: [],
        total: result.value.home.party?.members ?? 0,
        offset: 0,
        week: target.start,
      });
      committed = true;
      return true;
    } finally {
      if (current(started.version)) {
        if (committed) pendingRefresh = true;
        requestSharing();
      }
      finish(started.version);
    }
  }

  async function depart(removeAccount: boolean): Promise<boolean> {
    if (!service) return false;
    const started = begin(removeAccount ? 'delete' : 'leave');
    if (!started) return false;
    const target = week;
    try {
      const result = await service.depart(removeAccount, started.signal);
      if (!current(started.version)) return removeAccount && result.ok;
      if (!result.ok) {
        setFailure({ operation: removeAccount ? 'delete' : 'leave', error: result.error });
        return false;
      }
      setState((previous) => ({
        status: 'ready',
        identity: removeAccount
          ? EMPTY
          : { ...previous.identity, home: { ...previous.identity.home, party: null } },
        rows: [],
        total: 0,
        offset: 0,
        week: target.start,
      }));
      return true;
    } finally {
      finish(started.version);
    }
  }

  async function loadMore(): Promise<boolean> {
    const from = state;
    if (!service || from.week !== week.start || from.offset >= from.total || !from.identity.home.party?.id)
      return false;
    const target = week;
    const started = begin('more');
    if (!started) return false;
    try {
      const page = await service.board(target, from.offset, started.signal);
      if (!current(started.version)) return false;
      if (!page.ok) {
        setFailure({ operation: 'more', error: page.error });
        return false;
      }
      setState((previous) => {
        const seen = new Set(previous.rows.map((row) => row.id));
        return {
          ...previous,
          rows: [...previous.rows, ...page.value.rows.filter((row) => !seen.has(row.id))],
          offset: previous.offset + page.value.rows.length,
          total: page.value.total,
        };
      });
      return true;
    } finally {
      finish(started.version);
    }
  }

  function reconcile(): void {
    week = pendingWeek;
    active = pendingActive;
    syncRequest = pendingSyncRequest;
    const userId = state.identity.userId;
    const partyId = state.identity.home.party?.id;
    const key = `${userId ?? ''}\u0000${partyId ?? ''}`;
    if (key !== sharingKey) {
      sharingKey = key;
      stepSharing = createSharing(userId, partyId);
    }
    const syncDeps = [
      stepSharing,
      active,
      inputs.ready,
      inputs.resetting,
      inputs.health?.enabled,
      inputs.health?.source,
      inputs.health?.syncedAt,
      syncRequest,
    ];
    const weekChanged = !ranWeek || ranWeek.start !== week.start || ranWeek.next !== week.next;
    const syncChanged = !ranSync || syncDeps.some((value, index) => !Object.is(value, ranSync?.[index]));
    // Cleanups first, then the reactions in order, as effects run after a render.
    if (weekChanged && weekTimer !== null) clearTimeout(weekTimer);
    if (syncChanged) ranSharing?.cancel();
    if (weekChanged) {
      ranWeek = { start: week.start, next: week.next };
      weekTimer = setTimeout(() => setWeek(raceWeek()), Math.max(0, week.next - Date.now()));
      if (state.week !== week.start) {
        requestSharing();
        void refresh();
      }
    }
    if (syncChanged) {
      ranSync = syncDeps;
      ranSharing = stepSharing;
      void sync();
    }
    if (snapshot.week !== week) changed();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      alive = true;
      void refresh();
      unsubscribe = service?.onSignedOut(() => {
        version += 1;
        pendingRefresh = false;
        pendingSharing = false;
        request?.controller.abort();
        request = null;
        stepSharing.cancel();
        setWork(null);
        setFailure(null);
        setState({ status: 'ready', identity: EMPTY, rows: [], total: 0, offset: 0, week: raceWeek().start });
      });
    },
    dispose() {
      alive = false;
      version += 1;
      request?.controller.abort();
      request = null;
      pendingRefresh = false;
      pendingSharing = false;
      stepSharing.cancel();
      ranSharing?.cancel();
      unsubscribe?.();
      unsubscribe = undefined;
      if (weekTimer !== null) clearTimeout(weekTimer);
      weekTimer = null;
      ranWeek = null;
      ranSync = null;
    },
    setInputs(next) {
      inputs = next;
    },
    reconcile,
    appStateChanged(next) {
      const foreground = next === 'active';
      pendingActive = foreground;
      changed();
      if (!foreground) {
        pendingSharing = false;
        stepSharing.cancel();
      } else {
        setWeek(raceWeek());
        requestSharing();
        void refresh();
      }
    },
    healthPaused() {
      pendingSharing = false;
      stepSharing.cancel();
      shared = { status: 'paused' };
      setSharing({ status: 'paused' });
    },
    async refresh() {
      const success = await refresh();
      if (success) requestSharing();
      return success;
    },
    enter,
    leave: () => depart(false),
    deleteProfile: () => depart(true),
    loadMore,
    cancelRead,
  };
}
