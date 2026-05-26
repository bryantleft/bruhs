import path from "node:path";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// This is a local-first desktop-style tool: it spawns a native scanner binary and
// touches the filesystem, so it targets a Node server (not serverless).
export default defineConfig({
  plugins: [
    tanstackStart({ target: "node-server" }),
    tailwindcss(),
    tsConfigPaths(),
  ],
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 3001,
  },
});
