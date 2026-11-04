import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { useGame } from '../game/GameProvider';
import { readHealthSteps } from '../health/native';
import type { PartyEntry, PartyIdentity, PartyService } from './client';
import { type PartyError, type PartyMember, raceWeek } from './model';
import { createStepSharing, type SharingState } from './sharing';

type PartyState = Readonly<{
  status: 'idle' | 'loading' | 'ready';
  identity: PartyIdentity;
  rows: readonly PartyMember[];
  total: number;
  offset: number;
  week: string;
}>;
type Operation = 'refresh' | 'session' | 'enter' | 'leave' | 'delete' | 'more' | null;
type PartyWork = Readonly<{
  kind: Exclude<Operation, null>;
  version: number;
  controller: AbortController;
}>;
type PartyFailure = Readonly<{ operation: Exclude<Operation, null>; error: PartyError }>;
type PartyContextValue = Readonly<{
  available: boolean;
  hasSession: boolean;
  state: PartyState;
  operation: Operation;
  readRequestId: number | null;
  cancelRead: (requestId: number) => boolean;
  error: PartyError | null;
  errorOperation: Operation;
  sharing: SharingState;
  week: ReturnType<typeof raceWeek>;
  refresh: () => Promise<boolean>;
  enter: (entry: PartyEntry) => Promise<boolean>;
  leave: () => Promise<boolean>;
  deleteProfile: () => Promise<boolean>;
  loadMore: () => Promise<boolean>;
}>;

const EMPTY: PartyIdentity = { userId: null, home: { profile: null, party: null } };
const PartyContext = createContext<PartyContextValue | null>(null);

