import { renderPdfDocument } from './lib/pdf.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { cookieSession } from './lib/session.mjs';
import { captureWebsite, transformArtwork, closeBrowser, warmCapture } from './lib/capture.mjs';
import { normalizeUrl } from './lib/urls.mjs';
import { renderOriginal, renderPreview } from './lib/preview.mjs';
import { performInteraction } from './lib/interaction.mjs';
import { createQueue } from './lib/queue.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' };
const optionsFrom = input => ({ cell: Math.max(2, Math.min(8, Math.round(Number(input.cell) || 4))), colors: Math.max(8, Math.min(32, Math.round(Number(input.colors) || 24))), dither: !!input.dither, textMode: ['headings', 'all', 'original'].includes(input.textMode) ? input.textMode : 'all' });
const json = (response, status, value) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };
const gzipAsync = promisify(gzip), gunzipAsync = promisify(gunzip);
const previewPolicy = "default-src 'none'; img-src data: 'self'; style-src 'unsafe-inline'; font-src data: 'self'; script-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'";
// Previews inline their artwork and are several megabytes; hosts without an edge proxy do not compress them.
async function sendText(request, response, headers, body, { compressed = false } = {}) {
  const accepts = /\bgzip\b/.test(request.headers['accept-encoding'] || '');
  if (compressed && !accepts) body = await gunzipAsync(body);
  else if (!compressed && accepts && Buffer.byteLength(body) > 1024) { body = await gzipAsync(body, { level: 6 }); compressed = true; }
  response.writeHead(200, { ...headers, Vary: 'Accept-Encoding', ...(compressed && accepts ? { 'Content-Encoding': 'gzip' } : {}) });
  response.end(request.method === 'HEAD' ? undefined : body);
}

async function bodyJson(request) {
  let body = '';
  for await (const part of request) { body += part; if (body.length > 64_000) throw new Error('The request is too large.'); }
  return JSON.parse(body);
}

// Artwork and fonts are served as content-addressed files under the capture's random id. The preview iframe is
// sandboxed without same-origin access, so it cannot send the session cookie; the unguessable URL is the credential.
const assetUrlFor = (entry, id) => (bytes, type) => {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  entry.assets.set(hash, { bytes, type });
  return `/asset/${id}/${hash}`;
};

async function styleCapture(entry, options) {
  const key = JSON.stringify(options);
  if (entry.styles.has(key)) return { html: entry.styles.get(key), transformMs: 0, cached: true };
  const artwork = await transformArtwork(entry.capture, options);
  const html = renderPreview(entry.capture.snapshot, { ...artwork, textMode: options.textMode, assetUrl: assetUrlFor(entry, entry.id) });
  if (entry.styles.size >= 3) entry.styles.delete(entry.styles.keys().next().value);
  entry.styles.set(key, html);
  return { html, transformMs: artwork.transformMs, cached: false };
}

const previewUrl = (id, options) => `/preview/${id}?${new URLSearchParams({ cell: options.cell, colors: options.colors, dither: options.dither ? '1' : '0', textMode: options.textMode })}`;

