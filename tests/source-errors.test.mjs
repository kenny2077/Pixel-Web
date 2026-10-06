import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceHttpError } from '../lib/source-errors.mjs';

test('source refusal and rate limits remain distinguishable from converter failures', () => {
  const denied = sourceHttpError(999);
  assert.equal(denied.code, 'SOURCE_ACCESS_DENIED');
  assert.equal(denied.sourceStatus, 999);
  assert.match(denied.message, /denied access/);
  assert.match(denied.message, /original website/);
  assert.equal(sourceHttpError(429).code, 'SOURCE_RATE_LIMITED');
  assert.equal(sourceHttpError(503).code, 'SOURCE_HTTP_ERROR');
});

test('HTTP 401 from a public page is reported as an access refusal', () => {
  assert.equal(sourceHttpError(401).code, 'SOURCE_ACCESS_DENIED');
});

test('bot checks and empty error pages are refused instead of converted', async () => {
  const { getBrowser, closeBrowser, detectBlockedPage } = await import('../lib/capture.mjs');
  const page = await (await getBrowser()).newPage();
  try {
    const cases = [
      ['<title>Just a moment...</title><p>Checking your browser before accessing the site.</p>', true],
      ['<title></title><p>Unknown Error</p>', true],
      ['<title>Shop</title><p>Click the button below to continue shopping</p><iframe src="about:blank" title="hcaptcha challenge"></iframe>', true],
      ['<title></title><body></body>', true],
      // Small genuine pages must still convert.
      ['<title>Example Domain</title><div><h1>Example Domain</h1><p>This domain is for use in documentation examples without needing permission.</p><p><a href="https://iana.org/domains/example">Learn more</a></p></div>', false],
      [`<title>Captcha research</title><main>${'<p>An article about how CAPTCHA tests work and why they are hard for people.</p>'.repeat(40)}</main>`, false],
    ];
    for (const [html, blocked] of cases) {
      await page.setContent(`<!doctype html>${html}`);
      assert.equal(!!await detectBlockedPage(page), blocked, html.slice(0, 60));
    }
  } finally { await page.close(); await closeBrowser(); }
});
