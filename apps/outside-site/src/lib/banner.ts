// Build-time PNGs of the page hero: banded sky over the town strip with the bruh, plus
// whatever text the caller lays on the sky. resvg renders them from the game's own font files
// with system fonts off, so the images never depend on the build machine. Used by the link
// preview (og.png) and the waitlist email header (email/header.png).
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { palette } from '@outside/src/theme/palette.ts';
import { root } from 'astro:config/server';
import { HERO_TOP, HERO_WIDTH, heroParts } from './pixel';

// The game's ink (apps/outside theme color.ink, the bruh-eye token): outlines and shadows.
export const INK = palette['bruh-eye'];

function font(file: string): string {
  // From the project root: the bundled endpoint's own location changes between Astro versions.
  return fileURLToPath(new URL(`../outside/assets/fonts/${file}`, root));
}

// Outlined like the hero title: an ink stroke under the fill, plus a hard drop shadow.
export function outlined(text: string, x: number, y: number, size: number, fill: string, stroke: number): string {
  const common = `x="${x}" font-family="Pixelify Sans Outside" font-weight="700" font-size="${size}"`;
  return [
    `<text ${common} y="${y + stroke}" dx="${stroke}" fill="${INK}" stroke="${INK}" stroke-width="${stroke * 2}" stroke-linejoin="miter">${text}</text>`,
    `<text ${common} y="${y}" fill="${fill}" stroke="${INK}" stroke-width="${stroke * 2}" stroke-linejoin="miter" paint-order="stroke">${text}</text>`,
  ].join('');
}

// `sky` is SVG markup drawn over the sky; `stripTop` tells it where the town begins.
export function bannerPng(width: number, height: number, sky: (stripTop: number) => string): Uint8Array<ArrayBuffer> {
  const { still, hop } = heroParts();
  // The strip shows the scene from HERO_TOP down, at the canvas's full width.
  const stripHeight = Math.round(((48 - HERO_TOP) * width) / HERO_WIDTH);
  const stripTop = height - stripHeight;
  if (stripTop <= 0) throw new Error(`bannerPng: ${width}×${height} leaves no sky above the town strip.`);
  // The page's CSS sky bands, ending in blueberry-200 where the strip's own sky begins.
  const bands = [
    [palette['blueberry-500'], 0, 0.28],
    [palette['blueberry-400'], 0.28, 0.56],
    [palette['blueberry-300'], 0.56, 0.82],
    [palette['blueberry-200'], 0.82, 1],
  ] as const;
  const bandRects = bands
    .map(([fill, from, to]) => {
      // Round the edges, not the heights, so neighbouring bands meet without a seam.
      const top = Math.round(from * stripTop);
      return `<rect x="0" y="${top}" width="${width}" height="${Math.round(to * stripTop) - top}" fill="${fill}"/>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${bandRects}
    <svg x="0" y="${stripTop}" width="${width}" height="${stripHeight}" viewBox="0 ${HERO_TOP} ${HERO_WIDTH} ${48 - HERO_TOP}" shape-rendering="crispEdges">${still}${hop[0]}</svg>
    ${sky(stripTop)}
  </svg>`;
  const image = new Resvg(svg, {
    font: {
      fontFiles: [font('PixelifySans-Bold.ttf'), font('Silkscreen-Regular.ttf')],
      loadSystemFonts: false,
      defaultFontFamily: 'Pixelify Sans Outside',
    },
  })
    .render()
    .asPng();
  return new Uint8Array(image);
}
