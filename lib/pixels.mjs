import sharp from 'sharp';

// Weighted median-cut: frequently used colors contribute more than rare noise.
export function quantize(rgba, count = 24, dither = false, width = 1) {
  const histogram = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 16) continue;
    const key = (rgba[i] >> 3) * 1024 + (rgba[i + 1] >> 3) * 32 + (rgba[i + 2] >> 3);
    const entry = histogram.get(key) || [0, 0, 0, 0];
    for (let c = 0; c < 3; c++) entry[c] += rgba[i + c];
    entry[3]++;
    histogram.set(key, entry);
  }
  const entries = [...histogram.values()].map(v => [v[0] / v[3], v[1] / v[3], v[2] / v[3], v[3]]);
  if (!entries.length) return Uint8Array.from(rgba);
  const bounds = box => {
    const ranges = [0, 1, 2].map(c => Math.max(...box.map(v => v[c])) - Math.min(...box.map(v => v[c])));
    const channel = ranges.indexOf(Math.max(...ranges));
    return { channel, score: ranges[channel] * Math.sqrt(box.reduce((n, v) => n + v[3], 0)) };
  };
  const boxes = [entries];
  while (boxes.length < count) {
    const candidates = boxes.map((box, index) => ({ index, ...bounds(box) })).filter(v => boxes[v.index].length > 1);
    if (!candidates.length) break;
    candidates.sort((a, b) => b.score - a.score);
    const { index, channel } = candidates[0];
    const box = boxes[index].sort((a, b) => a[channel] - b[channel]);
    const halfway = box.reduce((n, v) => n + v[3], 0) / 2;
    let total = 0, split = 0;
    while (split < box.length - 1 && total < halfway) total += box[split++][3];
    boxes.splice(index, 1, box.slice(0, split), box.slice(split));
  }
  const palette = boxes.map(box => {
    const weight = box.reduce((n, v) => n + v[3], 0);
    return [0, 1, 2].map(c => Math.round(box.reduce((n, v) => n + v[c] * v[3], 0) / weight));
  });
  const output = Uint8Array.from(rgba);
  const nearest = new Map();
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 16) continue;
    const p = i / 4, x = p % width, y = Math.floor(p / width);
    const offset = dither ? (bayer[(y % 4) * 4 + x % 4] - 7.5) * 1.5 : 0;
    const key = (rgba[i] >> 3) * 1024 + (rgba[i + 1] >> 3) * 32 + (rgba[i + 2] >> 3);
    if (!dither && nearest.has(key)) { output.set(nearest.get(key), i); continue; }
    let best = palette[0], distance = Infinity;
    for (const color of palette) {
      const r = rgba[i] + offset - color[0], g = rgba[i + 1] + offset - color[1], b = rgba[i + 2] + offset - color[2];
      const d = 2 * r * r + 4 * g * g + 3 * b * b;
      if (d < distance) { distance = d; best = color; }
    }
    if (!dither) nearest.set(key, best);
    output.set(best, i);
  }
  return output;
}

export async function pixelate(image, { cell = 4, colors = 24, dither = false } = {}) {
  const width = image.width, height = image.height;
  const smallWidth = Math.max(1, Math.ceil(width / cell));
  const smallHeight = Math.max(1, Math.ceil(height / cell));
  const reduced = await sharp(image.data, { raw: { width, height, channels: 4 } })
    .resize(smallWidth, smallHeight, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
  const colored = quantize(reduced, colors, dither, smallWidth);
  // Explicit replication guarantees a stable integer grid, including the last partial cell.
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = (Math.floor(y / cell) * smallWidth + Math.floor(x / cell)) * 4;
    data.set(colored.subarray(from, from + 4), (y * width + x) * 4);
  }
  return { data, width, height };
}

export async function pixelPng(input, options = {}) {
  const readable = !!options.readable;
  const { data, info } = await sharp(input, { limitInputPixels: 24_000_000 }).rotate()
    .resize({ width: (options.width || 1280) * (readable ? 2 : 1), height: (options.height || 1800) * (readable ? 2 : 1), fit: 'inside', withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = await pixelate({ data, width: info.width, height: info.height }, readable ? { ...options, cell: 1, colors: 128, dither: false } : options);
  return sharp(out.data, { raw: { width: out.width, height: out.height, channels: 4 } }).png().toBuffer();
}
