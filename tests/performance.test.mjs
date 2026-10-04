import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { getBrowser, closeBrowser, snapshotPage, transformArtwork } from '../lib/capture.mjs';
import { performInteraction } from '../lib/interaction.mjs';
import { pixelPng } from '../lib/pixels.mjs';

test('bottom scroll reports no change for a complete page and detects added content', async () => {
  const page = await (await getBrowser()).newPage({ viewport: { width: 640, height: 400 } });
  try {
    await page.setContent('<main style="height:2000px">Complete article</main>');
    await snapshotPage(page, { interactive: true });
    const target = await page.locator('body').getAttribute('data-pixel-node');
    assert.equal((await performInteraction(page, { target, kind: 'scroll', value: 2000 })).changed, false);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(100);
    await page.evaluate(() => addEventListener('scroll', () => document.querySelector('main').setAttribute('data-scrolled', 'true'), { once: true }));
    assert.equal((await performInteraction(page, { target, kind: 'scroll', value: 2000 })).changed, false);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      addEventListener('scroll', () => setTimeout(() => document.querySelector('main').append(' More content'), 80), { once: true });
    });
    await page.waitForTimeout(100);
    assert.equal((await performInteraction(page, { target, kind: 'scroll', value: 2000 })).changed, true);
  } finally { await page.close(); await closeBrowser(); }
});

test('artwork cache reuses equal image bytes across captures and text styles without changing pixels', async () => {
  const bytes = await sharp({ create: { width: 101, height: 83, channels: 4, background: '#2680ae' } }).png().toBuffer();
  const capture = width => ({ snapshot: { images: [{ id: 'image-0', width, height: 80 }] }, imageSources: new Map([['image-0', Buffer.from(bytes)]]), backgroundSources: new Map(), warnings: [] });
  const first = await transformArtwork(capture(100), { cell: 2, colors: 32, textMode: 'headings' });
  const next = await transformArtwork(capture(100), { cell: 4, colors: 16, textMode: 'all' });
  assert.strictEqual(first.imageAssets.get('image-0'), next.imageAssets.get('image-0'));
  assert.equal(next.cacheHits, 1);
  assert.deepEqual(next.imageAssets.get('image-0'), await pixelPng(bytes, { readable: true, width: 100, height: 80 }));
  const resized = await transformArtwork(capture(20), { cell: 2, colors: 32 });
  assert.notStrictEqual(first.imageAssets.get('image-0'), resized.imageAssets.get('image-0'));
});
