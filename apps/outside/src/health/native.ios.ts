import { isRunningInExpoGo } from 'expo';
import { Linking } from 'react-native';
import type { HealthRead, HealthRequest } from './model';
import { parseHealthKitDays, syncStart } from './model';

const SOURCE = 'apple-health';
const STEPS = 'HKQuantityTypeIdentifierStepCount';

export async function readHealthSteps(request: HealthRequest): Promise<HealthRead> {
  if (isRunningInExpoGo()) return { status: 'unavailable', reason: 'preview' };
  const health = await import('@kingstinct/react-native-healthkit');
  if (!health.isHealthDataAvailable()) return { status: 'unavailable', reason: 'device' };
  if (request.requestPermission) {
    // A successful authorization request means the sheet completed. Apple does
    // not reveal read denial; the query below determines what is readable.
    const completed = await health.requestAuthorization({ toRead: [STEPS], toShare: [] });
    if (!completed) return { status: 'permission-required', source: SOURCE };
  }
  const end = new Date();
  const start = syncStart(request.connection, SOURCE, end);
  const statistics = await health.queryStatisticsCollectionForQuantity(
    STEPS,
    ['cumulativeSum'],
    start,
    { day: 1 },
    { unit: 'count', filter: { date: { startDate: start, endDate: end } } },
  );
  return {
    status: 'read',
    source: SOURCE,
    at: end.toISOString(),
    days: parseHealthKitDays(statistics, start, end),
  };
}

export async function openHealthSettings(): Promise<void> {
  await Linking.openURL('x-apple-health://');
}
