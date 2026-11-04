// The 1200×630 link preview, drawn at build time from the game's own scene and fonts. Text becomes
// vector paths from the game's TTF files, so the result never depends on the build machine's fonts.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { APIRoute } from 'astro';
import { root } from 'astro:config/server';
import opentype from 'opentype.js';
import sharp from 'sharp';
import { palette } from '@steps/src/theme/palette.ts';
import { sceneSvg } from '../lib/pixel';

const WIDTH = 1200;
const HEIGHT = 630;
const BAND = 190;
const SVG = 'xmlns="http://www.w3.org/2000/svg"';
// The game's ink (apps/steps theme color.ink): outlines and shadows.
const INK = '#0a0a0a';

async function loadFont(file: string): Promise<opentype.Font> {
  // From the project root: the bundled endpoint's own location changes between Astro versions.
  const path = fileURLToPath(new URL(`../steps/assets/fonts/${file}`, root));
  const bytes = await readFile(path);
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

type Line = Readonly<{ font: opentype.Font; text: string; size: number; x: number; y: number; fill: string }>;

function linePath({ font, text, size, x, y, fill }: Line, anchor: 'start' | 'end' = 'start'): string {
  const left = anchor === 'end' ? x - font.getAdvanceWidth(text, size) : x;
  // A 3px ink drop shadow, the headings' 2px scaled up for a 1200px card.
  const d = font.getPath(text, left, y, size).toPathData(2);
  const shadow = font.getPath(text, left + 3, y + 3, size).toPathData(2);
  return `<path d="${shadow}" fill="${INK}"/><path d="${d}" fill="${fill}"/>`;
}

export const GET: APIRoute = async () => {
  const [bold, label] = await Promise.all([loadFont('PixelifySans-Bold.ttf'), loadFont('Silkscreen-Regular.ttf')]);
  // The scene's 2:1 frame is 600 px tall at full width; trim sky so the band fits underneath.
  const sceneHeight = HEIGHT - BAND;
  const crop = Math.round(48 - (48 * sceneHeight) / 600);
  const scene = await sharp(
    Buffer.from(sceneSvg({ biome: 'town', skin: 'original' }, { width: WIDTH, crop })),
  )
    .resize(WIDTH, sceneHeight, { fit: 'cover', position: 'bottom', kernel: 'nearest' })
    .png()
    .toBuffer();
  const top = sceneHeight;
  const band = `<svg ${SVG} width="${WIDTH}" height="${HEIGHT}">
    <rect x="0" y="${top}" width="${WIDTH}" height="${BAND}" fill="${palette['longan-950']}"/>
    <rect x="0" y="${top}" width="${WIDTH}" height="4" fill="${INK}"/>
    ${linePath({ font: bold, text: 'outside', size: 96, x: 56, y: top + 104, fill: palette['durian-400'] })}
    ${linePath({ font: bold, text: 'your steps are the only button.', size: 36, x: 60, y: top + 158, fill: palette['rambutan-100'] })}
    ${linePath({ font: label, text: 'outside.bruhs.app', size: 22, x: WIDTH - 56, y: top + 92, fill: palette['rambutan-500'] }, 'end')}
  </svg>`;
  const image = await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: palette['longan-950'] } })
    .composite([
      { input: scene, top: 0, left: 0 },
      { input: Buffer.from(band), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
  return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/png' } });
};
