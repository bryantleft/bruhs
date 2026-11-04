#!/usr/bin/env node
// Copy the Monaspace fonts that @bruhs/theme's @font-face rules load from /fonts/* into
// an app's public directory. Usage: bruhs-theme-fonts [target-dir] (default public/fonts).
// Unchanged files are skipped, so it is cheap to run before every dev server and build.

import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../fonts", import.meta.url));
const target = path.resolve(process.argv[2] ?? "public/fonts");

mkdirSync(target, { recursive: true });
let copied = 0;
for (const name of readdirSync(source)) {
  const from = path.join(source, name);
  const to = path.join(target, name);
  let current;
  try {
    current = statSync(to);
  } catch {
    current = undefined;
  }
  if (current?.size === statSync(from).size) continue;
  copyFileSync(from, to);
  copied += 1;
}
if (copied > 0) {
  console.log(`bruhs-theme-fonts: copied ${copied} file(s) to ${path.relative(process.cwd(), target) || "."}`);
}
