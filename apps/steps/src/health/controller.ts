import { dateKey, type GameAction } from '../game/game.ts';
import type { HealthReader, HealthRequest, HealthTracking } from './model.ts';

export function createHealthSync(
  reader: HealthReader,
  publish: (state: HealthTracking) => void,
  commit: (action: GameAction) => void,
): Readonly<{ run: (request: HealthRequest) => Promise<void>; cancel: () => void }> {
  let generation = 0;
  let pending: Promise<void> | null = null;
  return {
    run(request) {
      if (pending) return pending;
      const current = generation;
      publish({ status: 'syncing' });
      const operation = (async () => {
        try {
          await Promise.resolve();
          if (generation !== current) return;
          const result = await reader(request);
          if (generation !== current) return;
          if (result.status !== 'read') {
            publish(result);
            return;
          }
          const date = dateKey(new Date(result.at));
          commit({ type: 'health-sync', date, source: result.source, at: result.at, days: result.days });
          const steps = result.days.find((day) => day.date === date)?.steps ?? 0;
          publish({ status: steps > 0 ? 'ready' : 'no-data', source: result.source, at: result.at, steps });
        } catch (error: unknown) {
          if (generation === current)
            publish({
              status: 'error',
              message:
                error instanceof Error
                  ? error.message
                  : 'Health steps could not be read. Check step access and sync again.',
            });
        } finally {
          if (generation === current) pending = null;
        }
      })();
      pending = operation;
      return operation;
    },
    cancel() {
      generation += 1;
      pending = null;
    },
  };
}
