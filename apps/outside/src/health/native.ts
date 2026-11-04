import type { HealthRead, HealthRequest } from './model';

export async function readHealthSteps(_request: HealthRequest): Promise<HealthRead> {
  return { status: 'unavailable', reason: 'preview' };
}

export async function openHealthSettings(): Promise<void> {
  throw new Error('Health settings are available in the installed iPhone or Android app.');
}
