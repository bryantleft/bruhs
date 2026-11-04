import type { Art } from './art.ts';

// One path per colour, built from horizontal runs: a 16×16 sprite costs a handful of nodes.
const pathCache = new WeakMap<Art, readonly (readonly [string, string])[]>();

export function artPaths(art: Art): readonly (readonly [string, string])[] {
  const cached = pathCache.get(art);
  if (cached) return cached;
  const byColor = new Map<string, string[]>();
  art.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x] ?? '.';
      let end = x + 1;
      while (end < row.length && row[end] === key) end += 1;
      const fill = key === '.' ? undefined : art.colors[key];
      if (fill) {
        const parts = byColor.get(fill) ?? [];
        parts.push(`M${x} ${y}h${end - x}v1h${x - end}z`);
        byColor.set(fill, parts);
      }
      x = end;
    }
  });
  const result = [...byColor].map(([fill, parts]) => [fill, parts.join('')] as const);
  pathCache.set(art, result);
  return result;
}
