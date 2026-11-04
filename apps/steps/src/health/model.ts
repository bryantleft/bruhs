import { dateKey, type HealthConnection, type HealthDay, type HealthSource } from '../game/game.ts';

export type HealthUnavailable = 'preview' | 'device' | 'update-required';
export type HealthRead =
  | Readonly<{ status: 'read'; source: HealthSource; at: string; days: readonly HealthDay[] }>
  | Readonly<{ status: 'permission-required'; source: HealthSource }>
  | Readonly<{ status: 'unavailable'; reason: HealthUnavailable }>;
export type HealthRequest = Readonly<{
  connection: HealthConnection | undefined;
  requestPermission: boolean;
}>;
export type HealthReader = (request: HealthRequest) => Promise<HealthRead>;
export type HealthTracking =
  | Readonly<{ status: 'idle' | 'demo' | 'paused' | 'syncing' }>
  | Readonly<{ status: 'ready' | 'no-data'; source: HealthSource; at: string; steps: number }>
  | Readonly<{ status: 'permission-required'; source: HealthSource }>
  | Readonly<{ status: 'unavailable'; reason: HealthUnavailable }>
  | Readonly<{ status: 'error'; message: string }>;

export function syncStart(connection: HealthConnection | undefined, source: HealthSource, end: Date): Date {
  const cursor = connection?.enabled && connection.source === source ? new Date(connection.syncedAt) : end;
  const start = new Date(Math.min(cursor.getTime(), end.getTime()));
  start.setHours(0, 0, 0, 0);
  if (connection?.enabled && connection.source === source) {
    // Re-read yesterday for watch records that arrive after midnight. Never read
    // before this connection's start day or backfill days while sync was paused.
    const yesterday = new Date(end);
    yesterday.setHours(0, 0, 0, 0);
    yesterday.setDate(yesterday.getDate() - 1);
    start.setTime(
      Math.max(
        new Date(`${connection.startedOn}T00:00:00`).getTime(),
        Math.min(start.getTime(), yesterday.getTime()),
      ),
    );
  }
  const today = new Date(end);
  today.setHours(0, 0, 0, 0);
  // A saved calendar date may be tomorrow after crossing the date line.
  start.setTime(Math.min(start.getTime(), today.getTime()));
  return start;
}

export function parseHealthDays(
  rows: readonly Readonly<{ start: Date; steps: number | undefined }>[],
  start: Date,
  end: Date,
): readonly HealthDay[] {
  const result: HealthDay[] = [];
  const dates = new Set<string>();
  for (const row of rows) {
    if (Number.isNaN(row.start.getTime()) || row.start < start || row.start > end)
      throw new Error('The health provider returned a step date outside the requested range. Sync again.');
    if (row.steps === undefined) continue;
    // Aggregated HealthKit quantities may be fractional when a sample crosses a
    // day boundary. Round once after aggregation, never round individual samples.
    if (!Number.isFinite(row.steps) || row.steps < 0 || !Number.isSafeInteger(Math.round(row.steps)))
      throw new Error('The health provider returned an invalid step total. Sync again.');
    const date = dateKey(row.start);
    if (dates.has(date)) throw new Error('The health provider returned the same day twice. Sync again.');
    dates.add(date);
    result.push({ date, steps: Math.round(row.steps) });
  }
  return result;
}

export function parseHealthKitDays(
  rows: readonly Readonly<{ startDate?: Date; sumQuantity?: Readonly<{ quantity: number }> }>[],
  start: Date,
  end: Date,
): readonly HealthDay[] {
  // HealthKit's overlapping sample predicate can populate buckets outside the
  // requested interval. Keep the in-range bucket, including its crossing steps.
  const requested = rows.flatMap((row) => {
    if (!row.startDate || Number.isNaN(row.startDate.getTime()))
      throw new Error('Apple Health returned a step total without a valid date. Sync again.');
    return row.startDate >= start && row.startDate <= end
      ? [{ start: row.startDate, steps: row.sumQuantity?.quantity }]
      : [];
  });
  return parseHealthDays(requested, start, end);
}
