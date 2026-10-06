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

test('omitted default declarations render the same computed styles as the source', async () => {
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
    // Each case has a value that equals either its parent or a browser default in some other context.
    await page.setContent(`<!doctype html><html><head><style>
      body{font:16px/1.4 Georgia,serif;color:#222}.small p{font-size:12.8px;margin:16px 0}cite.plain{font-style:normal}
      pre.wrap{white-space:normal}abbr{text-decoration:none}ul ul{list-style-type:disc}h2{font-size:16px;font-weight:400}
    </style></head><body><main>
      <div class="small"><p id="p">Author margin equal to the default at another size.</p></div>
      <p><cite id="cite" class="plain">Upright citation</cite> and <cite id="italic">italic citation</cite></p>
      <pre id="pre" class="wrap">normal wrapping</pre><abbr id="abbr" title="Abbreviation">ABBR</abbr>
      <ul><li>Outer<ul id="nested"><li>Inner</li></ul></li></ul><h2 id="h2">Plain heading</h2>
      <label>Search <input id="search" style="border:2px inset rgb(118, 118, 118)"></label>
    </main></body></html>`);
    const ids = ['p', 'cite', 'italic', 'pre', 'abbr', 'nested', 'h2', 'search'];
    const properties = ['margin-bottom', 'font-style', 'white-space', 'text-decoration-line', 'list-style-type', 'font-size', 'font-weight', 'border-top-style', 'color', 'line-height'];
    const read = () => page.evaluate(({ ids, properties }) => ids.map(id => properties.map(property => getComputedStyle(document.getElementById(id)).getPropertyValue(property))), { ids, properties });
    const source = await read();
    const snapshot = await capture.snapshotPage(page);
    await page.setContent(preview.renderPreview(snapshot, { textMode: 'original' }));
    assert.deepEqual(await read(), source);
    assert.ok(snapshot.html.length < 12_000, `snapshot is ${snapshot.html.length} characters`);
  } finally { await browser.close(); }
});

test('previews can reference artwork and fonts as cacheable files instead of inline data', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const font = Buffer.from('font bytes');
  const snapshot = {
    html: '<body><img alt="a" src="data:image/gif;base64,R0lGOD" data-pixel-image="image-0"><div data-pixel-background="background-0">中文</div></body>',
    backgrounds: [{ id: 'background-0', mode: 'rendered' }],
    fontCss: `@font-face{font-family:Source;src:url(data:font/woff2;base64,${font.toString('base64')});font-display:swap}`,
    title: 'Fixture', url: 'https://example.org/',
  };
  const seen = [];
  const assetUrl = (bytes, type) => { seen.push(type); return `/asset/capture/${bytes.length}-${seen.length}`; };
  const html = preview.renderPreview(snapshot, { imageAssets: new Map([['image-0', png]]), backgroundAssets: new Map([['background-0', png]]), textMode: 'all', assetUrl });
  assert.doesNotMatch(html, /data:image\/png|data:font/);
  assert.match(html, /<img[^>]*src="\/asset\/capture\/11-1"/);
  assert.match(html, /background-image:url\("\/asset\/capture\/11-2"\)/);
  assert.match(html, /url\("\/asset\/capture\/10-3"\)/);
  assert.match(html, /url\("\/fonts\/pixelify\.ttf"\)/);
  assert.match(html, /url\("\/fonts\/fusion-pixel-cjk\.woff2"\)/);
  assert.match(html, /img-src data: 'self'; style-src 'unsafe-inline'; font-src data: 'self'/);
  assert.deepEqual(seen, ['image/png', 'image/png', 'font/woff2']);
  // Without an asset callback the preview stays self-contained, as the saved example requires.
  assert.match(preview.renderPreview(snapshot, { imageAssets: new Map([['image-0', png]]) }), /src="data:image\/png;base64,/);
});
