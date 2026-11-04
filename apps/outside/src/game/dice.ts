// Deterministic randomness: saves carry one seed, so the same walk always rolls the same loot.

// mulberry32: one 32-bit state word, advanced once per roll.
function roll(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4_294_967_296, next];
}

export class Dice {
  seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    const [value, seed] = roll(this.seed);
    this.seed = seed;
    return value;
  }
  chance(probability: number): boolean {
    return probability > 0 && this.next() < probability;
  }
  between(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

// FNV-1a: a stable 32-bit seed from a string, such as a mission period key.
export function hashString(text: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
