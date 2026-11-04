import { bruhArt } from '@steps/src/pixel/art.ts';
import type { APIRoute } from 'astro';
import { spriteSvg } from '../lib/pixel';

export const GET: APIRoute = () =>
  new Response(spriteSvg(bruhArt('original'), 32), {
    headers: { 'Content-Type': 'image/svg+xml' },
  });
