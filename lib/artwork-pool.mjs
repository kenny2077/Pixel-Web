import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { readFileSync } from 'node:fs';

// Containers report the host's cores; the cgroup quota ("200000 100000" = 2 CPUs) is the real limit.
export function cpuLimit(quota = readQuota()) {
  const [limit, period] = String(quota || '').trim().split(/\s+/).map(Number);
  if (limit > 0 && period > 0) return Math.max(1, Math.floor(limit / period));
  return Math.max(1, availableParallelism());
}
function readQuota() { try { return readFileSync('/sys/fs/cgroup/cpu.max', 'utf8'); } catch { return null; } }

// Median-cut quantization runs in JavaScript, so artwork uses one core unless it runs in worker threads.
export function createArtworkPool({ size = cpuLimit() } = {}) {
  const workers = [], queue = [], jobs = new Map();
  let nextId = 0;
  const start = () => {
    const worker = new Worker(new URL('./artwork-worker.mjs', import.meta.url));
    worker.online = new Promise(resolve => worker.once('online', resolve));
    worker.unref();
    worker.on('message', ({ id, output, error }) => {
      const job = jobs.get(id);
      jobs.delete(id); worker.job = null; worker.unref();
      if (error) job.reject(new Error(error)); else job.resolve(Buffer.from(output.buffer, output.byteOffset, output.byteLength));
      dispatch();
    });
    worker.on('error', error => {
      const job = worker.job && jobs.get(worker.job);
      if (job) { jobs.delete(worker.job); job.reject(error); }
      workers.splice(workers.indexOf(worker), 1);
      dispatch();
    });
    workers.push(worker);
    return worker;
  };
  const dispatch = () => {
    while (queue.length) {
      const worker = workers.find(candidate => !candidate.job) || (workers.length < size ? start() : null);
      if (!worker) return;
      const job = queue.shift();
      worker.job = job.id; worker.ref();
      worker.postMessage({ id: job.id, input: job.input, options: job.options });
    }
  };
  return {
    size,
    // Start every worker now so the first conversion does not pay for thread and sharp start-up.
    warm() { while (workers.length < size) start(); return Promise.all(workers.map(worker => worker.online)); },
    run(input, options) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        jobs.set(id, { resolve, reject });
        queue.push({ id, input, options });
        dispatch();
      });
    },
    async close() { await Promise.all(workers.splice(0).map(worker => worker.terminate())); },
  };
}
