/**
 * Dither: the Bruh mascot and small indicators drawn as braille-style dots.
 *
 * Dots sit in braille cells (2 columns × 4 rows). Brightness decides which dots
 * appear through a 4×4 ordered (Bayer) dither, so a lit sphere is solid where the
 * light hits and breaks into scattered dots toward its edge. The face comes from
 * `bruhGeometry`, so a dithered Bruh and the vector logo always agree, and
 * looking left or right turns toward the logo's own `left` and `right` variants.
 *
 * Pure math plus one Canvas 2D draw call; no DOM lookups, so it runs in Node.
 */
import { bruhGeometry, type Point } from "./logo.ts";

/** 4×4 Bayer matrix as thresholds in (0, 1). */
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

export type DotKind = "face" | "mouth" | "halo";

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

export interface DotGrid {
  /** Distance between dots inside a cell. */
  readonly pitch: number;
  /** Extra space between cells, which is what makes the dots read as braille. */
  readonly gap: number;
  /** Dot radius. */
  readonly dot: number;
}

/** Proportions used across Bruhs: gap 0.6 × pitch, dot radius 0.36 × pitch. */
export function dotGrid(pitch: number): DotGrid {
  return { pitch, gap: pitch * 0.6, dot: pitch * 0.36 };
}

const { base, eye, mouth, faces } = bruhGeometry;
const unit = (p: Point): Point => ({ x: (p.x - base.cx) / base.r, y: (p.y - base.cy) / base.r });
const toward = (from: Point, to: Point, t: number): Point => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
const ORIGINAL = { leftEye: unit(faces.original.leftEye), rightEye: unit(faces.original.rightEye), mouth: unit(faces.original.mouth) };
const LEFT = { leftEye: unit(faces.left.leftEye), rightEye: unit(faces.left.rightEye), mouth: unit(faces.left.mouth) };
const RIGHT = { leftEye: unit(faces.right.leftEye), rightEye: unit(faces.right.rightEye), mouth: unit(faces.right.mouth) };
const EYE_RX = eye.rx / base.r;
const MOUTH_RX = mouth.rx / base.r;
const FEATURE_RY = eye.ry / base.r;
// Light from the upper left, mostly frontal.
const LIGHT = { x: -0.36, y: -0.42, z: 0.83 };

/**
 * What lies under a point: the layer and its brightness (0 to 1), or `null` for an
 * eye, which is a hole. `minFeature` is the thinnest an eye or mouth may be, in
 * face radii; pass about 1.1 × pitch / r so the features survive the dot grid.
 */
export function sampleBruh(x: number, y: number, face: BrailleBruh, minFeature = 0): { kind: DotKind; value: number } | null {
  const dx = (x - face.cx) / face.r;
  const dy = (y - face.cy) / face.r;
  const d2 = dx * dx + dy * dy;
  if (d2 > 1) {
    // Fades to nothing a fifth of a radius out, inside any reasonable canvas edge.
    const fade = Math.max(0, 1 - (Math.sqrt(d2) - 1) / 0.2);
    return { kind: "halo", value: 0.24 * fade * fade };
  }

  const lookX = Math.max(-1, Math.min(1, face.lookX ?? 0));
  const lookY = Math.max(-1, Math.min(1, face.lookY ?? 0)) * 0.05;
  const turned = lookX < 0 ? LEFT : RIGHT;
  const t = Math.abs(lookX);
  const ry = Math.max(FEATURE_RY, minFeature);

  const m = toward(ORIGINAL.mouth, turned.mouth, t);
  const mx = (dx - m.x) / MOUTH_RX;
  const my = (dy - m.y - lookY) / ry;
  if (mx * mx + my * my <= 1) return { kind: "mouth", value: 1 };

  for (const which of ["leftEye", "rightEye"] as const) {
    const e = toward(ORIGINAL[which], turned[which], t);
    const ex = (dx - e.x) / EYE_RX;
    const ey = (dy - e.y - lookY) / ry;
    if (ex * ex + ey * ey <= 1) return null;
  }

  const nz = Math.sqrt(1 - d2);
  const lambert = Math.max(0, LIGHT.x * dx + LIGHT.y * dy + LIGHT.z * nz);
  return { kind: "face", value: Math.min(1, 0.1 + lambert) };
}

export interface Dot {
  readonly x: number;
  readonly y: number;
  readonly kind: DotKind;
}

/**
 * Every dot to draw for a Bruh in a `width` × `height` box, grid centered.
 * `reveal` below 1 keeps only that share of dots, in `revealNoise` order, for an
 * entrance; leave it at 1 when motion is reduced.
 */
export function bruhDots(width: number, height: number, face: BrailleBruh, grid: DotGrid, reveal = 1): Dot[] {
  const { pitch, gap } = grid;
  const cellW = pitch * 2 + gap;
  const cellH = pitch * 4 + gap;
  const cols = Math.ceil(width / cellW);
  const rows = Math.ceil(height / cellH);
  const ox = (width - cols * cellW + gap + pitch) / 2;
  const oy = (height - rows * cellH + gap + pitch) / 2;
  const minFeature = (pitch * 1.1) / face.r;
  const dots: Dot[] = [];
  for (let cr = 0; cr < rows; cr++) {
    for (let cc = 0; cc < cols; cc++) {
      for (let dr = 0; dr < 4; dr++) {
        for (let dc = 0; dc < 2; dc++) {
          const col = cc * 2 + dc;
          const row = cr * 4 + dr;
          if (reveal < 1 && revealNoise(col, row) > reveal) continue;
          const x = ox + cc * cellW + dc * pitch;
          const y = oy + cr * cellH + dr * pitch;
          const hit = sampleBruh(x, y, face, minFeature);
          if (hit && hit.value > ditherThreshold(col, row)) dots.push({ x, y, kind: hit.kind });
        }
      }
    }
  }
  return dots;
}

/** Defaults: the mascot's own colors, and a quiet longan halo. */
export const BRUH_DOT_COLORS: Readonly<Record<DotKind, string>> = {
  face: "var(--color-bruh-base)",
  mouth: "var(--color-bruh-mouth)",
  halo: "var(--color-longan-700)",
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
 * the `var(...)` defaults.
 */
export function drawDots(ctx: DotContext, width: number, height: number, dots: readonly Dot[], dot: number, colors: Readonly<Record<DotKind, string>>): void {
  ctx.clearRect(0, 0, width, height);
  for (const kind of ["halo", "face", "mouth"] as const) {
    ctx.beginPath();
    for (const d of dots) {
      if (d.kind !== kind) continue;
      ctx.moveTo(d.x + dot, d.y);
      ctx.arc(d.x, d.y, dot, 0, Math.PI * 2);
    }
    ctx.fillStyle = colors[kind];
    ctx.fill();
  }
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
