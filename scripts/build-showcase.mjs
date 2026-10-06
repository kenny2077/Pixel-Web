// Saves a converted page that the converter shows instantly before any live conversion.
// Run after changing capture or preview output: node scripts/build-showcase.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { captureWebsite, transformArtwork, closeBrowser } from '../lib/capture.mjs';
import { renderPreview } from '../lib/preview.mjs';

const url = 'https://en.wikipedia.org/wiki/Pixel_art';
const options = { cell: 2, colors: 32, dither: false, textMode: 'all' };
const variants = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 780 } };
const directory = new URL('../public/showcase/', import.meta.url);
const info = { url, generated: new Date().toISOString().slice(0, 10) };
await mkdir(directory, { recursive: true });
try {
  for (const [name, { width, height }] of Object.entries(variants)) {
    const capture = await captureWebsite(url, width, { live: true, height });
    try {
      const artwork = await transformArtwork(capture, options);
      // A static page scrolls in place and asks the converter to load the live source for controls.
      const html = renderPreview(capture.snapshot, { ...artwork, textMode: options.textMode }).replace('<body', '<body data-pixel-static="true"');
      const file = `pixel-art-${name}.html`;
      await writeFile(new URL(`${file}.gz`, directory), gzipSync(html, { level: 9 }));
      info.title = capture.snapshot.title;
      info[name] = { file, width, viewportHeight: height, height: capture.snapshot.height };
      console.log(`${file}: ${(html.length / 1e6).toFixed(2)} MB, ${capture.snapshot.elements} elements`);
    } finally { await capture.session?.close(); }
  }
  await writeFile(new URL('pixel-art.json', directory), `${JSON.stringify(info, null, 2)}\n`);
} finally { await closeBrowser(); }
