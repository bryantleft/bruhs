/**
 * OKLCH colour maths for code that turns the theme's tokens into other formats (native apps,
 * generated assets). Follows CSS Color 4: OKLCH → OKLab → LMS → linear RGB, then the sRGB
 * transfer curve, which Display P3 shares. Plain data and functions, no dependencies.
 */

export type Gamut = "srgb" | "p3";

export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

const LMS_TO_LINEAR: Record<Gamut, readonly (readonly [number, number, number])[]> = {
  srgb: [
    [4.0767416621, -3.3077115913, 0.2309699292],
    [-1.2684380046, 2.6097574011, -0.3413193965],
    [-0.0041960863, -0.7034186147, 1.707614701],
  ],
  // XYZ→linear-P3 multiplied by OKLab's LMS→XYZ.
  p3: [
    [3.128110529, -2.2570750184, 0.1293047885],
    [-1.0911281609, 2.4132667618, -0.322168171],
    [-0.0260136498, -0.5080276489, 1.5333166822],
  ],
};

/** Every `--color-<name>: oklch(L C H)` declaration in a stylesheet, in source order. */
export function parseColorTokens(css: string): ReadonlyMap<string, Oklch> {
  const tokens = new Map<string, Oklch>();
  for (const [, name, l, c, h] of css.matchAll(/--color-([\w-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g)) {
    tokens.set(name, { l: Number(l), c: Number(c), h: Number(h) });
  }
  return tokens;
}

/** Linear-light RGB, unclipped: components outside 0…1 mean the colour is out of gamut. */
export function toLinear({ l, c, h }: Oklch, gamut: Gamut): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ];
  const [r, g, bl] = LMS_TO_LINEAR[gamut].map((row) => row[0] * lms[0] + row[1] * lms[1] + row[2] * lms[2]);
  return [r, g, bl];
}

const TOLERANCE = 1e-4;

export function inGamut(color: Oklch, gamut: Gamut): boolean {
  return toLinear(color, gamut).every((v) => v >= -TOLERANCE && v <= 1 + TOLERANCE);
}

/** Gamma-encoded 0…1 components. Throws for an out-of-gamut colour rather than clipping it. */
export function toRgb(color: Oklch, gamut: Gamut): [number, number, number] {
  if (!inGamut(color, gamut)) {
    throw new Error(`oklch(${color.l} ${color.c} ${color.h}) is outside ${gamut}; reduce its chroma.`);
  }
  const [r, g, b] = toLinear(color, gamut).map((linear) => {
    const v = Math.min(1, Math.max(0, linear));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  });
  return [r, g, b];
}

/** The same lightness and hue with the most chroma that fits the gamut. */
export function fitChroma(color: Oklch, gamut: Gamut): Oklch {
  if (inGamut(color, gamut)) return color;
  let low = 0;
  let high = color.c;
  while (high - low > 1e-5) {
    const mid = (low + high) / 2;
    if (inGamut({ ...color, c: mid }, gamut)) low = mid;
    else high = mid;
  }
  return { ...color, c: low };
}

/** WCAG 2 contrast ratio between two opaque sRGB colours. */
export function contrast(a: Oklch, b: Oklch): number {
  const luminance = (color: Oklch) => {
    const [r, g, bl] = toLinear(color, "srgb").map((v) => Math.min(1, Math.max(0, v)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
