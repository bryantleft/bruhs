/**
 * Geometry of the Bruh mascot, in the units of its 600×600 SVG viewBox. Shared so every
 * rendering of the logo (React, Astro, generated code samples) draws the same face.
 * Plain data with no runtime dependencies.
 */

export type BruhVariant = "left" | "original" | "right";

export type Point = { readonly x: number; readonly y: number };

export interface BruhFace {
  readonly leftEye: Point;
  readonly rightEye: Point;
  readonly mouth: Point;
}

export const bruhGeometry = {
  viewBox: "0 0 600 600",
  base: { cx: 300, cy: 300, r: 300 },
  /** Eye ellipse radii (both eyes). */
  eye: { rx: 40, ry: 10 },
  /** Mouth ellipse radii. */
  mouth: { rx: 120, ry: 10 },
  /** Where the face points in each variant. */
  faces: {
    left: {
      leftEye: { x: 97, y: 209 },
      rightEye: { x: 300, y: 209 },
      mouth: { x: 191, y: 364 },
    },
    original: {
      leftEye: { x: 198, y: 223 },
      rightEye: { x: 401, y: 223 },
      mouth: { x: 307, y: 378 },
    },
    right: {
      leftEye: { x: 300, y: 209 },
      rightEye: { x: 503, y: 209 },
      mouth: { x: 409, y: 364 },
    },
  } satisfies Record<BruhVariant, BruhFace>,
} as const;
