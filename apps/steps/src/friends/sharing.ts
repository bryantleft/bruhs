import type { HealthConnection, HealthDay } from '../game/game.ts';
import type { HealthReader } from '../health/model.ts';
import type { PartyResult, RaceWeek } from './model.ts';

export type SharingState = Readonly<{
  status: 'idle' | 'syncing' | 'shared' | 'preview' | 'paused' | 'no-data' | 'permission' | 'error';
}>;
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
          if (result.status !== 'read') {
            publish({ status: result.status === 'permission-required' ? 'permission' : 'error' });
            return;
          }
          if (result.source !== connection.source) throw new Error('Health source changed');
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
            )
              throw new Error('Invalid Health total');
            dates.add(day.date);
          }
          const submitted = await submit(days, controller.signal);
          if (generation !== current) return;
          publish({ status: submitted.ok ? 'shared' : 'error' });
        } catch {
          if (generation === current) publish({ status: 'error' });
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
