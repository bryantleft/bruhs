import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel";
import preact from "@astrojs/preact";

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [preact()],
  adapter: vercel(),
});