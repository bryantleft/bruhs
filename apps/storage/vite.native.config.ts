import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  root: path.resolve(import.meta.dirname, "native-web"),
  publicDir: path.resolve(import.meta.dirname, "public"),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "~": path.resolve(import.meta.dirname, "src") } },
  build: {
    outDir: path.resolve(import.meta.dirname, "native/.build/web"),
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
