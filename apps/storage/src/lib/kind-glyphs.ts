/**
 * Each file kind's glyph: the cue that doesn't need colour, which the disk map draws on file blocks, and By kind beside
 * each kind, while macOS's Differentiate Without Color is on, so one glyph means one kind in both places. They're
 * Heroicons Micro, bruhs's icon set for app interfaces (packages/ui/AGENTS.md), solid, in a 16 px box: Heroicons is
 * MIT licensed, copyright Tailwind Labs, Inc.
 */

import type { Category } from "./format.ts";

/** The side of the box the glyphs' paths are drawn in. */
export const GLYPH_BOX = 16;

/** A path of a glyph, as SVG path data, and whether it fills by the even-odd rule, which cuts its holes. */
export interface GlyphPath {
  readonly d: string;
  readonly evenOdd: boolean;
}

export const KIND_GLYPHS: Readonly<Record<Category, readonly GlyphPath[]>> = {
  // code-bracket
  code: [
    {
      evenOdd: true,
      d: "M4.78 4.97a.75.75 0 0 1 0 1.06L2.81 8l1.97 1.97a.75.75 0 1 1-1.06 1.06l-2.5-2.5a.75.75 0 0 1 0-1.06l2.5-2.5a.75.75 0 0 1 1.06 0ZM11.22 4.97a.75.75 0 0 0 0 1.06L13.19 8l-1.97 1.97a.75.75 0 1 0 1.06 1.06l2.5-2.5a.75.75 0 0 0 0-1.06l-2.5-2.5a.75.75 0 0 0-1.06 0ZM8.856 2.008a.75.75 0 0 1 .636.848l-1.5 10.5a.75.75 0 0 1-1.484-.212l1.5-10.5a.75.75 0 0 1 .848-.636Z",
    },
  ],
  // photo
  image: [
    {
      evenOdd: true,
      d: "M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm10.5 5.707a.5.5 0 0 0-.146-.353l-1-1a.5.5 0 0 0-.708 0L9.354 9.646a.5.5 0 0 1-.708 0L6.354 7.354a.5.5 0 0 0-.708 0l-2 2a.5.5 0 0 0-.146.353V12a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V9.707ZM12 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
    },
  ],
  // play
  video: [
    {
      evenOdd: false,
      d: "M3 3.732a1.5 1.5 0 0 1 2.305-1.265l6.706 4.267a1.5 1.5 0 0 1 0 2.531l-6.706 4.268A1.5 1.5 0 0 1 3 12.267V3.732Z",
    },
  ],
  // musical-note
  audio: [
    {
      evenOdd: false,
      d: "M14 1.75a.75.75 0 0 0-.89-.737l-7.502 1.43a.75.75 0 0 0-.61.736v2.5c0 .018 0 .036.002.054V9.73a1 1 0 0 1-.813.983l-.58.11a1.978 1.978 0 0 0 .741 3.886l.603-.115c.9-.171 1.55-.957 1.55-1.873v-1.543l-.001-.043V6.3l6-1.143v3.146a1 1 0 0 1-.813.982l-.584.111a1.978 1.978 0 0 0 .74 3.886l.326-.062A2.252 2.252 0 0 0 14 11.007V1.75Z",
    },
  ],
  // document-text
  document: [
    {
      evenOdd: true,
      d: "M4 2a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V6.621a1.5 1.5 0 0 0-.44-1.06L9.94 2.439A1.5 1.5 0 0 0 8.878 2H4Zm1 5.75A.75.75 0 0 1 5.75 7h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 7.75Zm0 3a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z",
    },
  ],
  // archive-box
  archive: [
    {
      evenOdd: false,
      d: "M3 2a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H3Z",
    },
    {
      evenOdd: true,
      d: "M3 6h10v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Zm3 2.75A.75.75 0 0 1 6.75 8h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 6 8.75Z",
    },
  ],
  // cube
  binary: [
    {
      evenOdd: false,
      d: "M8.372 1.349a.75.75 0 0 0-.744 0l-4.81 2.748L8 7.131l5.182-3.034-4.81-2.748ZM14 5.357 8.75 8.43v6.005l4.872-2.784A.75.75 0 0 0 14 11V5.357ZM7.25 14.435V8.43L2 5.357V11c0 .27.144.518.378.651l4.872 2.784Z",
    },
  ],
  // question-mark-circle
  other: [
    {
      evenOdd: true,
      d: "M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0Zm-6 3.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM7.293 5.293a1 1 0 1 1 .99 1.667c-.459.134-1.033.566-1.033 1.29v.25a.75.75 0 1 0 1.5 0v-.115a2.5 2.5 0 1 0-2.518-4.153.75.75 0 1 0 1.061 1.06Z",
    },
  ],
};
