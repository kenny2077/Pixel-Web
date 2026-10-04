import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.PIXELWEB_URL || 'http://127.0.0.1:4173';
const targets = [
  { name: 'aurora-desktop', url: 'https://survival.auroraforgelab.com/', viewport: 'desktop' },
  { name: 'wikipedia-desktop', url: 'https://www.wikipedia.org/', viewport: 'desktop' },
  { name: 'aurora-mobile', url: 'https://survival.auroraforgelab.com/', viewport: 'mobile' },
];
const report = { recordedAt: new Date().toISOString(), algorithm: 'Lanczos resampling + weighted median-cut + integer pixel replication', aiCalls: 0, results: [] };
await mkdir('artifacts', { recursive: true });
for (const target of targets) {
  const response = await fetch(`${base}/api/convert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...target, cell: 4, colors: 24, textMode: 'headings' }) });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  const html = await (await fetch(base + result.previewUrl)).text();
  assert.ok(html.includes('data-pixel-text="headings"'));
  assert.ok(html.includes('data:image/png;base64,'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('/preview-client.js'));
  await writeFile(`artifacts/${target.name}.html`, html);
  await writeFile(`artifacts/${target.name}-original.html`, await (await fetch(base + result.originalUrl)).text());
  const styleResponse = await fetch(`${base}/api/style`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: result.id, cell: 7, colors: 8, textMode: 'all' }) });
  const style = await styleResponse.json();
  assert.equal(styleResponse.status, 200);
  await writeFile(`artifacts/${target.name}-bold.html`, await (await fetch(base + style.previewUrl)).text());
  report.results.push({ ...target, ...result, styleChangeMs: style.transformMs });
  console.log(JSON.stringify({ name: target.name, totalMs: result.timings.totalMs, imageProcessingMs: result.timings.transformMs, styleChangeMs: style.transformMs, images: result.images, backgrounds: result.backgrounds, warnings: result.warnings }));
}
await writeFile('artifacts/report.json', JSON.stringify(report, null, 2));
