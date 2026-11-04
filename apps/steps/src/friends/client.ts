import { api } from 'bruhs-api/api';
import type { ConvexReactClient } from 'convex/react';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import { ConvexError } from 'convex/values';
import type { HealthDay, SkinId } from '../game/game';
import {
  decodeBoard,
  decodeHome,
  type PartyError,
  type PartyHome,
  type PartyMember,
  type PartyResult,
  type RaceWeek,
} from './model';
import { PartyAuthError, type PartySession } from './session';
import type { StepUpload } from './upload';

export type PartyPage = Readonly<{ rows: readonly PartyMember[]; total: number }>;
export type PartyIdentity = Readonly<{ userId: string | null; home: PartyHome }>;
export type PartyEntry = Readonly<{ name: string; skin: SkinId }> &
  (Readonly<{ kind: 'create' | 'profile' }> | Readonly<{ kind: 'join'; invite: string }>);
export type PartyService = Readonly<{
  home: (signal: AbortSignal, beginSessionReset: () => boolean) => Promise<PartyResult<PartyIdentity>>;
  enter: (entry: PartyEntry, signal: AbortSignal) => Promise<PartyResult<PartyIdentity>>;
  board: (week: RaceWeek, offset: number, signal: AbortSignal) => Promise<PartyResult<PartyPage>>;
  submit: (userId: string, days: readonly HealthDay[], signal: AbortSignal) => Promise<PartyResult<true>>;
  depart: (removeAccount: boolean, signal: AbortSignal) => Promise<PartyResult<true>>;
  onSignedOut: (callback: () => void) => () => void;
}>;
export const PARTY_PAGE_SIZE = 20;
type Client = Pick<ConvexReactClient, 'watchQuery' | 'mutation'>;
const EMPTY: PartyIdentity = { userId: null, home: { profile: null, party: null } };

function failure(error: unknown): PartyError {
  if (error instanceof PartyAuthError) return 'session';
  if (error instanceof ConvexError) {
    if (error.data === 'invite_not_found') return 'invite';
    if (error.data === 'already_in_party') return 'membership';
    if (error.data === 'sign_in_required' || error.data === 'not_in_party') return 'session';
    if (typeof error.data === 'string' && error.data.startsWith('invalid_')) return 'data';
  }
  return 'network';
}

// Unsubscribe canceled reads rather than leaving a one-shot query waiting for
// reconnection. Mutations are never described as canceled after submission.
export function readPartyQuery<Q extends FunctionReference<'query'>>(
  client: Client,
  reference: Q,
  args: FunctionArgs<Q>,
  signal: AbortSignal,
): Promise<FunctionReturnType<Q>> {
  return new Promise((resolve, reject) => {
    let stop = (): void => {};
    let settled = false;
    const finish = (run: () => void): void => {
      if (settled) return;
      settled = true;
      stop();
      signal.removeEventListener('abort', abort);
      run();
    };
    const abort = (): void => finish(() => reject(new Error('Party read canceled.')));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    try {
      const watch = client.watchQuery(reference, args);
      const check = (): void => {
        try {
          const value = watch.localQueryResult();
          if (value !== undefined) finish(() => resolve(value));
        } catch (error) {
          finish(() => reject(error));
        }
      };
      stop = watch.onUpdate(check);
      if (settled) stop();
      else check();
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

function identity(value: FunctionReturnType<typeof api.outside.home>): PartyResult<PartyIdentity> {
  const home = decodeHome(value.home);
  return home &&
    typeof value.userId === 'string' &&
    value.userId.length > 0 &&
    (!home.profile || home.profile.id === value.userId)
    ? { ok: true, value: { userId: value.userId, home } }
    : { ok: false, error: 'data' };
}

export function createPartyService(client: Client, session: PartySession, upload: StepUpload): PartyService {
  return {
    async home(signal, beginSessionReset) {
      try {
        if (!(await session.ready(signal))) return { ok: true, value: EMPTY };
        const result = await readPartyQuery(client, api.outside.home, {}, signal);
        return identity(result);
      } catch (error) {
        const reason = failure(error);
        if (reason === 'session' && error instanceof ConvexError && !signal.aborted && beginSessionReset()) {
          try {
            await session.signOut();
          } catch {
            return { ok: false, error: 'session' };
          }
        }
        return { ok: false, error: reason };
      }
    },
    async enter(entry, signal) {
      try {
        const signedIn = await session.ready(signal);
        if (!signedIn && entry.kind === 'profile') return { ok: false, error: 'session' };
        if (!signedIn) await session.signIn(signal);
        if (signal.aborted) return { ok: false, error: 'network' };
        return identity(await client.mutation(api.outside.enter, { ...entry, name: entry.name.trim() }));
      } catch (error) {
        return { ok: false, error: failure(error) };
      }
    },
    async board(week, offset, signal) {
      try {
        if (!(await session.ready(signal))) return { ok: false, error: 'session' };
        const page = await readPartyQuery(
          client,
          api.outside.board,
          { start: week.start, end: week.end, offset },
          signal,
        );
        const rows = decodeBoard(page.rows);
        return rows && Number.isSafeInteger(page.total) && page.total >= rows.length
          ? { ok: true, value: { rows, total: page.total } }
          : { ok: false, error: 'data' };
      } catch (error) {
        return { ok: false, error: failure(error) };
      }
    },
    async submit(userId, days, signal) {
      try {
        if (!(await session.ready(signal)) || signal.aborted) return { ok: false, error: 'session' };
        const result = await upload(userId, days, signal);
        return result === true ? { ok: true, value: true } : { ok: false, error: 'data' };
      } catch (error) {
        return { ok: false, error: failure(error) };
      }
    },
    async depart(removeAccount, signal) {
      try {
        if (!(await session.ready(signal)) || signal.aborted) return { ok: false, error: 'session' };
        const result = await client.mutation(api.outside.depart, { removeAccount });
        if (result !== true) return { ok: false, error: 'data' };
        if (removeAccount) await session.signOut();
        return { ok: true, value: true };
      } catch (error) {
        return { ok: false, error: failure(error) };
      }
    },
    onSignedOut: session.onSignedOut,
  };
}