export async function startServer({ port = Number(process.env.PORT) || 4173, host = process.env.HOST || '127.0.0.1', publicService = process.env.PIXELWEB_PUBLIC_SERVICE === '1', sessionMode = process.env.PIXELWEB_SESSION_MODE || 'cookie', maxCaptures = Number(process.env.PIXELWEB_MAX_CAPTURES) || 3, sessionMs = Number(process.env.PIXELWEB_SESSION_MS) || 600_000 } = {}) {
  const captures = new Map(), sessionKey = randomBytes(32);
  // Browser work waits in line; PIXELWEB_MAX_PARALLEL lets larger instances run several conversions at once.
  const queue = createQueue({ parallel: Math.max(1, Number(process.env.PIXELWEB_MAX_PARALLEL) || 1), waiting: 8 });
  // Operations on one capture share its live page, so they run one after another even with parallel slots.
  const withEntry = (entry, task) => {
    const run = (entry.lock || Promise.resolve()).then(task, task);
    entry.lock = run.catch(() => {});
    return run;
  };
  const removeCapture = async id => {
    const entry = captures.get(id);
    if (!entry) return;
    captures.delete(id); clearTimeout(entry.expiry);
    await entry.capture.session?.close();
  };
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/health' && request.method === 'GET') return json(response, 200, { status: 'ok' });
      // The page calls this on load so Chromium starts while the visitor reads the showcase.
      if (url.pathname === '/api/warm' && request.method === 'GET') { await warmCapture(); return json(response, 200, { status: 'ready' }); }
      const asset = url.pathname.match(/^\/asset\/([a-f\d-]{36})\/([a-f\d]{32})$/);
      if (asset && (request.method === 'GET' || request.method === 'HEAD')) {
        const file = captures.get(asset[1])?.assets.get(asset[2]);
        if (!file) return json(response, 404, { error: 'This capture has expired. Convert the URL again.' });
        // Fonts load in CORS mode from the sandboxed preview; the sandbox policy keeps SVG scripts inert if opened directly.
        const headers = { 'Content-Type': file.type, 'Cache-Control': 'private, max-age=86400, immutable', 'Access-Control-Allow-Origin': '*', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" };
        if (file.type === 'image/svg+xml') return sendText(request, response, headers, file.bytes);
        response.writeHead(200, headers);
        return response.end(request.method === 'HEAD' ? undefined : file.bytes);
      }
      let owner = null;
      if (publicService && sessionMode === 'gateway') {
        owner = request.headers['x-pixelweb-session'];
        if (!/^[a-f\d-]{36}$/.test(owner || '')) return json(response, 403, { error: 'Use the public Pixel Web page to start a session.' });
      } else if (publicService) {
        const session = cookieSession(request.headers.cookie, sessionKey);
        owner = session.owner;
        const secure = request.headers['x-forwarded-proto'] === 'https';
        if (session.token) response.setHeader('Set-Cookie', `pixelweb_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure ? '; Secure' : ''}`);
      }
      if (request.method === 'POST') {
        const origin = request.headers.origin;
        if (origin && ![`http://${request.headers.host}`, `https://${request.headers.host}`].includes(origin)) return json(response, 403, { error: 'Use the PixelWeb page to convert a website.' });
        const input = await bodyJson(request);
        if (url.pathname === '/api/convert') {
          const sourceUrl = normalizeUrl(input.url);
          const queuedAt = performance.now();
          return await queue.run(async () => {
            const started = performance.now();
            // Evict the oldest capture that no other request is using.
            for (const [oldId, old] of captures) { if (captures.size < Math.max(1, maxCaptures)) break; if (!old.users) await removeCapture(oldId); }
            const width = Math.max(320, Math.min(1920, Number(input.width) || (input.viewport === 'mobile' ? 390 : 1280)));
            const height = Math.round(Math.max(300, Math.min(1800, Number(input.height) || 800)));
            const capture = await captureWebsite(sourceUrl, width, { live: true, height });
            const id = randomUUID();
            const entry = { id, capture, styles: new Map(), assets: new Map(), owner };
            const options = optionsFrom(input);
            let transformed;
            try { transformed = await styleCapture(entry, options); }
            catch (error) { await capture.session?.close(); throw error; }
            captures.set(id, entry);
            entry.expiry = setTimeout(() => removeCapture(id).catch(() => {}), sessionMs);
            entry.expiry.unref();
            const snapshot = capture.snapshot;
            return json(response, 200, { id, title: snapshot.title, url: snapshot.url, width, viewportHeight: snapshot.viewportHeight, height: snapshot.height, elements: snapshot.elements, images: transformed.html.match(/data-pixel-image=/g)?.length || 0, backgrounds: capture.backgroundSources.size, warnings: capture.warnings, timings: { ...capture.timings, transformMs: transformed.transformMs, queuedMs: Math.round(started - queuedAt), totalMs: Math.round(performance.now() - started) }, previewUrl: previewUrl(id, options), originalUrl: `/original/${id}` });
          });
        }
        if (url.pathname === '/api/style' || url.pathname === '/api/interact') {
          const entry = captures.get(input.id);
          if (!entry || entry.owner !== owner) return json(response, 404, { error: 'This capture has expired. Convert the URL again.' });
          entry.users = (entry.users || 0) + 1;
          try {
            return await queue.run(() => withEntry(entry, async () => {
              const sourceDeadline = (url.pathname === '/api/interact' || Number(input.width)) && entry.capture.session
                ? setTimeout(() => entry.capture.session.close().catch(() => {}), 50_000) : null;
              try {
                if (url.pathname === '/api/interact') {
                  const session = entry.capture.session;
                  if (!session || session.page.isClosed()) throw new Error('This live session has expired. Convert the URL again.');
                  const result = await performInteraction(session.page, input);
                  if (input.kind === 'scroll' && !result.changed) return json(response, 200, { noChange: true });
                  entry.capture = { ...await session.refresh(), session };
                  entry.styles.clear(); entry.assets.clear();
                }
                if (url.pathname === '/api/style' && Number(input.width)) {
                  const session = entry.capture.session;
                  if(entry.capture.pdfBytes){
                    entry.capture=await renderPdfDocument(entry.capture.pdfBytes,entry.capture.snapshot.url,Math.round(Math.max(320,Math.min(1920,Number(input.width)))),Math.round(Math.max(300,Math.min(1800,Number(input.height)||800))));
                    entry.styles.clear(); entry.assets.clear();
                  }else{
                  if (!session || session.page.isClosed()) throw new Error('This live session has expired. Convert the URL again.');
                  await session.page.setViewportSize({ width: Math.round(Math.max(320, Math.min(1920, Number(input.width)))), height: Math.round(Math.max(300, Math.min(1800, Number(input.height) || 800))) });
                  entry.capture = { ...await session.refresh(), session };
                  entry.styles.clear(); entry.assets.clear();
                  }
                }
                const options = optionsFrom(input);
                const transformed = await styleCapture(entry, options);
                return json(response, 200, { previewUrl: previewUrl(input.id, options), transformMs: transformed.transformMs, cached: transformed.cached, title: entry.capture.snapshot.title, url: entry.capture.snapshot.url, height: entry.capture.snapshot.height, width: entry.capture.snapshot.width, viewportHeight: entry.capture.snapshot.viewportHeight });
              } finally { clearTimeout(sourceDeadline); }
            }));
          } finally { entry.users--; }
        }
        return json(response, 404, { error: 'This endpoint does not exist.' });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { error: 'This method is not supported.' });
      const match = url.pathname.match(/^\/(preview|original)\/([a-f\d-]+)$/);
      if (match) {
        const entry = captures.get(match[2]);
        if (!entry || entry.owner !== owner) return json(response, 404, { error: 'This capture has expired. Convert the URL again.' });
        const options = optionsFrom({ ...Object.fromEntries(url.searchParams), dither: url.searchParams.get('dither') === '1' });
        const html = match[1] === 'original' ? renderOriginal(entry.capture, { assetUrl: assetUrlFor(entry, match[2]) }) : entry.styles.get(JSON.stringify(options));
        if (!html) return json(response, 404, { error: 'Select this style from the converter first.' });
        return sendText(request, response, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': previewPolicy }, html);
      }
      const showcase = url.pathname.match(/^\/showcase\/([a-z\d-]+)\.html$/);
      if (showcase) {
        let data;
        try { data = await readFile(resolve(root, 'public', 'showcase', `${showcase[1]}.html.gz`)); } catch { return json(response, 404, { error: 'File not found.' }); }
        return sendText(request, response, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Content-Security-Policy': previewPolicy }, data, { compressed: true });
      }
      const path = resolve(root, 'public', `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
      if (!path.startsWith(resolve(root, 'public') + '/')) return json(response, 404, { error: 'File not found.' });
      const extension = path.slice(path.lastIndexOf('.'));
      if (!types[extension]) return json(response, 404, { error: 'File not found.' });
      let data;
      try { data = await readFile(path); } catch { return json(response, 404, { error: 'File not found.' }); }
      const headers = { 'Content-Type': types[extension], 'Cache-Control': 'no-cache', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; frame-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
      // Pixel fonts are shared by every preview, which loads them from a sandboxed (opaque) origin.
      if (types[extension].startsWith('font/')) Object.assign(headers, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' });
      if (types[extension].startsWith('text/') || extension === '.svg') return sendText(request, response, headers, data);
      response.writeHead(200, headers);
      response.end(data);
    } catch (error) { json(response, error.httpStatus || 400, { error: error.message || 'The website could not be converted. Try another public URL.', ...(String(error.code ?? '').startsWith('SOURCE_') ? { code: error.code, sourceStatus: error.sourceStatus, sourceUrl: error.sourceUrl } : {}) }); }
  });
  server.once('close', () => { for (const id of captures.keys()) removeCapture(id).catch(() => {}); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startServer();
  console.log(`PixelWeb is available at http://127.0.0.1:${server.address().port}`);
  warmCapture().catch(error => console.error(`Chromium did not start: ${error.message}`));
  const stop = async () => { server.close(); await closeBrowser(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
