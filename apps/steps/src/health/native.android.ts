import { isRunningInExpoGo } from 'expo';
import { Linking } from 'react-native';
import type { HealthRead, HealthRequest } from './model';
import { parseHealthDays, syncStart } from './model';

const SOURCE = 'health-connect';
export async function readHealthSteps(request: HealthRequest): Promise<HealthRead> {
  if (isRunningInExpoGo()) return { status: 'unavailable', reason: 'preview' };
  const health = await import('react-native-health-connect');
  const status = await health.getSdkStatus();
  if (status === health.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED)
    return { status: 'unavailable', reason: 'update-required' };
  if (status !== health.SdkAvailabilityStatus.SDK_AVAILABLE)
    return { status: 'unavailable', reason: 'device' };
  if (!(await health.initialize()))
    throw new Error('Health Connect could not start. Open Health Connect and sync again.');
  const permissions = request.requestPermission
    ? await health.requestPermission([{ accessType: 'read', recordType: 'Steps' }])
    : await health.getGrantedPermissions();
  if (
    !permissions.some(
      (permission) =>
        'recordType' in permission && permission.recordType === 'Steps' && permission.accessType === 'read',
    )
  )
    return { status: 'permission-required', source: SOURCE };
  const end = new Date();
  const start = syncStart(request.connection, SOURCE, end);
  // Calendar-day buckets follow local midnight, including daylight-saving days.
  // Aggregation applies Health Connect's source priorities to overlapping steps.
  const buckets = await health.aggregateGroupByPeriod({
    recordType: 'Steps',
    timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
    timeRangeSlicer: { period: 'DAYS', length: 1 },
  });
  const rows = buckets.map((bucket) => ({
    start: new Date(bucket.startTime),
    steps: bucket.result.COUNT_TOTAL,
  }));
  return { status: 'read', source: SOURCE, at: end.toISOString(), days: parseHealthDays(rows, start, end) };
}

export async function openHealthSettings(): Promise<void> {
  const health = await import('react-native-health-connect');
  const status = await health.getSdkStatus();
  if (status === health.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
    await Linking.openURL('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata');
  } else health.openHealthConnectSettings();
}
