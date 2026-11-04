import path from "node:path";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// This is a local-first desktop-style tool: it spawns a native scanner binary and
// touches the filesystem, so it targets a Node server (not serverless).
export default defineConfig({
  plugins: [
    tanstackStart(),
    // React's Vite plugin must come after Start's.
    viteReact(),
    nitro({ preset: "node-server" }),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "~": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 3001,
  },
});