export function PartyProvider({
  children,
  service,
  hasSession,
}: PropsWithChildren<{ service: PartyService | null; hasSession: boolean }>): React.JSX.Element {
  const { game, demo, loading, resetting, subscribeHealthPause } = useGame();
  const [week, setWeek] = useState(raceWeek);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [state, setState] = useState<PartyState>({
    status: service ? 'loading' : 'ready',
    identity: EMPTY,
    rows: [],
    total: 0,
    offset: 0,
    week: week.start,
  });
  const [work, setWork] = useState<PartyWork | null>(null);
  const operation = work?.kind ?? null;
  const [failure, setFailure] = useState<PartyFailure | null>(null);
  const [sharing, setSharing] = useState<SharingState>({ status: demo ? 'preview' : 'paused' });
  const sharedState = useRef(sharing);
  const [syncRequest, setSyncRequest] = useState(0);
  const latest = useRef(state);
  latest.current = state;
  const pendingRefresh = useRef(false);
  const pendingSharing = useRef(false);
  const version = useRef(0);
  const alive = useRef(true);
  const request = useRef<PartyWork | null>(null);
  const userId = state.identity.userId;
  const partyId = state.identity.home.party?.id;
  const stepSharing = useMemo(
    () =>
      createStepSharing(
        readHealthSteps,
        async (days, signal) => {
          if (!service || !userId || !partyId) return { ok: false, error: 'session' };
          return service.submit(userId, days, signal);
        },
        (next) => {
          sharedState.current = next;
          setSharing(next);
        },
      ),
    [service, userId, partyId],
  );
  const sharingRef = useRef(stepSharing);
  sharingRef.current = stepSharing;
  useEffect(
    () =>
      subscribeHealthPause(() => {
        pendingSharing.current = false;
        sharingRef.current.cancel();
        sharedState.current = { status: 'paused' };
        setSharing({ status: 'paused' });
      }),
    [subscribeHealthPause],
  );

  const begin = (
    kind: Exclude<Operation, null>,
  ): Readonly<{ version: number; signal: AbortSignal }> | null => {
    if (!service || request.current || !alive.current) return null;
    sharingRef.current.cancel();
    setSharing((current) => (current.status === 'syncing' ? { status: 'idle' } : current));
    const controller = new AbortController();
    const next = { kind, version: ++version.current, controller };
    request.current = next;
    setWork(next);
    setFailure(null);
    return { version: next.version, signal: controller.signal };
  };
  const current = (v: number): boolean => alive.current && v === version.current;
  const requestSharing = useCallback((): void => {
    if (pendingSharing.current) return;
    pendingSharing.current = true;
    if (!request.current) setSyncRequest((value) => value + 1);
  }, []);
  const finish = (v: number): void => {
    if (!current(v)) return;
    request.current = null;
    setWork(null);
    if (pendingRefresh.current) {
      pendingRefresh.current = false;
      void Promise.resolve().then(() => refreshRef.current());
      return;
    }
    if (pendingSharing.current) setSyncRequest((value) => value + 1);
  };

  function cancelRead(requestId: number): boolean {
    const reading = request.current;
    if (
      !alive.current ||
      !reading ||
      reading.version !== requestId ||
      (reading.kind !== 'refresh' && reading.kind !== 'more')
    )
      return false;
    version.current += 1;
    request.current = null;
    pendingRefresh.current = false;
    pendingSharing.current = false;
    reading.controller.abort();
    setWork(null);
    const currentWeek = raceWeek();
    setWeek((previous) => (previous.start === currentWeek.start ? previous : currentWeek));
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
    const work = begin('refresh');
    if (!work) {
      pendingRefresh.current = true;
      return false;
    }
    setState((previous) => {
      const next: PartyState = previous.status === 'idle' ? { ...previous, status: 'loading' } : previous;
      return next.week === week.start ? next : { ...next, rows: [], total: 0, offset: 0, week: week.start };
    });
    try {
      const home = await service.home(work.signal, () => {
        const reading = request.current;
        if (!current(work.version) || reading?.kind !== 'refresh') return false;
        const resetting: PartyWork = { ...reading, kind: 'session' };
        request.current = resetting;
        setWork(resetting);
        return true;
      });
      if (!current(work.version)) return false;
      if (!home.ok) {
        setFailure({ operation: 'refresh', error: home.error });
        setState((previous) => ({ ...previous, status: 'ready' }));
        return false;
      }
      if (!home.value.home.party) {
        setState({ status: 'ready', identity: home.value, rows: [], total: 0, offset: 0, week: week.start });
        return true;
      }
      const board = await service.board(week, 0, work.signal);
      if (!current(work.version)) return false;
      if (!board.ok) {
        setFailure({ operation: 'refresh', error: board.error });
        setState((previous) => {
          const sameBoard =
            previous.identity.home.party?.id === home.value.home.party?.id && previous.week === week.start;
          return {
            status: 'ready',
            identity: home.value,
            rows: sameBoard ? previous.rows : [],
            total: sameBoard ? previous.total : 0,
            offset: sameBoard ? previous.offset : 0,
            week: week.start,
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
        week: week.start,
      });
      return true;
    } finally {
      finish(work.version);
    }
  }

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const sync = useRef<() => Promise<void>>(async () => {});
  sync.current = async () => {
    if (!service || !partyId || !userId || !active || loading.status !== 'ready' || resetting) {
      pendingSharing.current = false;
      return;
    }
    if (request.current) {
      pendingSharing.current = true;
      return;
    }
    pendingSharing.current = false;
    const before = version.current;
    await stepSharing.run({ week, connection: game.health, demo });
    if (
      !current(before) ||
      latest.current.identity.home.party?.id !== partyId ||
      sharedState.current.status !== 'shared'
    )
      return;
    await refreshRef.current();
  };

  useEffect(() => {
    alive.current = true;
    void refreshRef.current();
    const unsubscribe = service?.onSignedOut(() => {
      version.current += 1;
      pendingRefresh.current = false;
      pendingSharing.current = false;
      request.current?.controller.abort();
      request.current = null;
      sharingRef.current.cancel();
      setWork(null);
      setFailure(null);
      setState({ status: 'ready', identity: EMPTY, rows: [], total: 0, offset: 0, week: raceWeek().start });
    });
    return () => {
      alive.current = false;
      version.current += 1;
      request.current?.controller.abort();
      request.current = null;
      pendingRefresh.current = false;
      pendingSharing.current = false;
      sharingRef.current.cancel();
      unsubscribe?.();
    };
  }, [service]);

  useEffect(() => {
    const change = (next: string): void => {
      const foreground = next === 'active';
      setActive(foreground);
      if (!foreground) {
        pendingSharing.current = false;
        sharingRef.current.cancel();
      } else {
        setWeek(raceWeek());
        requestSharing();
        void refreshRef.current();
      }
    };
    const subscription = AppState.addEventListener('change', change);
    return () => subscription.remove();
  }, [requestSharing]);

  useEffect(() => {
    const timer = setTimeout(() => setWeek(raceWeek()), Math.max(0, week.next - Date.now()));
    if (latest.current.week !== week.start) {
      requestSharing();
      void refreshRef.current();
    }
    return () => clearTimeout(timer);
  }, [week.start, week.next, requestSharing]);

  // Week rollover requests sharing explicitly. A canceled read can update the
  // displayed week without starting another Health read or board refresh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: these fields trigger sync; its ref reads current consent, week and lifecycle without retriggering after board refreshes.
  useEffect(() => {
    void sync.current();
    return () => stepSharing.cancel();
  }, [
    stepSharing,
    active,
    loading.status,
    resetting,
    game.health?.enabled,
    game.health?.source,
    game.health?.syncedAt,
    syncRequest,
  ]);

  async function enter(entry: PartyEntry): Promise<boolean> {
    if (!service) return false;
    const work = begin('enter');
    if (!work) return false;
    let committed = false;
    try {
      const result = await service.enter(entry, work.signal);
      if (!current(work.version)) return false;
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
        week: week.start,
      });
      committed = true;
      return true;
    } finally {
      if (current(work.version)) {
        if (committed) pendingRefresh.current = true;
        requestSharing();
      }
      finish(work.version);
    }
  }

  async function depart(removeAccount: boolean): Promise<boolean> {
    if (!service) return false;
    const work = begin(removeAccount ? 'delete' : 'leave');
    if (!work) return false;
    try {
      const result = await service.depart(removeAccount, work.signal);
      if (!current(work.version)) return removeAccount && result.ok;
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
        week: week.start,
      }));
      return true;
    } finally {
      finish(work.version);
    }
  }

  async function loadMore(): Promise<boolean> {
    if (!service || state.week !== week.start || state.offset >= state.total || !partyId) return false;
    const work = begin('more');
    if (!work) return false;
    try {
      const page = await service.board(week, state.offset, work.signal);
      if (!current(work.version)) return false;
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
      finish(work.version);
    }
  }

  return (
    <PartyContext.Provider
      value={{
        available: service !== null,
        hasSession,
        state,
        operation,
        readRequestId: work && (work.kind === 'refresh' || work.kind === 'more') ? work.version : null,
        cancelRead,
        error: failure?.error ?? null,
        errorOperation: failure?.operation ?? null,
        sharing,
        week,
        refresh: async () => {
          const success = await refresh();
          if (success) requestSharing();
          return success;
        },
        enter,
        leave: () => depart(false),
        deleteProfile: () => depart(true),
        loadMore,
      }}
    >
      {children}
    </PartyContext.Provider>
  );
}

export function useParty(): PartyContextValue {
  const context = useContext(PartyContext);
  if (!context) throw new Error('useParty requires PartyProvider.');
  return context;
}
