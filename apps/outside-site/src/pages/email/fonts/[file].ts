// The game's fonts at stable URLs for the waitlist emails' @font-face (Apple Mail and iOS Mail
// load them; clients that don't fall back to monospace). The page itself uses Astro's hashed
// copies, which change with every font update, so emails can't point at those.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { APIRoute, GetStaticPaths } from 'astro';
import { root } from 'astro:config/server';

const FONTS = {
  'pixelify-sans-regular.ttf': 'PixelifySans-Regular.ttf',
  'pixelify-sans-bold.ttf': 'PixelifySans-Bold.ttf',
} as const;

export const getStaticPaths = (() =>
  Object.entries(FONTS).map(([file, source]) => ({ params: { file }, props: { source } }))) satisfies GetStaticPaths;

export const GET: APIRoute<{ source: string }> = async ({ props }) => {
  const bytes = await readFile(fileURLToPath(new URL(`../outside/assets/fonts/${props.source}`, root)));
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'font/ttf' } });
};
