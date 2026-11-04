import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Astro 7 changed the default to 'jsx', which strips whitespace between
  // inline elements; keep the Astro 5 output.
  compressHTML: true,
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
  },
});