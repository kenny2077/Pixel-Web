import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { pixelPng } from '../lib/pixels.mjs';
import { createArtworkPool, cpuLimit } from '../lib/artwork-pool.mjs';

const photo = (seed) => sharp({ create: { width: 180, height: 120, channels: 4, background: { r: seed * 40 % 255, g: 90, b: 200 - seed * 30, alpha: 1 } } })
  .composite([{ input: Buffer.from(`<svg width="180" height="120"><circle cx="${40 + seed * 20}" cy="60" r="35" fill="#e94"/><rect x="90" y="20" width="60" height="70" fill="#2a6"/></svg>`), top: 0, left: 0 }]).png().toBuffer();

test('worker threads produce the same artwork as the main thread', async () => {
  const pool = createArtworkPool({ size: 3 });
  try {
    const inputs = await Promise.all([0, 1, 2, 3, 4].map(photo));
    const options = [{ readable: true, width: 90, height: 60 }, { cell: 4, colors: 16, dither: true, width: 1280, height: 1200 }];
    for (const option of options) {
      const pooled = await Promise.all(inputs.map(input => pool.run(input, option)));
      const inline = await Promise.all(inputs.map(input => pixelPng(input, option)));
      for (let i = 0; i < inputs.length; i++) assert.ok(Buffer.from(pooled[i]).equals(inline[i]), `image ${i}`);
    }
  } finally { await pool.close(); }
});

test('a failed image rejects only its own job', async () => {
  const pool = createArtworkPool({ size: 2 });
  try {
    await assert.rejects(pool.run(Buffer.from('not an image'), { readable: true }));
    assert.ok((await pool.run(await photo(1), { readable: true, width: 50, height: 40 })).length > 0);
  } finally { await pool.close(); }
});

test('the CPU limit reads a container quota', () => {
  assert.equal(cpuLimit('200000 100000'), 2);
  assert.equal(cpuLimit('150000 100000'), 1);
  assert.ok(cpuLimit('max 100000') >= 1);
  assert.ok(cpuLimit(null) >= 1);
});
