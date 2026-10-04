import { writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { captureWebsite, transformArtwork, closeBrowser } from '../lib/capture.mjs';

const label = process.argv[2] || 'current';
const result = { recordedAt: new Date().toISOString(), label, artwork: [], sites: [] };
const bytes = await sharp({ create: { width: 1200, height: 800, channels: 4, background: '#296285' } }).png().toBuffer();
for (let run = 0; run < 3; run++) {
  const capture = { snapshot: { images: Array.from({ length: 12 }, (_, i) => ({ id: `image-${i}`, width: 600, height: 400 })) }, imageSources: new Map(Array.from({ length: 12 }, (_, i) => [`image-${i}`, Buffer.from(bytes)])), backgroundSources: new Map(), warnings: [] };
  const output = await transformArtwork(capture, { cell: 2, colors: 32, textMode: run ? 'all' : 'headings' });
  result.artwork.push({ run, transformMs: output.transformMs, cacheHits: output.cacheHits || 0 });
}
try {
  for (const url of ['https://survival.auroraforgelab.com/', 'https://en.wikipedia.org/wiki/Gilles_Brassard']) {
    const capture = await captureWebsite(url, 1280, { live: true, height: 800 });
    try {
      const artwork = await transformArtwork(capture, { cell: 2, colors: 32, textMode: 'all' });
      result.sites.push({ url, timings: capture.timings, transformMs: artwork.transformMs, images: capture.snapshot.images.length, elements: capture.snapshot.elements, height: capture.snapshot.height, warnings: capture.warnings });
    } finally { await capture.session?.close(); }
  }
} finally { await closeBrowser(); }
await mkdir('artifacts', { recursive: true });
await writeFile(`artifacts/performance-${label}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
