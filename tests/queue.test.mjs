import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../lib/queue.mjs';

const later = (ms, value, log) => () => new Promise(resolve => setTimeout(() => { log?.push(value); resolve(value); }, ms));

test('a busy converter queues the next request instead of refusing it', async () => {
  const queue = createQueue({ parallel: 1, waiting: 4 });
  const log = [];
  const results = await Promise.all([queue.run(later(40, 'first', log)), queue.run(later(5, 'second', log)), queue.run(later(5, 'third', log))]);
  assert.deepEqual(results, ['first', 'second', 'third']);
  assert.deepEqual(log, ['first', 'second', 'third']);
  assert.equal(queue.active, 0);
});

test('parallel slots run together and a full queue answers busy', async () => {
  const queue = createQueue({ parallel: 2, waiting: 1 });
  let running = 0, peak = 0;
  const task = () => queue.run(async () => { running++; peak = Math.max(peak, running); await new Promise(resolve => setTimeout(resolve, 20)); running--; });
  const accepted = [task(), task(), task()];
  await assert.rejects(task(), error => error.httpStatus === 429 && /busy/i.test(error.message));
  await Promise.all(accepted);
  assert.equal(peak, 2);
});

test('a failed task releases its slot', async () => {
  const queue = createQueue({ parallel: 1, waiting: 2 });
  await assert.rejects(queue.run(async () => { throw new Error('source failed'); }), /source failed/);
  assert.equal(await queue.run(async () => 'next'), 'next');
});

test('a task that outlives its deadline frees the slot and reports a timeout', async () => {
  const queue = createQueue({ parallel: 1, waiting: 2, timeoutMs: 30 });
  await assert.rejects(queue.run(() => new Promise(() => {})), error => error.httpStatus === 504);
  assert.equal(await queue.run(async () => 'next'), 'next');
});
