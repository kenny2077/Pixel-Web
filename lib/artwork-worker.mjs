import { parentPort } from 'node:worker_threads';
import sharp from 'sharp';
import { pixelPng } from './pixels.mjs';

// Each worker processes one image at a time; parallelism comes from the number of workers.
sharp.concurrency(1);
parentPort.on('message', async ({ id, input, options }) => {
  try {
    const output = await pixelPng(Buffer.from(input), options);
    const copy = new Uint8Array(output);
    parentPort.postMessage({ id, output: copy }, [copy.buffer]);
  } catch (error) { parentPort.postMessage({ id, error: error.message || 'Artwork failed.' }); }
});
