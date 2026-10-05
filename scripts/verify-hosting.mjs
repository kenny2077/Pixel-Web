import assert from 'node:assert/strict';
import { startServer } from '../server.mjs';
import { closeBrowser } from '../lib/capture.mjs';

process.env.PIXELWEB_PUBLIC_SERVICE = '1';
const server = await startServer({ port: 0, publicService: true, sessionMode: 'gateway' });
const base = `http://127.0.0.1:${server.address().port}`;
const first = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const post = (path, owner, value) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PixelWeb-Session': owner }, body: JSON.stringify(value) });
try {
  const response = await post('/api/convert', first, { url: 'https://example.com', width: 800, height: 600, textMode: 'all', cell: 2, colors: 32 });
  const capture = await response.json();
  assert.equal(response.status, 200, JSON.stringify(capture));
  assert.equal((await fetch(base + capture.previewUrl, { headers: { 'X-PixelWeb-Session': first } })).status, 200);
  assert.equal((await fetch(base + capture.previewUrl, { headers: { 'X-PixelWeb-Session': other } })).status, 404);
  assert.equal((await fetch(base + capture.originalUrl, { headers: { 'X-PixelWeb-Session': other } })).status, 404);
  assert.equal((await post('/api/interact', other, { id: capture.id, target: 'n1', kind: 'click' })).status, 404);
  assert.equal((await post('/api/style', other, { id: capture.id })).status, 404);
  assert.equal((await post('/api/style', first, { id: capture.id, textMode: 'headings', cell: 2, colors: 32 })).status, 200);
  console.log(JSON.stringify({ source: capture.url, hostedCapture: 'passed', crossSessionReads: 'blocked', crossSessionActions: 'blocked', totalMs: capture.timings.totalMs }));
} finally { await closeBrowser(); await new Promise(resolve => server.close(resolve)); }
