import type { HealthConnection, HealthDay } from '../game/game.ts';
import type { HealthReader } from '../health/model.ts';
import type { PartyResult, RaceWeek } from './model.ts';

// Why sharing failed: only `submit` and `unknown` can succeed on a plain retry.
export type SharingFailure =
  | 'unavailable'
  | 'update-required'
  | 'source-changed'
  | 'invalid-total'
  | 'submit'
  | 'unknown';
export type SharingState =
  | Readonly<{ status: 'idle' | 'syncing' | 'shared' | 'preview' | 'paused' | 'no-data' | 'permission' }>
  | Readonly<{ status: 'error'; reason: SharingFailure }>;

export function sharingErrorCopy(reason: SharingFailure): string {
  switch (reason) {
    case 'unavailable':
      return 'this device can’t read Health steps, so there are none to share.';
    case 'update-required':
      return 'Health Connect needs an update. update it, then tap refresh.';
    case 'source-changed':
      return 'your step source changed. reconnect step sync, then tap refresh.';
    case 'invalid-total':
      return 'your Health app sent a step total that can’t be shared. check Steps there, then tap refresh.';
    case 'submit':
      return 'couldn’t send your steps. tap refresh to try again.';
    case 'unknown':
      return 'step sharing failed. tap refresh to try again.';
  }
}
export type SharingRequest = Readonly<{
  week: RaceWeek;
  connection: HealthConnection | undefined;
  demo: boolean;
}>;
export type StepSharing = Readonly<{ run: (request: SharingRequest) => Promise<void>; cancel: () => void }>;

export function createStepSharing(
  read: HealthReader,
  submit: (days: readonly HealthDay[], signal: AbortSignal) => Promise<PartyResult<true>>,
  publish: (state: SharingState) => void,
  warn: (message: string, error: unknown) => void = (message, error) => console.warn(message, error),
): StepSharing {
  let generation = 0;
  let pending: Promise<void> | null = null;
  let abort: AbortController | null = null;
  return {
    run(request) {
      if (request.demo || !request.connection?.enabled) {
        publish({ status: request.demo ? 'preview' : 'paused' });
        return Promise.resolve();
      }
      if (pending) return pending;
      const current = generation;
      const controller = new AbortController();
      abort = controller;
      const connection = request.connection;
      publish({ status: 'syncing' });
      const work = (async () => {
        try {
          await Promise.resolve();
          if (generation !== current) return;
          const result = await read({
            connection: {
              ...connection,
              startedOn: request.week.start,
              syncedAt: new Date(`${request.week.start}T00:00:00`).toISOString(),
            },
            requestPermission: false,
          });
          if (generation !== current) return;
          if (result.status === 'permission-required') {
            publish({ status: 'permission' });
            return;
          }
          if (result.status === 'unavailable') {
            publish({
              status: 'error',
              reason: result.reason === 'update-required' ? 'update-required' : 'unavailable',
            });
            return;
          }
          if (result.source !== connection.source) {
            publish({ status: 'error', reason: 'source-changed' });
            return;
          }
          const days = result.days.filter(
            (day) => day.date >= request.week.start && day.date <= request.week.end,
          );
          if (!days.length) {
            publish({ status: 'no-data' });
            return;
          }
          const dates = new Set<string>();
          for (const day of days) {
            if (
              dates.has(day.date) ||
              !Number.isSafeInteger(day.steps) ||
              day.steps < 0 ||
              day.steps > 2147483647
            ) {
              publish({ status: 'error', reason: 'invalid-total' });
              return;
            }
            dates.add(day.date);
          }
          const submitted = await submit(days, controller.signal);
          if (generation !== current) return;
          publish(submitted.ok ? { status: 'shared' } : { status: 'error', reason: 'submit' });
        } catch (error: unknown) {
          if (generation !== current) return;
          warn('Step sharing failed:', error);
          publish({ status: 'error', reason: 'unknown' });
        } finally {
          if (generation === current) {
            pending = null;
            abort = null;
          }
        }
      })();
      pending = work;
      return work;
    },
    cancel() {
      generation += 1;
      abort?.abort();
      abort = null;
      pending = null;
    },
  };
}
