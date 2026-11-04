import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel";
import react from "@astrojs/react";

export default defineConfig({
  // Astro 7 changed the default to 'jsx', which strips whitespace between
  // inline elements; keep the Astro 5 output.
  compressHTML: true,
  adapter: vercel(),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});