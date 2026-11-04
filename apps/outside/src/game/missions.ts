// Missions: daily, weekly and monthly goals, drawn per period and counted from a snapshot.
import {
  FIXED_MISSIONS,
  MISSION_PERIODS,
  MISSION_PICKS,
  MISSION_POOLS,
  type Mission,
  type MissionPeriod,
  QUESTS,
  SKILL_IDS,
} from './content.ts';
import { Dice, hashString } from './dice.ts';
import { dateKey, dayBefore, type Game, getDay, type MissionState, questState } from './game.ts';

function shiftDate(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

// The first and last date of the period containing `date`. Weeks start on Monday.
export function periodRange(period: MissionPeriod, date: string): Readonly<{ start: string; end: string }> {
  if (period === 'daily') return { start: date, end: date };
  if (period === 'weekly') {
    const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    const start = shiftDate(date, -weekday);
    return { start, end: shiftDate(start, 6) };
  }
  const start = `${date.slice(0, 7)}-01`;
  const next = new Date(`${start}T12:00:00`);
  next.setMonth(next.getMonth() + 1);
  return { start, end: dayBefore(dateKey(next)) };
}

export function periodKey(period: MissionPeriod, date: string): string {
  return `${period}:${periodRange(period, date).start}`;
}

// Whole days left in the period after today (0 on its last day).
export function periodDaysLeft(period: MissionPeriod, date: string): number {
  const end = new Date(`${periodRange(period, date).end}T12:00:00`).getTime();
  return Math.round((end - new Date(`${date}T12:00:00`).getTime()) / 86_400_000);
}

function missionCounters(game: Game): Record<string, number> {
  const counters: Record<string, number> = {
    actions: game.actions,
    road: game.walked,
    chests: game.stats.chestsFound ?? 0,
    quests: Object.values(game.quests).filter((state) => state === 'done').length,
  };
  for (const skill of SKILL_IDS) counters[`actions:${skill}`] = game.stats[`actions:${skill}`] ?? 0;
  return counters;
}

// Snapshots keep only non-zero counters, matching how saves store counts.
function snapshot(game: Game): Record<string, number> {
  return Object.fromEntries(Object.entries(missionCounters(game)).filter(([, value]) => value > 0));
}

// Draws the period's pool missions from the period alone: stable however the save's dice move,
// and the same for everyone, so a party shares its week's missions.
function drawMissions(game: Game, period: MissionPeriod, key: string): string[] {
  const questsLeft = QUESTS.some((quest) => questState(game, quest.id) !== 'done');
  const pool = MISSION_POOLS[period].filter((mission) => mission.kind !== 'quests' || questsLeft);
  const dice = new Dice(hashString(key));
  const picks: string[] = [];
  const left = [...pool];
  while (picks.length < MISSION_PICKS && left.length > 0) {
    const [mission] = left.splice(Math.floor(dice.next() * left.length), 1);
    if (mission) picks.push(mission.id);
  }
  return picks;
}

function missionState(game: Game, period: MissionPeriod, date: string): MissionState {
  const key = periodKey(period, date);
  const state = game.missions[period];
  if (state?.key === key) return state;
  return { key, picks: drawMissions(game, period, key), base: snapshot(game), claimed: [] };
}

export function rollMissions(game: Game, date: string): Game {
  let missions = game.missions;
  for (const period of MISSION_PERIODS) {
    const state = missionState(game, period, date);
    if (state !== game.missions[period]) missions = { ...missions, [period]: state };
  }
  return missions === game.missions ? game : { ...game, missions };
}

const MISSIONS_BY_ID = new Map(
  MISSION_PERIODS.flatMap((period) => [FIXED_MISSIONS[period], ...MISSION_POOLS[period]]).map((mission) => [
    mission.id,
    mission,
  ]),
);

export function getMission(id: string): Mission | undefined {
  return MISSIONS_BY_ID.get(id);
}

export function missionsFor(game: Game, period: MissionPeriod, date: string): readonly Mission[] {
  const picks = missionState(game, period, date).picks.flatMap((id) => {
    const mission = MISSIONS_BY_ID.get(id);
    return mission ? [mission] : [];
  });
  return [FIXED_MISSIONS[period], ...picks];
}

export function missionClaimed(game: Game, mission: Mission, date: string): boolean {
  return missionState(game, mission.period, date).claimed.includes(mission.id);
}

export function missionProgress(
  game: Game,
  mission: Mission,
  date: string,
): Readonly<{ value: number; target: number }> {
  if (mission.kind === 'steps') {
    const { start, end } = periodRange(mission.period, date);
    const value = game.days
      .filter((day) => day.date >= start && day.date <= end)
      .reduce((sum, day) => sum + day.steps, 0);
    const goal = mission.period === 'daily' ? getDay(game, date).goal : game.goal;
    return { value, target: mission.target * goal };
  }
  const key = mission.kind === 'actions' && mission.skill ? `actions:${mission.skill}` : mission.kind;
  const base = missionState(game, mission.period, date).base[key] ?? 0;
  return { value: Math.max(0, (missionCounters(game)[key] ?? 0) - base), target: mission.target };
}

// Missions that are complete and not yet collected, across all periods.
export function readyMissions(game: Game, date: string): readonly Mission[] {
  return MISSION_PERIODS.flatMap((period) =>
    missionsFor(game, period, date).filter((mission) => {
      if (missionClaimed(game, mission, date)) return false;
      const { value, target } = missionProgress(game, mission, date);
      return value >= target;
    }),
  );
}
