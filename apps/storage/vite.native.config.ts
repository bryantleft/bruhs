import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const build = path.resolve(import.meta.dirname, "native/.build");
const require = createRequire(import.meta.url);

/**
 * Packages whose code reaches the page's stylesheet rather than a chunk, by the banner each leaves in it: Tailwind
 * writes its preflight into pith.css under `/*! tailwindcss v4… *\/`, though no module of it is in a chunk. Each one
 * whose banner is there is listed by its package.json, so the notices carry its licence too.
 */
const STYLESHEET_PACKAGES = ["tailwindcss"];

/**
 * Writes the modules the page's bundle holds code from to native/.build/web-modules.json, beside the page rather than
 * in it, for scripts/third-party-notices.mjs: pith.js carries npm packages whose legal comments the minifier drops, and
 * the app carries their licences instead. A module tree-shaken away to nothing ships nothing, so it isn't listed.
 */
function bundledModules(): Plugin {
  return {
    name: "pith-bundled-modules",
    apply: "build",
    // Once everything is written, so the stylesheet Vite emits late is in the bundle too.
    writeBundle(_, bundle) {
      const items = Object.values(bundle);
      const modules = items.flatMap((item) =>
        item.type === "chunk"
          ? Object.entries(item.modules)
              .filter(([, module]) => module.renderedLength > 0)
              .map(([id]) => id)
          : [],
      );
      const styles = items.flatMap((item) =>
        item.type === "asset" && item.fileName.endsWith(".css")
          ? [
              typeof item.source === "string"
                ? item.source
                : new TextDecoder().decode(item.source),
            ]
          : [],
      );
      const styled = STYLESHEET_PACKAGES.filter((name) =>
        styles.some((css) => css.includes(`/*! ${name} v`)),
      ).map((name) => require.resolve(`${name}/package.json`));
      mkdirSync(build, { recursive: true });
      writeFileSync(
        path.join(build, "web-modules.json"),
        `${JSON.stringify([...modules, ...styled].sort(), null, 2)}\n`,
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
