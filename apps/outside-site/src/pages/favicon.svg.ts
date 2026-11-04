import { bruhArt } from '@steps/src/pixel/art.ts';
import type { APIRoute } from 'astro';
import { spriteSvg } from '../lib/pixel';

export const GET: APIRoute = () =>
  new Response(spriteSvg(bruhArt('original'), 32).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), {
    headers: { 'Content-Type': 'image/svg+xml' },
  });
