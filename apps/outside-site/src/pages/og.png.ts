// The 1200×630 link preview, drawn at build time to match the page hero: banded sky, the
// title, and the town strip with the bruh.
import { palette } from '@outside/src/theme/palette.ts';
import type { APIRoute } from 'astro';
import { bannerPng, INK, outlined } from '../lib/banner';

const WIDTH = 1200;
const HEIGHT = 630;

export const GET: APIRoute = () => {
  const label = 'outside.bruhs.app';
  const image = bannerPng(WIDTH, HEIGHT, () =>
    [
      outlined('outside', 72, 196, 156, palette['durian-400'], 7),
      outlined('touch grass. level up.', 76, 292, 54, palette['rambutan-50'], 4),
      `<rect x="${WIDTH - 72 - 300}" y="44" width="300" height="48" fill="${palette['longan-900']}" stroke="${INK}" stroke-width="4"/>`,
      `<text x="${WIDTH - 72 - 150}" y="77" text-anchor="middle" font-family="Silkscreen" font-size="22" fill="${palette['rambutan-100']}">${label}</text>`,
    ].join(''),
  );
  return new Response(image, { headers: { 'Content-Type': 'image/png' } });
};
