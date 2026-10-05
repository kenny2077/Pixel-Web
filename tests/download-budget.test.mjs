import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { getBrowser, closeBrowser } from '../lib/capture.mjs';
import { watchDownloads } from '../lib/download-budget.mjs';

test('a chunked oversized stylesheet is stopped during download', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); return response.end('<link rel="stylesheet" href="/large.css"><p>Fixture</p>'); }
    response.setHeader('Content-Type', 'text/css');
    let chunks = 0;
    const timer = setInterval(() => { response.write('p{color:red}\n'.repeat(2048)); if (++chunks === 30) { clearInterval(timer); response.end(); } }, 10);
    response.on('close', () => clearInterval(timer));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const context = await (await getBrowser()).newContext();
  try {
    const page = await context.newPage();
    const budget = await watchDownloads(page, { maxResourceBytes: 40_000 });
    const closed = page.waitForEvent('close', { timeout: 5000 });
    await page.goto(`http://127.0.0.1:${server.address().port}/`).catch(() => {});
    await closed;
    assert.match(budget.error.message, /download limit/);
  } finally { await context.close(); await closeBrowser(); await new Promise(resolve => server.close(resolve)); }
});
