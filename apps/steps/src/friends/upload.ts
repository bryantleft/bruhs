import { api } from 'bruhs-api/api';
import { ConvexHttpClient } from 'convex/browser';
import type { HealthDay } from '../game/game';
import { PartyAuthError } from './session';

export type StepUpload = (userId: string, days: readonly HealthDay[], signal: AbortSignal) => Promise<true>;

export function createStepUpload(endpoint: string, token: () => string | null): StepUpload {
  return async (userId, days, signal) => {
    if (signal.aborted) throw new Error('Step sharing canceled.');
    const jwt = token();
    if (!jwt) throw new PartyAuthError('Step sharing requires a party login.');
    // Bind this identity and abort signal to one HTTP request, bypassing the
    // WebSocket mutation queue's reconnect replay. Fetch still owns pooling.
    // A write that the server has already accepted can finish.
    const client = new ConvexHttpClient(endpoint, {
      logger: false,
      fetch: (input, init) => fetch(input, { ...init, signal }),
    });
    client.setAuth(jwt);
    return client.mutation(api.outside.submit, { expectedUserId: userId, days: [...days] });
  };
}
