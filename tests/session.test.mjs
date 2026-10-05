import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cookieSession } from '../lib/session.mjs';
import { startServer } from '../server.mjs';

test('anonymous cookies cannot be forged or reused after the server signing key changes', () => {
  const key = randomBytes(32), first = cookieSession('', key);
  assert.equal(cookieSession(`pixelweb_session=${first.token}`, key).owner, first.owner);
  assert.notEqual(cookieSession(`pixelweb_session=${first.owner}.${'0'.repeat(64)}`, key).owner, first.owner);
  assert.notEqual(cookieSession(`pixelweb_session=${first.token}`, randomBytes(32)).owner, first.owner);
});

test('standalone public service opens without a gateway and issues a reusable HttpOnly cookie', async () => {
  const server = await startServer({ port: 0, publicService: true });
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const first = await fetch(url, { headers: { 'X-PixelWeb-Session': '11111111-1111-1111-1111-111111111111' } });
    assert.equal(first.status, 200);
    const cookie = first.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/); assert.ok(!cookie.includes('11111111-1111'));
    assert.equal((await fetch(url, { headers: { Cookie: cookie.split(';')[0] } })).headers.get('set-cookie'), null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
