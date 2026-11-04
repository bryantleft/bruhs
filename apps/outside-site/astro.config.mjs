import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://outside.bruhs.app',
  trailingSlash: 'always',
  vite: {
    plugins: [tailwindcss()],
    // Sprites, scenes, game data and fonts come straight from the game, so the page never drifts
    // from the app. An alias, not a workspace dependency: that would make turbo build the Expo app
    // before every landing build.
    resolve: { alias: { '@steps': fileURLToPath(new URL('../steps', import.meta.url)) } },
  },
});
