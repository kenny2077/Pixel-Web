import { renderPdfDocument } from './lib/pdf.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { captureWebsite, transformArtwork, closeBrowser } from './lib/capture.mjs';
import { normalizeUrl } from './lib/urls.mjs';
import { renderOriginal, renderPreview } from './lib/preview.mjs';
import { performInteraction } from './lib/interaction.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const captures = new Map();
let busy = false;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const optionsFrom = input => ({ cell: Math.max(2, Math.min(8, Math.round(Number(input.cell) || 4))), colors: Math.max(8, Math.min(32, Math.round(Number(input.colors) || 24))), dither: !!input.dither, textMode: ['headings', 'all', 'original'].includes(input.textMode) ? input.textMode : 'all' });
const json = (response, status, value) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };

async function bodyJson(request) {
  let body = '';
  for await (const part of request) { body += part; if (body.length > 64_000) throw new Error('The request is too large.'); }
  return JSON.parse(body);
}

async function styleCapture(entry, options) {
  const key = JSON.stringify(options);
  if (entry.styles.has(key)) return { html: entry.styles.get(key), transformMs: 0, cached: true };
  const artwork = await transformArtwork(entry.capture, options);
  const html = renderPreview(entry.capture.snapshot, { ...artwork, textMode: options.textMode });
  if (entry.styles.size >= 3) entry.styles.delete(entry.styles.keys().next().value);
  entry.styles.set(key, html);
  return { html, transformMs: artwork.transformMs, cached: false };
}

const previewUrl = (id, options) => `/preview/${id}?${new URLSearchParams({ cell: options.cell, colors: options.colors, dither: options.dither ? '1' : '0', textMode: options.textMode })}`;

export async function startServer({ port = Number(process.env.PORT) || 4173, host = process.env.HOST || '127.0.0.1' } = {}) {
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'POST') {
        const origin = request.headers.origin;
        if (origin && ![`http://${request.headers.host}`, `https://${request.headers.host}`].includes(origin)) return json(response, 403, { error: 'Use the PixelWeb page to convert a website.' });
        const input = await bodyJson(request);
        if (url.pathname === '/api/convert') {
          const sourceUrl = normalizeUrl(input.url);
          if (busy) return json(response, 409, { error: 'Another conversion is running. Wait for it to finish.' });
          busy = true;
          const started = performance.now();
          try {
            const width = Math.max(320, Math.min(1920, Number(input.width) || (input.viewport === 'mobile' ? 390 : 1280)));
            const height = Math.round(Math.max(300, Math.min(1800, Number(input.height) || 800)));
            const capture = await captureWebsite(sourceUrl, width, { live: true, height });
            const id = randomUUID();
            const entry = { capture, styles: new Map() };
            const options = optionsFrom(input);
            const transformed = await styleCapture(entry, options);
            while (captures.size >= 3) {
              const oldest = captures.keys().next().value;
              await captures.get(oldest).capture.session?.close();
              captures.delete(oldest);
            }
            captures.set(id, entry);
            const snapshot = capture.snapshot;
            return json(response, 200, { id, title: snapshot.title, url: snapshot.url, width, viewportHeight: snapshot.viewportHeight, height: snapshot.height, elements: snapshot.elements, images: transformed.html.match(/data-pixel-image=/g)?.length || 0, backgrounds: capture.backgroundSources.size, warnings: capture.warnings, timings: { ...capture.timings, transformMs: transformed.transformMs, totalMs: Math.round(performance.now() - started) }, previewUrl: previewUrl(id, options), originalUrl: `/original/${id}` });
          } finally { busy = false; }
        }
        if (url.pathname === '/api/style' || url.pathname === '/api/interact') {
          const entry = captures.get(input.id);
          if (!entry) return json(response, 404, { error: 'This capture has expired. Convert the URL again.' });
          if (busy) return json(response, 409, { error: 'Another conversion is running. Wait for it to finish.' });
          busy = true;
          const sourceDeadline = (url.pathname === '/api/interact' || Number(input.width)) && entry.capture.session
            ? setTimeout(() => entry.capture.session.close().catch(() => {}), 50_000) : null;
          try {
            if (url.pathname === '/api/interact') {
              const session = entry.capture.session;
              if (!session || session.page.isClosed()) throw new Error('This live session has expired. Convert the URL again.');
              const result = await performInteraction(session.page, input);
              if (input.kind === 'scroll' && !result.changed) return json(response, 200, { noChange: true });
              entry.capture = { ...await session.refresh(), session };
              entry.styles.clear();
            }
            if (url.pathname === '/api/style' && Number(input.width)) {
              const session = entry.capture.session;
              if(entry.capture.pdfBytes){
                entry.capture=await renderPdfDocument(entry.capture.pdfBytes,entry.capture.snapshot.url,Math.round(Math.max(320,Math.min(1920,Number(input.width)))),Math.round(Math.max(300,Math.min(1800,Number(input.height)||800))));
                entry.styles.clear();
              }else{
              if (!session || session.page.isClosed()) throw new Error('This live session has expired. Convert the URL again.');
              await session.page.setViewportSize({ width: Math.round(Math.max(320, Math.min(1920, Number(input.width)))), height: Math.round(Math.max(300, Math.min(1800, Number(input.height) || 800))) });
              entry.capture = { ...await session.refresh(), session };
              entry.styles.clear();
              }
            }
            const options = optionsFrom(input);
            const transformed = await styleCapture(entry, options);
            return json(response, 200, { previewUrl: previewUrl(input.id, options), transformMs: transformed.transformMs, cached: transformed.cached, title: entry.capture.snapshot.title, url: entry.capture.snapshot.url, height: entry.capture.snapshot.height, width: entry.capture.snapshot.width, viewportHeight: entry.capture.snapshot.viewportHeight });
          } finally { clearTimeout(sourceDeadline); busy = false; }
        }
        return json(response, 404, { error: 'This endpoint does not exist.' });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { error: 'This method is not supported.' });
      const match = url.pathname.match(/^\/(preview|original)\/([a-f\d-]+)$/);
      if (match) {
        const entry = captures.get(match[2]);
        if (!entry) return json(response, 404, { error: 'This capture has expired. Convert the URL again.' });
        const options = optionsFrom({ ...Object.fromEntries(url.searchParams), dither: url.searchParams.get('dither') === '1' });
        const html = match[1] === 'original' ? renderOriginal(entry.capture) : entry.styles.get(JSON.stringify(options));
        if (!html) return json(response, 404, { error: 'Select this style from the converter first.' });
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'" });
        return response.end(html);
      }
      const path = resolve(root, 'public', `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
      if (!path.startsWith(resolve(root, 'public') + '/')) return json(response, 404, { error: 'File not found.' });
      const extension = path.slice(path.lastIndexOf('.'));
      if (!types[extension]) return json(response, 404, { error: 'File not found.' });
      let data;
      try { data = await readFile(path); } catch { return json(response, 404, { error: 'File not found.' }); }
      response.writeHead(200, { 'Content-Type': types[extension], 'Cache-Control': 'no-cache', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; frame-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
      response.end(data);
    } catch (error) { json(response, 400, { error: error.message || 'The website could not be converted. Try another public URL.' }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startServer();
  console.log(`PixelWeb is available at http://127.0.0.1:${server.address().port}`);
  const stop = async () => { server.close(); await closeBrowser(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
