import test from 'node:test';
import assert from 'node:assert/strict';
import { getBrowser, closeBrowser } from '../lib/capture.mjs';

test('the sandbox preview navigation retains the anonymous same-site session cookie', async () => {
  const context = await (await getBrowser()).newContext();
  try {
    let cookie;
    await context.route('https://fixture.example/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/convert') return route.fulfill({ contentType: 'application/json', headers: { 'Set-Cookie': 'pixelweb_session=11111111-1111-1111-1111-111111111111; Path=/; Secure; HttpOnly; SameSite=Lax' }, body: '{}' });
      if (path === '/preview') {
        cookie = (await route.request().allHeaders()).cookie;
        return route.fulfill({ contentType: 'text/html', body: '<p>Preview ready</p>' });
      }
      return route.fulfill({ contentType: 'text/html', body: '<iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"></iframe><script>fetch("/api/convert",{method:"POST"}).then(()=>document.querySelector("iframe").src="/preview")</script>' });
    });
    const page = await context.newPage();
    await page.goto('https://fixture.example/');
    await page.frameLocator('iframe').getByText('Preview ready').waitFor();
    assert.match(cookie || '', /pixelweb_session=11111111/);
  } finally { await context.close(); await closeBrowser(); }
});
