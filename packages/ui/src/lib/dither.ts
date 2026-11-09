/**
 * Dither: the Bruh mascot and small indicators drawn in dots.
 *
 * The Bruh is a halftone: a hex grid over the face, each dot sized by the light
 * on a sphere (dot area tracks brightness) and shrunk a little toward the rim,
 * so the silhouette stays round and the face reads as a lit ball. The eyes are
 * holes and the mouth is one row of red. Geometry comes from `bruhGeometry`,
 * so the dots always match the logo, and looking left or right turns toward
 * the logo's own `left` and `right` variants. bruhs.ai and the bruhs-ai app
 * carry ports of the same algorithm.
 *
 * Pure math plus one Canvas 2D draw call; no DOM lookups, so it runs in Node.
 */
import { bruhGeometry, type Point } from "./logo.ts";

/** 4×4 Bayer matrix as thresholds in (0, 1): an order for dot dissolves. */
const BAYER: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((n) => (n + 0.5) / 16);

/** Ordered-dither threshold for the dot at grid position (col, row). */
export function ditherThreshold(col: number, row: number): number {
  return BAYER[(row & 3) * 4 + (col & 3)] ?? 0.5;
}

/** Stable noise in [0, 1) per grid position: the order dots appear in during a reveal. */
export function revealNoise(col: number, row: number): number {
  const n = Math.sin(col * 12.9898 + row * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export type DotKind = "face" | "mouth";

export interface BrailleBruh {
  /** Center and radius, in canvas pixels. */
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /** -1 turns fully to the `left` variant, 1 to `right`, 0 is `original`. */
  readonly lookX?: number;
  /** -1 (up) to 1 (down); the logo has no vertical variants, so this is a small nudge. */
  readonly lookY?: number;
}

export interface Dot {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly kind: DotKind;
  /** Grid position, for `revealNoise` or `ditherThreshold`. */
  readonly col: number;
  readonly row: number;
}

const { base, eye, mouth, faces } = bruhGeometry;
const unit = (p: Point): Point => ({ x: (p.x - base.cx) / base.r, y: (p.y - base.cy) / base.r });
const variant = (name: keyof typeof faces) => ({
  leftEye: unit(faces[name].leftEye),
  rightEye: unit(faces[name].rightEye),
  mouth: unit(faces[name].mouth),
});
const ORIGINAL = variant("original");
const LEFT = variant("left");
const RIGHT = variant("right");
const EYE_RX = eye.rx / base.r;
const MOUTH_RX = mouth.rx / base.r;
const FEATURE_RY = eye.ry / base.r;
// Light from the upper left, mostly frontal; some ambient so the shadow side
// keeps its dots and the outline stays whole.
const LIGHT = normalize(-0.35, -0.45, 0.82);
const AMBIENT = 0.25;
const RIM = 0.35;

/**
 * Grid spacing for a face radius: about 15 dots per radius on a large face,
 * down to 9 on a small one (fewer turns the outline into a hexagon).
 */
export function pitchFor(r: number): number {
  return r / Math.max(9, Math.min(15, r / 10));
}

/** Brightness (0 to 1) of the sphere at a point in face radii, or `null` outside it. */
export function shade(dx: number, dy: number): number | null {
  const d2 = dx * dx + dy * dy;
  if (d2 > 1) return null;
  const nz = Math.sqrt(1 - d2);
  const lambert = Math.max(0, LIGHT.x * dx + LIGHT.y * dy + LIGHT.z * nz);
  return (AMBIENT + (1 - AMBIENT) * lambert) * (1 - RIM + RIM * Math.sqrt(nz));
}

/**
 * Every dot of a Bruh in a `width` × `height` box. The hex grid is anchored on
 * the face's center, so the face is symmetric wherever it sits.
 */
export function bruhDots(width: number, height: number, face: BrailleBruh): Dot[] {
  const { cx, cy, r } = face;
  const pitch = pitchFor(r);
  const rowH = (pitch * Math.sqrt(3)) / 2;
  const look = Math.max(-1, Math.min(1, face.lookX ?? 0));
  const nudge = Math.max(-1, Math.min(1, face.lookY ?? 0)) * 0.05;
  const turned = look < 0 ? LEFT : RIGHT;
  const t = Math.abs(look);
  const toward = (a: Point, b: Point): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + nudge });
  const eyes = [toward(ORIGINAL.leftEye, turned.leftEye), toward(ORIGINAL.rightEye, turned.rightEye)];
  const m = toward(ORIGINAL.mouth, turned.mouth);
  const eyeRy = Math.max(FEATURE_RY, (pitch * 0.9) / r);
  // The mouth is exactly one row: the one nearest its line.
  const mouthRow = Math.round((m.y * r) / rowH);

  const dots: Dot[] = [];
  const rows = Math.ceil(r / rowH) + 1;
  const cols = Math.ceil(r / pitch) + 1;
  for (let row = -rows; row <= rows; row++) {
    const y = cy + row * rowH;
    if (y < -pitch || y > height + pitch) continue;
    const offset = row & 1 ? pitch / 2 : 0;
    for (let col = -cols; col <= cols; col++) {
      const x = cx + col * pitch + offset;
      if (x < -pitch || x > width + pitch) continue;
      const dx = (x - cx) / r;
      const dy = (y - cy) / r;
      let value = shade(dx, dy);
      if (value === null) continue;
      if (eyes.some((e) => ((dx - e.x) / EYE_RX) ** 2 + ((dy - e.y) / eyeRy) ** 2 <= 1)) continue;
      const isMouth = row === mouthRow && Math.abs((dx - m.x) / MOUTH_RX) <= 1;
      if (isMouth) value = Math.max(value, 0.75);
      const radius = (pitch / 2) * 0.92 * Math.sqrt(value);
      if (radius < pitch * 0.07) continue;
      dots.push({ x, y, radius, kind: isMouth ? "mouth" : "face", col, row });
    }
  }
  return dots;
}

