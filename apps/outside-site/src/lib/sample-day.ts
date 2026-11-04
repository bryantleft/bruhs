// A first day of play, run through the game's own rules at build time: a new save walks to
// pandan woods, starts chopping, and syncs 8,000 steps. Every number on the page's report comes
// from this run, so the landing page can't promise more than the game pays.
import { getLocation } from '@steps/src/game/content.ts';
import { createGame, type Game, getSkin, unlocksBetween, updateGame } from '@steps/src/game/game.ts';
import { itemCount, parseKey } from '@steps/src/game/items.ts';
import { diffReport } from '@steps/src/game/session.ts';

export const SAMPLE_STEPS = 8_000;
export const SAMPLE_PLACE = 'pandan-woods';
export const SAMPLE_ACTIVITY = 'chop-pandan';
// Any fixed date works; the run depends only on the save's seed, never on the build day.
export const SAMPLE_DATE = '2026-01-05';

function run() {
  const start: Game = updateGame(createGame(SAMPLE_DATE), { type: 'travel', to: SAMPLE_PLACE, next: SAMPLE_ACTIVITY });
  const end = updateGame(start, { type: 'sync-steps', date: SAMPLE_DATE, steps: SAMPLE_STEPS });
  const report = diffReport(1, start, end, true);
  // Tripwires: if a rules change makes this day stall, the page must not ship a broken story.
  if (report.steps !== SAMPLE_STEPS)
    throw new Error(`sample day spent ${report.steps} of ${SAMPLE_STEPS} steps; check the travel or task rules.`);
  if (report.arrived !== SAMPLE_PLACE || end.task?.id !== SAMPLE_ACTIVITY)
    throw new Error(`sample day did not end ${SAMPLE_ACTIVITY} at ${SAMPLE_PLACE}.`);
  // The section sells "come back to loot": a day that pays nothing would render an empty report.
  if (report.gained.length === 0 || report.xp.length === 0)
    throw new Error('sample day earned no loot or xp; the "a real first day" report would be empty.');
  return report;
}

const report = run();
const place = getLocation(SAMPLE_PLACE);
if (!place) throw new Error(`SAMPLE_PLACE ${SAMPLE_PLACE} is not a place in the game content.`);
const outfit = report.skins.at(-1);

export const sampleDay = {
  steps: report.steps,
  actions: report.actions,
  place: place.name,
  levels: report.levels.map(({ skill, from, level }) => ({
    skill,
    line: `${skill} level ${level}${level - from > 1 ? ` (+${level - from} levels)` : ''}`,
    unlocks: unlocksBetween(skill, from, level),
  })),
  xp: report.xp,
  loot: report.gained.map((stack) => ({
    item: parseKey(stack.item).id,
    qty: stack.qty,
    label: itemCount(stack.qty, stack.item),
  })),
  outfit: outfit ? getSkin(outfit).name : null,
} as const;
