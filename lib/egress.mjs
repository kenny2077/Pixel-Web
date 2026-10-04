import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { normalizeUrl, isPublicIP } from './urls.mjs';

export async function publicAddress(input, resolve = lookup) {
  const url = new URL(normalizeUrl(input));
  const addresses = await resolve(url.hostname.replace(/^\[|\]$/g, ''), { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIP(address))) throw new Error('Only public network destinations are allowed.');
  return { url, address: addresses[0].address };
}

export async function publicResponse(input) {
  const { url, address } = await publicAddress(input);
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const call = send({ hostname: address, port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80), path: url.pathname + url.search, method: 'GET', headers: { host: url.host }, servername: url.hostname.replace(/^\[|\]$/g, ''), agent: false }, response => {
      response.on('close', () => clearTimeout(timer));
      resolve({ status: response.statusCode, ok: response.statusCode >= 200 && response.statusCode < 300, headers: { get: name => response.headers[name.toLowerCase()] }, body: { cancel: () => response.destroy(), [Symbol.asyncIterator]: () => response[Symbol.asyncIterator]() } });
    });
    const timer = setTimeout(() => call.destroy(new Error('Source download timed out.')), 25_000);
    call.on('error', error => { clearTimeout(timer); reject(error); }); call.end();
  });
}

export async function createEgressProxy() {
  const sockets = new Set();
  const server = createServer(async (incoming, outgoing) => {
    try {
      const { url, address } = await publicAddress(incoming.url);
      if (url.protocol !== 'http:') throw new Error('Use CONNECT for HTTPS.');
      const headers = { ...incoming.headers, host: url.host };
      delete headers['proxy-authorization']; delete headers['proxy-connection'];
      const upstream = httpRequest({ hostname: address, port: Number(url.port) || 80, path: url.pathname + url.search, method: incoming.method, headers, agent: false }, response => {
        outgoing.writeHead(response.statusCode, response.headers); response.pipe(outgoing);
      });
      upstream.setTimeout(25_000, () => upstream.destroy());
      upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
      incoming.on('aborted', () => upstream.destroy()); outgoing.on('close', () => upstream.destroy());
      incoming.pipe(upstream);
    } catch { outgoing.writeHead(403); outgoing.end('Only public network destinations are allowed.'); }
  });
  server.on('connect', async (request, client, head) => {
    try {
      const { url, address } = await publicAddress(`https://${request.url}`);
      // Connect to the checked IP, not a hostname that can resolve differently later.
      const upstream = connect(Number(url.port) || 443, address);
      sockets.add(upstream); upstream.on('close', () => sockets.delete(upstream));
      upstream.setTimeout(25_000, () => upstream.destroy());
      upstream.on('error', () => client.destroy());
      client.on('close', () => upstream.destroy()); client.on('error', () => upstream.destroy());
      upstream.on('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        client.pipe(upstream); upstream.pipe(client);
      });
    } catch { client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}
