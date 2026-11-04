import { type Day, dayBefore, type Game } from './game.ts';

export type HistoryDay = Readonly<{ date: string; entry: Day | null }>;

export function recentWeek(
  game: Game,
  today: string,
): Readonly<{
  days: readonly HistoryDay[];
  total: number;
  logged: number;
  completed: number;
  scale: number;
}> {
  const dates = [today];
  for (let index = 1; index < 7; index += 1) dates.unshift(dayBefore(dates[0] ?? today));
  const entries = new Map(game.days.map((day) => [day.date, day]));
  const days = dates.map((date) => ({ date, entry: entries.get(date) ?? null }));
  const logged = days.flatMap(({ entry }) => (entry ? [entry] : []));
  return {
    days,
    total: logged.reduce((sum, day) => sum + day.steps, 0),
    logged: logged.length,
    completed: logged.filter((day) => day.steps >= day.goal).length,
    scale: Math.max(game.goal, ...logged.map((day) => day.steps)),
  };
}
