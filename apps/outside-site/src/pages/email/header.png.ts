// The waitlist emails' header, 1200×400 so it stays sharp at the email's 560px column on 2x
// screens: the page hero's sky, title and town, drawn by the same code as the link preview.
// Emails link it by this stable path (apps/api/convex/mail.ts), so keep the URL.
import { palette } from '@outside/src/theme/palette.ts';
import type { APIRoute } from 'astro';
import { bannerPng, outlined } from '../../lib/banner';

export const GET: APIRoute = () =>
  new Response(
    bannerPng(1200, 400, () =>
      [
        outlined('outside', 64, 138, 120, palette['durian-400'], 6),
        outlined('touch grass. level up.', 68, 198, 46, palette['rambutan-50'], 3),
      ].join(''),
    ),
    { headers: { 'Content-Type': 'image/png' } },
  );
