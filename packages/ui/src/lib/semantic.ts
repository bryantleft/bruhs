/**
 * Semantic colour roles for surfaces that follow the system's light or dark appearance.
 * Native apps consume these first (through `bruhs-theme-swift`); the web theme is still
 * dark-only. Each role names a palette token per appearance, so the fruit scales stay the
 * single source of colour.
 */

export type TokenRef = string | { readonly token: string; readonly alpha: number };

export interface Role {
  readonly dark: TokenRef;
  readonly light: TokenRef;
  /** Used when the user turns on Increase Contrast. Falls back to the plain variant. */
  readonly darkHighContrast?: TokenRef;
  readonly lightHighContrast?: TokenRef;
  /** Minimum WCAG contrast on every background role, enforced by `verify-tokens`. */
  readonly minContrast?: number;
}

export const semanticColors = {
  /** A window's or panel's background, under its toolbar and content: the web theme's page canvas. */
  canvas: { dark: "longan-950", light: "longan-50" },
  /** A side panel beside the content, such as an inspector: the web theme's `surface-panel`. */
  surface: { dark: "longan-900", light: "longan-100" },
  text: { dark: "rambutan-100", light: "longan-950", minContrast: 4.5 },
  textSecondary: { dark: "rambutan-400", light: "longan-700", darkHighContrast: "rambutan-300", lightHighContrast: "longan-800", minContrast: 4.5 },
  textTertiary: { dark: "rambutan-500", light: "longan-600", darkHighContrast: "rambutan-400", lightHighContrast: "longan-700", minContrast: 3 },
  hairline: {
    dark: { token: "rambutan-100", alpha: 0.1 },
    light: { token: "longan-950", alpha: 0.1 },
    darkHighContrast: { token: "rambutan-100", alpha: 0.25 },
    lightHighContrast: { token: "longan-950", alpha: 0.25 },
  },
  /** A recessed area on the canvas, such as a folder on the disk map: the web theme's `surface-well`. */
  well: { dark: { token: "longan-900", alpha: 0.6 }, light: { token: "longan-100", alpha: 0.55 } },
  /**
   * A scroll bar's thumb, on no track: the web theme's thin scrollbar, with a light variant. 3:1 is WCAG's
   * contrast for parts of a control; `longan-500`, the lighter step, falls short of it on `surface`.
   */
  scrollbar: { dark: "longan-600", light: "longan-600", darkHighContrast: "longan-500", lightHighContrast: "longan-700", minContrast: 3 },
  /** The thumb while the pointer is over its scroll area or it's being dragged. */
  scrollbarHover: { dark: "longan-500", light: "longan-700", darkHighContrast: "longan-400", lightHighContrast: "longan-800", minContrast: 3 },
  /** Lines, marks and text links in the brand colour. */
  accent: { dark: "persimmon-400", light: "persimmon-700", minContrast: 3 },
  /** Filled primary controls, with `onAccentFill` for their labels. */
  accentFill: { dark: "persimmon-500", light: "persimmon-500" },
  onAccentFill: { dark: "longan-950", light: "longan-950" },
  accentSoft: { dark: { token: "persimmon-500", alpha: 0.16 }, light: { token: "persimmon-500", alpha: 0.14 } },
  accentSoftText: { dark: "persimmon-200", light: "persimmon-800", minContrast: 4.5 },
  selection: { dark: { token: "persimmon-500", alpha: 0.24 }, light: { token: "persimmon-500", alpha: 0.18 } },
  chartFill: { dark: { token: "persimmon-500", alpha: 0.16 }, light: { token: "persimmon-500", alpha: 0.14 } },
  statusNormal: { dark: "pandan-400", light: "pandan-700", minContrast: 3 },
  statusWarning: { dark: "durian-400", light: "durian-800", minContrast: 3 },
  statusCritical: { dark: "lychee-400", light: "lychee-700", minContrast: 3 },
  dangerSoft: { dark: { token: "lychee-500", alpha: 0.16 }, light: { token: "lychee-500", alpha: 0.12 } },
  dangerSoftText: { dark: "lychee-200", light: "lychee-800", minContrast: 4.5 },
} as const satisfies Record<string, Role>;

export type SemanticColor = keyof typeof semanticColors;

/** The roles other roles sit on. Each role with a `minContrast` must keep it on all of them. */
export const backgroundRoles = ["canvas", "surface"] as const satisfies readonly SemanticColor[];