/** Defaults: the mascot's own colors. */
export const BRUH_DOT_COLORS: Readonly<Record<DotKind, string>> = {
  face: "var(--color-bruh-base)",
  mouth: "var(--color-bruh-mouth)",
};

/** Minimal Canvas 2D surface, so callers can pass any context-like object. */
export interface DotContext {
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
}

/**
 * Draws `dots` into a 2D context, one path per color. Canvas can't read CSS
 * variables, so resolve `colors` first (e.g. with getComputedStyle) when using
 * the `var(...)` defaults. `reveal` below 1 keeps that share of the dots, in
 * `revealNoise` order, for an entrance; leave it at 1 under reduced motion.
 */
export function drawDots(
  ctx: DotContext,
  width: number,
  height: number,
  dots: readonly Dot[],
  colors: Readonly<Record<DotKind, string>>,
  reveal = 1,
): void {
  ctx.clearRect(0, 0, width, height);
  for (const kind of ["face", "mouth"] as const) {
    ctx.beginPath();
    for (const d of dots) {
      if (d.kind !== kind || (reveal < 1 && revealNoise(d.col, d.row) > reveal)) continue;
      ctx.moveTo(d.x + d.radius, d.y);
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
    }
    ctx.fillStyle = colors[kind];
    ctx.fill();
  }
}

function normalize(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}

/**
 * Lit dots (0 to 4) for one column of a `.braille-meter`, from a level in [0, 1]
 * such as audio RMS. Square-rooted so quiet speech still shows: 0.05 lights one
 * dot, 0.25 two, 0.6 three, 1.0 four.
 */
export function meterDots(level: number): 0 | 1 | 2 | 3 | 4 {
  if (!(level > 0)) return 0;
  return Math.min(4, Math.round(Math.sqrt(Math.min(1, level)) * 4)) as 0 | 1 | 2 | 3 | 4;
}
