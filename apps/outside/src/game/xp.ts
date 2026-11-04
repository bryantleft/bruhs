// RuneScape's experience curve: level L needs floor(Σ_{l<L} floor(l + 300·2^(l/7)) / 4) XP.
export const MAX_LEVEL = 99;

export const XP_TABLE: readonly number[] = (() => {
  const table = [0, 0];
  let points = 0;
  for (let level = 1; level < MAX_LEVEL; level += 1) {
    points += Math.floor(level + 300 * 2 ** (level / 7));
    table.push(Math.floor(points / 4));
  }
  return table;
})();

export function xpForLevel(level: number): number {
  return XP_TABLE[Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))] ?? 0;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= (XP_TABLE[level + 1] ?? Number.POSITIVE_INFINITY)) level += 1;
  return level;
}

export function levelProgress(xp: number): Readonly<{
  level: number;
  current: number;
  next: number | null;
  remaining: number;
  progress: number;
}> {
  const level = levelForXp(xp);
  const current = xpForLevel(level);
  if (level >= MAX_LEVEL) return { level, current, next: null, remaining: 0, progress: 1 };
  const next = xpForLevel(level + 1);
  return { level, current, next, remaining: next - xp, progress: (xp - current) / (next - current) };
}
