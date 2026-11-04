import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://outside.bruhs.app',
  trailingSlash: 'always',
  // Astro 7 defaults to 'jsx', which drops whitespace between inline elements. Keep v6 output.
  compressHTML: true,
  vite: {
    plugins: [tailwindcss()],
    // Sprites, scenes, game data and fonts come straight from the game, so the page never drifts
    // from the app. An alias, not a workspace dependency: that would make turbo build the Expo app
    // before every landing build.
    resolve: { alias: { '@outside': fileURLToPath(new URL('../outside', import.meta.url)) } },
  },
});
