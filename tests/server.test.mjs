import test from 'node:test';
import assert from 'node:assert/strict';
import * as serverModule from '../server.mjs';

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
