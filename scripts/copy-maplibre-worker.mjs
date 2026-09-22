// MapLibre 6 starts its web worker from a file next to its own module
// (import.meta.url). A bundler does not copy that file, so it is served from
// public/maplibre instead and the map points at it with setWorkerUrl
// (src/components/map/MapCanvas.tsx). Run on every install, so the copy always
// matches the installed version.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'maplibre-gl', 'dist');
const to = join(root, 'public', 'maplibre');

if (!existsSync(from)) {
  console.warn('maplibre-gl is not installed; skipping the worker copy.');
  process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(join(from, file), join(to, file));
}
console.log('Copied the MapLibre worker to public/maplibre.');
