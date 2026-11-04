// The 1200×630 link preview, drawn at build time from the game's own scene and fonts. Text becomes
// vector paths from the game's TTF files, so the result never depends on the build machine's fonts.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { APIRoute } from 'astro';
import { root } from 'astro:config/server';
import opentype from 'opentype.js';
import sharp from 'sharp';
import { sceneSvg } from '../lib/pixel';

const WIDTH = 1200;
const HEIGHT = 630;
const BAND = 190;
const SVG = 'xmlns="http://www.w3.org/2000/svg"';

async function loadFont(file: string): Promise<opentype.Font> {
  // From the project root: the bundled endpoint's own location changes between Astro versions.
  const path = fileURLToPath(new URL(`../steps/assets/fonts/${file}`, root));
  const bytes = await readFile(path);
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

type Line = Readonly<{ font: opentype.Font; text: string; size: number; x: number; y: number; fill: string }>;

function linePath({ font, text, size, x, y, fill }: Line, anchor: 'start' | 'end' = 'start'): string {
  const left = anchor === 'end' ? x - font.getAdvanceWidth(text, size) : x;
  // A 2px ink drop shadow, as on the game's headings.
  const d = font.getPath(text, left, y, size).toPathData(2);
  const shadow = font.getPath(text, left + 3, y + 3, size).toPathData(2);
  return `<path d="${shadow}" fill="#0a0a0a"/><path d="${d}" fill="${fill}"/>`;
}

export const GET: APIRoute = async () => {
  const [bold, label] = await Promise.all([loadFont('PixelifySans-Bold.ttf'), loadFont('Silkscreen-Regular.ttf')]);
  // The scene's 2:1 frame is 600 px tall at full width; trim sky so the band fits underneath.
  const sceneHeight = HEIGHT - BAND;
  const crop = Math.round(48 - (48 * sceneHeight) / 600);
  const scene = await sharp(
    Buffer.from(sceneSvg({ biome: 'town', skin: 'original' }, { width: WIDTH, crop }).replace('<svg ', `<svg ${SVG} `)),
  )
    .resize(WIDTH, sceneHeight, { fit: 'cover', position: 'bottom', kernel: 'nearest' })
    .png()
    .toBuffer();
  const top = sceneHeight;
  const band = `<svg ${SVG} width="${WIDTH}" height="${HEIGHT}">
    <rect x="0" y="${top}" width="${WIDTH}" height="${BAND}" fill="#15110d"/>
    <rect x="0" y="${top}" width="${WIDTH}" height="4" fill="#0a0a0a"/>
    ${linePath({ font: bold, text: 'outside', size: 96, x: 56, y: top + 104, fill: '#f6e296' })}
    ${linePath({ font: bold, text: 'your steps are the only button.', size: 36, x: 60, y: top + 158, fill: '#f5ede7' })}
    ${linePath({ font: label, text: 'outside.bruhs.app', size: 22, x: WIDTH - 56, y: top + 92, fill: '#ab998f' }, 'end')}
  </svg>`;
  const image = await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: '#15110d' } })
    .composite([
      { input: scene, top: 0, left: 0 },
      { input: Buffer.from(band), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
  return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/png' } });
};
