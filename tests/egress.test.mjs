import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { publicAddress, publicResponse, createEgressProxy } from '../lib/egress.mjs';

test('egress pins a checked IP and rejects DNS answers containing private destinations', async () => {
  let calls = 0;
  const result = await publicAddress('https://example.com/path', async () => { calls++; return [{ address: '93.184.216.34' }]; });
  assert.equal(result.address, '93.184.216.34'); assert.equal(calls, 1);
  await assert.rejects(publicAddress('https://example.com', async () => [{ address: '127.0.0.1' }]), /public/);
  await assert.rejects(publicAddress('https://example.com', async () => [{ address: '93.184.216.34' }, { address: '10.0.0.1' }]), /public/);
  await assert.rejects(publicResponse('http://127.0.0.1:4173/'), /public/);
});

test('actual HTTP and CONNECT proxy requests cannot access local or metadata addresses', async () => {
  const proxy = await createEgressProxy();
  try {
    for (const [method, path] of [['GET', 'http://127.0.0.1:4173/'], ['CONNECT', '169.254.169.254:80']]) {
      const status = await new Promise((resolve, reject) => {
        const call = request(proxy.url, { method, path });
        call.on('response', response => { response.resume(); resolve(response.statusCode); });
        call.on('connect', (response, socket) => { socket.destroy(); resolve(response.statusCode); });
        call.on('error', reject); call.end();
      });
      assert.equal(status, 403);
    }
  } finally { await proxy.close(); }
});
