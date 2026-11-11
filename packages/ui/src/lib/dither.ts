/**
 * Dither: the Bruh mascot and small indicators drawn in dots.
 *
 * The Bruh is a halftone: a hex grid over the face, each dot sized by the light
 * on a sphere (dot area tracks brightness) and shrunk a little toward the rim,
 * so the silhouette stays round and the face reads as a lit ball. The eyes are
 * one-row slits and the mouth is one row of red. Geometry comes from
 * `bruhGeometry`, so the dots always match the logo. Looking turns the whole
 * head in 3D: the features ride the sphere, curving and foreshortening toward
 * the rim under a fixed light, and the ball leans a little the way it looks.
 * bruhs.ai and the bruhs-ai app carry ports of the same algorithm.
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
  /** -1 turns the head fully left, 1 fully right. */
  readonly lookX?: number;
  /** -1 tilts the head up, 1 down. */
  readonly lookY?: number;
}

export interface Dot {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** `mouth` once the dot is at least half mouth. */
  readonly kind: DotKind;
  /** How much of the mouth's red it takes, 0 to 1. */
  readonly mix: number;
  /** Grid position, for `revealNoise` or `ditherThreshold`. */
  readonly col: number;
  readonly row: number;
}

const { base, eye, mouth, faces } = bruhGeometry;
const unit = (p: Point): Point => ({ x: (p.x - base.cx) / base.r, y: (p.y - base.cy) / base.r });
// The logo's eyes sit 102 and 101 units from center; mirror them so the
// symmetric hex grid cuts identical slits.
const FRONT_LEFT_EYE = unit(faces.original.leftEye);
const FRONT_RIGHT_EYE = unit(faces.original.rightEye);
const EYE_HALF = (FRONT_RIGHT_EYE.x - FRONT_LEFT_EYE.x) / 2;
const LEFT_EYE: Point = { x: -EYE_HALF, y: FRONT_LEFT_EYE.y };
const RIGHT_EYE: Point = { x: EYE_HALF, y: FRONT_RIGHT_EYE.y };
const MOUTH_AT = unit(faces.original.mouth);
// A full look (lookX or lookY of ±1) turns the head this far, in radians,
// and shifts the ball this share of its radius.
const MAX_YAW = 0.75;
const MAX_PITCH = 0.45;
const LEAN = 0.04;
const EYE_RX = eye.rx / base.r;
const MOUTH_RX = mouth.rx / base.r;
// Light from the upper left, mostly frontal; some ambient so the shadow side
// keeps its dots and the outline stays whole.
const LIGHT = normalize(-0.35, -0.45, 0.82);
const AMBIENT = 0.25;
const RIM = 0.35;

/**
 * Target grid spacing for a face radius: about 15 dots per radius on a large
 * face, down to 9 on a small one (fewer turns the outline into a hexagon).
 * {@link gridFor} tightens it a little so the features land exactly.
 */
export function pitchFor(r: number): number {
  return r / Math.max(9, Math.min(15, r / 10));
}

/**
 * The hex grid for a face radius, fitted to the mascot: the eye line and the
 * mouth line both fall exactly on a row, where the logo puts them, at every
 * size. The rows between them are a whole number (rounded up from
 * {@link pitchFor}'s density, so the grid only gets finer), and the rows are
 * anchored on the eye line instead of the ball's center. Columns still start
 * at the center, so the face stays mirror-symmetric. Row n sits at
 * `cy + phase + n * rowH`.
 */
