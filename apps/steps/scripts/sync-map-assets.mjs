import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const packagePath = require.resolve('maplibre-gl/package.json');
const { version } = JSON.parse(await readFile(packagePath, 'utf8'));
const target = new URL(`../public/maplibre/${version}/`, import.meta.url);
await mkdir(target, { recursive: true });
// MapLibre 6 uses a separate module worker. Serve the installed version locally.
await Promise.all(['maplibre-gl-worker.mjs', 'maplibre-gl.css'].map((name) =>
  copyFile(join(dirname(packagePath), 'dist', name), new URL(name, target)),
));
