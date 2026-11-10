import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const build = path.resolve(import.meta.dirname, "native/.build");

/**
 * Writes the modules the page's bundle holds code from to native/.build/web-modules.json, beside the page rather than
 * in it, for scripts/third-party-notices.mjs: pith.js carries npm packages whose legal comments the minifier drops, and
 * the app carries their licences instead. A module tree-shaken away to nothing ships nothing, so it isn't listed.
 */
function bundledModules(): Plugin {
  return {
    name: "pith-bundled-modules",
    apply: "build",
    generateBundle(_, bundle) {
      const modules = Object.values(bundle).flatMap((item) =>
        item.type === "chunk"
          ? Object.entries(item.modules)
              .filter(([, module]) => module.renderedLength > 0)
              .map(([id]) => id)
          : [],
      );
      mkdirSync(build, { recursive: true });
      writeFileSync(
        path.join(build, "web-modules.json"),
        `${JSON.stringify(modules.sort(), null, 2)}\n`,
      );
    },
  };
}

export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  root: path.resolve(import.meta.dirname, "native-web"),
  publicDir: path.resolve(import.meta.dirname, "public"),
  plugins: [react(), tailwindcss(), bundledModules()],
  resolve: { alias: { "~": path.resolve(import.meta.dirname, "src") } },
  build: {
    outDir: path.join(build, "web"),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(import.meta.dirname, "native-web/main.tsx"),
      name: "PithDisk",
      formats: ["iife"],
      fileName: () => "pith.js",
      cssFileName: "pith",
    },
  },
});