export function gridFor(r: number): { pitch: number; rowH: number; phase: number } {
  const gap = (MOUTH_AT.y - LEFT_EYE.y) * r;
  const target = (pitchFor(r) * Math.sqrt(3)) / 2;
  const rowH = gap / Math.max(1, Math.ceil(gap / target - 1e-9));
  const eyeY = LEFT_EYE.y * r;
  return { pitch: (2 * rowH) / Math.sqrt(3), rowH, phase: eyeY - Math.round(eyeY / rowH) * rowH };
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
 * Every dot of a Bruh in a `width` × `height` box, on the grid {@link gridFor}
 * fits to the face. A face looking straight ahead is exactly symmetric.
 */
export function bruhDots(width: number, height: number, face: BrailleBruh): Dot[] {
  const { r } = face;
  const lookX = Math.max(-1, Math.min(1, face.lookX ?? 0));
  const lookY = Math.max(-1, Math.min(1, face.lookY ?? 0));
  const cx = face.cx + lookX * LEAN * r;
  const cy = face.cy + lookY * LEAN * r;
  const { pitch, rowH, phase } = gridFor(r);
  const head = rotation(lookX * MAX_YAW, lookY * MAX_PITCH);
  // Features are anti-aliased: each dot shrinks (eyes) or reddens (mouth) by
  // how much of the feature covers it, so a turning face glides through the
  // grid instead of jumping a dot at a time. Vertically a feature is a line
  // shared between the two rows around it; at rest that line sits exactly on
  // a row, so a face looking ahead keeps crisp one-row slits. (A hard oval
  // cut across staggered rows came out ▽ on one eye and △ on the other.)
  const soft = (pitch * 0.6) / r;
  const land = (at: Point, rx: number) => {
    const seen = head.toScreen(lift(at));
    // On the grid gridFor fits, this is exactly `at.y` for the eyes and mouth.
    const restLine = (phase + Math.round((at.y * r - phase) / rowH) * rowH) / r;
    // Fade a feature out as it turns round the rim rather than popping.
    return { at, rx, line: seen.y + restLine - at.y, fade: smoothstep(0.05, 0.3, seen.z) };
  };
  const leftEye = land(LEFT_EYE, EYE_RX);
  const rightEye = land(RIGHT_EYE, EYE_RX);
  const m = land(MOUTH_AT, MOUTH_RX);
  // How much of a feature covers the dot at screen height `dy` whose point on the head is `local`.
  const cover = (f: ReturnType<typeof land>, dy: number, local: Point) => {
    const across = Math.max(0, 1 - (Math.abs(dy - f.line) * r) / rowH);
    if (across === 0 || Math.abs(local.y - f.at.y) > 0.2) return 0;
    return across * (1 - smoothstep(f.rx, f.rx + soft, Math.abs(local.x - f.at.x))) * f.fade;
  };

  const dots: Dot[] = [];
  const rows = Math.ceil(r / rowH) + 2;
  const cols = Math.ceil(r / pitch) + 1;
  for (let row = -rows; row <= rows; row++) {
    const y = cy + phase + row * rowH;
    if (y < -pitch || y > height + pitch) continue;
    for (let col = -cols; col <= cols; col++) {
      // Offsets in whole half-steps, so a dot and its mirror twin get exactly
      // negated positions and the face stays symmetric.
      const halfSteps = 2 * col + (row & 1);
      const x = cx + (halfSteps * pitch) / 2;
      if (x < -pitch || x > width + pitch) continue;
      const dx = (halfSteps * pitch) / (2 * r);
      const dy = (phase + row * rowH) / r;
      let value = shade(dx, dy);
      if (value === null) continue;
      // The point of the head's own (unturned) surface now under this dot.
      const local = head.toLocal(dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)));
      const eyeCover = Math.max(cover(leftEye, dy, local), cover(rightEye, dy, local));
      const mix = cover(m, dy, local);
      value += (Math.max(value, 0.75) - value) * mix;
      const radius = (pitch / 2) * 0.92 * Math.sqrt(value) * (1 - eyeCover);
      if (radius < pitch * 0.07) continue;
      dots.push({ x, y, radius, kind: mix >= 0.5 ? "mouth" : "face", mix, col, row });
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
  globalAlpha: number;
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
  // The mouth blends from face to mouth color in five steps: each step's dots
  // are filled in the face color, then the mouth color at that step's
  // opacity, which works for any CSS color the caller resolved.
  for (const step of [0, 1, 2, 3, 4]) {
    ctx.beginPath();
    for (const d of dots) {
      if (Math.round(d.mix * 4) !== step || (reveal < 1 && revealNoise(d.col, d.row) > reveal)) continue;
      ctx.moveTo(d.x + d.radius, d.y);
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.face;
    ctx.fill();
    if (step === 0) continue;
    ctx.globalAlpha = step / 4;
    ctx.fillStyle = colors.mouth;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 0 below `a`, 1 above `b`, eased between. */
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** A point of the front-facing face, in face radii, lifted onto the sphere. */
function lift(p: Point): { x: number; y: number; z: number } {
  return { x: p.x, y: p.y, z: Math.sqrt(Math.max(0, 1 - p.x * p.x - p.y * p.y)) };
}

/**
 * The head's turn: a tilt (pitch, positive looks down) then a turn (yaw,
 * positive looks right), on screen axes with y down and z toward the viewer.
 */
function rotation(yaw: number, pitch: number) {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  return {
    toScreen(p: { x: number; y: number; z: number }) {
      const y = p.y * cosP + p.z * sinP;
      const z = -p.y * sinP + p.z * cosP;
      return { x: p.x * cosY + z * sinY, y, z: -p.x * sinY + z * cosY };
    },
    toLocal(x: number, y: number, z: number) {
      const lx = x * cosY - z * sinY;
      const lz = x * sinY + z * cosY;
      return { x: lx, y: y * cosP - lz * sinP, z: y * sinP + lz * cosP };
    },
  };
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
