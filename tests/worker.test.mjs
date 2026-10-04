import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import * as capture from '../lib/capture.mjs';

test('unfinished resource bodies do not keep collection pending forever', async () => {
  assert.equal(typeof capture.collectResources, 'function');
  const before = performance.now();
  await capture.collectResources([new Promise(() => {})], 25);
  assert.ok(performance.now() - before < 250);
});

test('capture contexts cannot make WebSocket connections to local services', async () => {
  assert.equal(typeof capture.createCaptureContext, 'function');
  let connections = 0;
  const server = createServer();
  server.on('upgrade', (request, socket) => { connections++; socket.destroy(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await capture.getBrowser();
  const context = await capture.createCaptureContext(browser, 800);
  try {
    const page = await context.newPage();
    await page.setContent('<html><body>Socket test</body></html>');
    await page.evaluate(port => new Promise(resolve => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      socket.onclose = socket.onerror = () => resolve();
      setTimeout(resolve, 200);
    }), server.address().port);
    assert.equal(connections, 0);
  } finally {
    await context.close();
    await capture.closeBrowser();
    await new Promise(resolve => server.close(resolve));
  }
});
