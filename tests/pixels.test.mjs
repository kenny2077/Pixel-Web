import test from 'node:test';
import assert from 'node:assert/strict';
import * as pixels from '../lib/pixels.mjs';

const sample = {
  width: 8, height: 8,
  data: Uint8Array.from({ length: 8 * 8 * 4 }, (_, i) => {
    const pixel = Math.floor(i / 4);
    return [pixel * 3 % 256, pixel * 7 % 256, pixel * 11 % 256, pixel === 0 ? 0 : 255][i % 4];
  }),
};

test('quantization keeps transparent pixels and uses at most the requested opaque colors', () => {
  assert.equal(typeof pixels.quantize, 'function');
  const out = pixels.quantize(sample.data, 8);
  assert.equal(out[3], 0);
  const colors = new Set();
  for (let i = 0; i < out.length; i += 4) if (out[i + 3]) colors.add(`${out[i]},${out[i + 1]},${out[i + 2]}`);
  assert.ok(colors.size <= 8);
  assert.deepEqual(out, pixels.quantize(sample.data, 8));
});

test('pixel cells share one color and alpha stays transparent', async () => {
  assert.equal(typeof pixels.pixelate, 'function');
  const out = await pixels.pixelate(sample, { cell: 4, colors: 8 });
  assert.equal(out.width, 8);
  assert.equal(out.height, 8);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const at = (y * 8 + x) * 4;
    assert.deepEqual(out.data.slice(at, at + 4), out.data.slice(0, 4));
  }
  const transparent = await pixels.pixelate({ width: 2, height: 2, data: new Uint8Array(16) }, { cell: 2, colors: 8 });
  assert.equal(transparent.data[3], 0);
});
