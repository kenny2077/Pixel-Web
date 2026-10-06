import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import * as serverModule from '../server.mjs';
import { getBrowser, closeBrowser } from '../lib/capture.mjs';

test('the converter shows the saved Pixel art example at once and honors a chosen URL', async () => {
  const server = await serverModule.startServer({ port: 0 });
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const requested = [], warmed = [];
    await page.route(`${base}/api/warm`, route => { warmed.push(true); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ready"}' }); });
    await page.route(`${base}/api/convert`, async route => {
      requested.push(route.request().postDataJSON().url);
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture stops before source capture.' }) });
    });
    await page.goto(base);
    await page.frameLocator('#preview-frame').locator('body[data-pixel-static="true"]').waitFor({ timeout: 5000 });
    assert.equal(await page.locator('#website-url').inputValue(), 'https://en.wikipedia.org/wiki/Pixel_art');
    assert.equal(requested.length, 0);
    assert.equal(warmed.length, 1);
    await page.locator('#convert').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Fixture'), null, { timeout: 3000 });
    assert.equal(requested[0], 'https://en.wikipedia.org/wiki/Pixel_art');
    await page.goto(`${base}/?url=https%3A%2F%2Fexample.com%2F`);
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Fixture'), null, { timeout: 3000 });
    assert.equal(requested[1], 'https://example.com/');
  } finally { await page.close(); await closeBrowser(); await new Promise(resolve => server.close(resolve)); }
});

test('text responses are gzip-compressed and the saved example is served precompressed', async () => {
  const server = await serverModule.startServer({ port: 0 });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const { request } = await import('node:http');
    const get = (path, encoding) => new Promise((resolve, reject) => request(`${base}${path}`, { headers: encoding ? { 'Accept-Encoding': encoding } : {} }, response => {
      const parts = []; response.on('data', part => parts.push(part)); response.on('end', () => resolve({ headers: response.headers, body: Buffer.concat(parts) }));
    }).on('error', reject).end());
    const script = await get('/app.mjs', 'gzip');
    assert.equal(script.headers['content-encoding'], 'gzip');
    assert.match(gunzipSync(script.body).toString(), /showcase/);
    const example = await get('/showcase/pixel-art-desktop.html', 'gzip');
    assert.equal(example.headers['content-encoding'], 'gzip');
    assert.match(example.headers['content-security-policy'], /default-src 'none'/);
    const plain = await get('/showcase/pixel-art-desktop.html');
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.match(plain.body.toString('utf8', 0, 200), /^<!doctype html>/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('conversion API rejects private URLs before browser work and rejects cross-origin POST', async () => {
  assert.equal(typeof serverModule.startServer, 'function');
  const server = await serverModule.startServer({ port: 0 });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const privateResult = await fetch(`${base}/api/convert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'http://127.0.0.1' }) });
    assert.equal(privateResult.status, 400);
    assert.match((await privateResult.json()).error, /public/);
    const originResult = await fetch(`${base}/api/convert`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' }, body: JSON.stringify({ url: 'https://example.com' }) });
    assert.equal(originResult.status, 403);
    const httpsResult = await fetch(`${base}/api/missing`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `https://127.0.0.1:${server.address().port}` }, body: '{}' });
    assert.equal(httpsResult.status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('hosted API requires a gateway session while health checks remain available', async () => {
  const server = await serverModule.startServer({ port: 0, publicService: true, sessionMode: 'gateway' });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/convert`, { method: 'POST', body: '{}' })).status, 403);
    const result = await fetch(`${base}/api/style`, { method: 'POST', headers: { 'X-PixelWeb-Session': '11111111-1111-1111-1111-111111111111' }, body: JSON.stringify({ id: 'missing' }) });
    assert.equal(result.status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('a source access refusal offers the original website rather than an empty retry loop', async () => {
  const server = await serverModule.startServer({ port: 0 });
  const context = await (await getBrowser()).newContext();
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const sourceUrl = 'https://www.linkedin.com/in/kaiyi-guo-917462290/';
    await context.route(`${base}/api/convert`, route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'This website denied access to the converter (HTTP 999).', code: 'SOURCE_ACCESS_DENIED', sourceStatus: 999, sourceUrl }) }));
    const page = await context.newPage();
    await page.goto(`${base}/?url=${encodeURIComponent(sourceUrl)}`);
    const link = page.getByRole('link', { name: 'Open original', exact: true });
    await link.waitFor();
    assert.equal(await link.getAttribute('href'), sourceUrl);
    assert.equal(await link.getAttribute('aria-disabled'), 'false');
    assert.ok(await page.getByRole('button', { name: 'Convert', exact: true }).isEnabled());
  } finally { await context.close(); await closeBrowser(); await new Promise(resolve => server.close(resolve)); }
});
