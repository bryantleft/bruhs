import path from "node:path";
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import tsConfigPaths from 'vite-tsconfig-paths';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';

export default defineConfig({
  plugins: [
    tanstackStart({ target: 'vercel' }),
    tailwindcss(),
    tsConfigPaths(),
  ],
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 3000,
  },
})