// The 1200×630 link preview, drawn at build time to match the page hero: banded sky, the
// title, and the town strip with the bruh. resvg renders it from the game's own font files
// with system fonts off, so the image never depends on the build machine.
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { palette } from '@outside/src/theme/palette.ts';
import type { APIRoute } from 'astro';
import { root } from 'astro:config/server';
import { HERO_TOP, HERO_WIDTH, heroParts } from '../lib/pixel';

const WIDTH = 1200;
const HEIGHT = 630;
// The game's ink (apps/outside theme color.ink): outlines and shadows.
const INK = '#0a0a0a';
// The strip shows the scene from HERO_TOP down, at the canvas's full width.
const STRIP_HEIGHT = Math.round(((48 - HERO_TOP) * WIDTH) / HERO_WIDTH);
const STRIP_TOP = HEIGHT - STRIP_HEIGHT;

function font(file: string): string {
  // From the project root: the bundled endpoint's own location changes between Astro versions.
  return fileURLToPath(new URL(`../outside/assets/fonts/${file}`, root));
}

// Outlined like the hero title: an ink stroke under the fill, plus a hard drop shadow.
function outlined(text: string, x: number, y: number, size: number, fill: string, stroke: number): string {
  const common = `x="${x}" font-family="Pixelify Sans Outside" font-weight="700" font-size="${size}"`;
  return [
    `<text ${common} y="${y + stroke}" dx="${stroke}" fill="${INK}" stroke="${INK}" stroke-width="${stroke * 2}" stroke-linejoin="miter">${text}</text>`,
    `<text ${common} y="${y}" fill="${fill}" stroke="${INK}" stroke-width="${stroke * 2}" stroke-linejoin="miter" paint-order="stroke">${text}</text>`,
  ].join('');
}

export const GET: APIRoute = () => {
  const { still, hop } = heroParts();
  // The page's CSS sky bands, ending in blueberry-200 where the strip's own sky begins.
  const bands = [
    [palette['blueberry-500'], 0, 0.28],
    [palette['blueberry-400'], 0.28, 0.56],
    [palette['blueberry-300'], 0.56, 0.82],
    [palette['blueberry-200'], 0.82, 1],
  ] as const;
  const sky = bands
    .map(
      ([fill, from, to]) => {
        // Round the edges, not the heights, so neighbouring bands meet without a seam.
        const top = Math.round(from * STRIP_TOP);
        return `<rect x="0" y="${top}" width="${WIDTH}" height="${Math.round(to * STRIP_TOP) - top}" fill="${fill}"/>`;
      },
    )
    .join('');
  const label = 'outside.bruhs.app';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    ${sky}
    <svg x="0" y="${STRIP_TOP}" width="${WIDTH}" height="${STRIP_HEIGHT}" viewBox="0 ${HERO_TOP} ${HERO_WIDTH} ${48 - HERO_TOP}" shape-rendering="crispEdges">${still}${hop[0]}</svg>
    ${outlined('outside', 72, 196, 156, palette['durian-400'], 7)}
    ${outlined('your steps are the only button.', 76, 292, 54, palette['rambutan-50'], 4)}
    <rect x="${WIDTH - 72 - 300}" y="44" width="300" height="48" fill="${palette['longan-900']}" stroke="${INK}" stroke-width="4"/>
    <text x="${WIDTH - 72 - 150}" y="77" text-anchor="middle" font-family="Silkscreen" font-size="22" fill="${palette['rambutan-100']}">${label}</text>
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
  return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/png' } });
};
