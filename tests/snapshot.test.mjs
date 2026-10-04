import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import * as capture from '../lib/capture.mjs';
import * as preview from '../lib/preview.mjs';

test('a generic snapshot preserves text, links and disclosures without source scripts', async () => {
  assert.equal(typeof capture.snapshotPage, 'function');
  assert.equal(typeof preview.renderPreview, 'function');
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
    await page.setContent(`<!doctype html><html><head><style>.art:before{content:"Pixel ornament";display:block;background:linear-gradient(#abc,#124);width:100px;height:30px}</style></head><body style="background:#eae5d4"><main>
      <h1>Independent fixture</h1><p>Keep these exact words.</p>
      <a href="https://example.org/guide" onclick="alert('unsafe')">Read guide</a>
      <div class="art" style="width:160px;height:80px;background:linear-gradient(90deg,#124,#abc);filter:blur(4px);transform:translateX(2px)"></div>
      <nav id="positioned" style="position:relative;height:200px"><a style="position:absolute;top:70%" href="https://example.org">Positioned link</a></nav>
      <span id="wordmark" style="display:inline-block;width:100px;height:30px;text-indent:-10000px;background:#456">Accessible wordmark</span>
      <svg width="20" height="20"><defs><path id="icon" d="M0 0H20V20H0Z"/></defs><use href="#icon"/></svg>
      <img width="32" height="32" alt="test artwork" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23cc5544'/%3E%3C/svg%3E">
      <details><summary>More</summary><p>Disclosure content</p></details>
      <form action="https://example.org/pay"><input value="private"><button>Pay</button></form>
      <script>window.sourceScript = true</script></main></body></html>`);
    const snapshot = await capture.snapshotPage(page);
    assert.match(snapshot.html, /Keep these exact words\./);
    assert.match(snapshot.html, /https:\/\/example.org\/guide/);
    assert.match(snapshot.html, /<details/);
    assert.doesNotMatch(snapshot.html, /onclick=|<script|<form|value="private"/);
    assert.equal(snapshot.images.length, 1);
    assert.ok(snapshot.backgrounds.length > 0);
    assert.match(snapshot.html, /Pixel ornament/);
    assert.match(snapshot.html, /transform: matrix\(1, 0, 0, 1, 2, 0\)/);
    assert.ok(snapshot.backgrounds.some(background => background.filter === 'blur(4px)'));
    assert.match(snapshot.html, /<use[^>]*href="#icon"/);
    const html = preview.renderPreview(snapshot, { imageAssets: new Map(), backgroundAssets: new Map(), textMode: 'headings' });
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /Keep these exact words\./);
    assert.match(html, /data-pixel-text="headings"/);
    await page.setContent(html);
    assert.equal(await page.locator('#positioned').evaluate(node=>node.getBoundingClientRect().height), 200);
    assert.equal(await page.locator('#wordmark').evaluate(node=>getComputedStyle(node).textIndent), '-10000px');
    const href = await page.getByRole('link', { name: 'Read guide' }).getAttribute('href');
    assert.equal(href, 'https://example.org/guide');
    await page.locator('summary').click();
    assert.equal(await page.locator('details').getAttribute('open'), '');
  } finally { await browser.close(); }
});

test('transparent gradient wrappers do not change a sprite source or its final layer position', () => {
  assert.equal(typeof capture.spriteSource, 'function');
  const source = capture.spriteSource({ image: 'linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0)), url("https://example.org/sprite.svg")', position: '0% 0%, 0px -254px', size: 'auto, 300px 700px', repeat: 'repeat, no-repeat' });
  assert.deepEqual(source, { url: 'https://example.org/sprite.svg', position: '0px -254px', size: '300px 700px', repeat: 'no-repeat' });
  assert.equal(capture.spriteSource({ image: 'linear-gradient(rgb(255,0,0),rgb(0,0,255)),url("https://example.org/sprite.svg")' }), null);
});

test('sprite backgrounds keep their positioning and share one inline image', () => {
  const bytes = Buffer.from('sprite image');
  const html = preview.renderPreview({ title: 'Sprite fixture', html: '<body><i data-pixel-background="a"></i><i data-pixel-background="b"></i></body>', backgrounds: [{ id: 'a', mode: 'source' }, { id: 'b', mode: 'source' }] }, { backgroundAssets: new Map([['a', bytes], ['b', bytes]]) });
  assert.equal((html.match(/data:image\/png;base64,/g) || []).length, 1);
  assert.ok(!html.includes('background-size:100% 100%'));
});
