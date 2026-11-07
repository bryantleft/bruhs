// Renders the app icons from the bruh sprite the game and outside.bruhs.app draw (bruhArt), so
// the icon is the same pixel logo. Each sprite pixel becomes a whole square of icon pixels, with
// no smoothing. Run: pnpm render:icon
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { bruhArt } from '../src/pixel/art.ts';
import { palette } from '../src/theme/palette.ts';

const ASSETS = new URL('../assets/', import.meta.url);
const LOGO = bruhArt('original');
const BACKGROUND = palette['longan-950'];

type Icon = Readonly<{ file: string; size: number; scale: number; background: boolean }>;

// scale is icon pixels per sprite pixel. iOS masks the 1024 icon itself, so the bruh fills
// 640 of it. Android shows only the middle of the adaptive foreground and may crop it to a
// circle, so the bruh stays inside the 66% safe zone. The splash and favicon draw it whole.
const ICONS: readonly Icon[] = [
  { file: 'icon.png', size: 1024, scale: 40, background: true },
  { file: 'adaptive-icon.png', size: 1024, scale: 36, background: false },
  { file: 'splash-icon.png', size: 256, scale: 16, background: false },
  { file: 'favicon.png', size: 64, scale: 3, background: true },
];

function rgba(hex: string): readonly [number, number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// An 8-bit PNG: RGBA, or RGB when the icon is opaque, since App Store Connect rejects an icon
// with an alpha channel. Every row starts with filter byte 0 (none).
function png(size: number, pixels: Uint8Array, opaque: boolean): Buffer {
  const channels = opaque ? 3 : 4;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, opaque ? 2 : 6, 0, 0, 0], 8);
  const stride = size * channels + 1;
  const rows = Buffer.alloc(size * stride);
  for (let i = 0; i < size * size; i += 1) {
    const at = Math.floor(i / size) * stride + 1 + (i % size) * channels;
    rows.set(pixels.subarray(i * 4, i * 4 + channels), at);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// The drawn part of the sprite: the bruh's 16px grid leaves its bottom row empty, and the icon
// centres what's drawn, not the grid.
function bounds(): Readonly<{ x: number; y: number; w: number; h: number }> {
  const drawn = LOGO.rows.flatMap((row, y) => [...row].flatMap((key, x) => (key === '.' ? [] : [{ x, y }])));
  const xs = drawn.map((p) => p.x);
  const ys = drawn.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
}

function render({ size, scale, background }: Icon): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  if (background) {
    const fill = rgba(BACKGROUND);
    for (let i = 0; i < size * size; i += 1) pixels.set(fill, i * 4);
  }
  const box = bounds();
  if (box.w * scale > size || box.h * scale > size)
    throw new Error(`The bruh at ${scale}x is bigger than the ${size}px icon.`);
  const left = Math.floor((size - box.w * scale) / 2) - box.x * scale;
  const top = Math.floor((size - box.h * scale) / 2) - box.y * scale;
  LOGO.rows.forEach((row, y) => {
    [...row].forEach((key, x) => {
      const color = LOGO.colors[key];
      if (key === '.' || !color) return;
      const fill = rgba(color);
      for (let dy = 0; dy < scale; dy += 1)
        for (let dx = 0; dx < scale; dx += 1)
          pixels.set(fill, ((top + y * scale + dy) * size + left + x * scale + dx) * 4);
    });
  });
  return pixels;
}

for (const icon of ICONS) {
  writeFileSync(new URL(icon.file, ASSETS), png(icon.size, render(icon), icon.background));
  console.log(`wrote assets/${icon.file}`);
}
