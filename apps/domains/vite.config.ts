import path from "node:path";
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';

export default defineConfig({
  plugins: [
    tanstackStart(),
    // React's Vite plugin must come after Start's.
    viteReact(),
    nitro({ preset: 'vercel' }),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "~": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 3000,
  },
})
