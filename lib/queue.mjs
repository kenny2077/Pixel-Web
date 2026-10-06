// First-in, first-out admission for browser work. Requests wait for a slot instead of failing;
// only an already long line is refused, so a burst cannot pile up past the request timeout.
// A task that outlives timeoutMs gives up its slot. On Cloud Run an abandoned request also loses its CPU,
// so waiting for it would block every later visitor.
export function createQueue({ parallel = 1, waiting = 8, timeoutMs = Infinity } = {}) {
  const line = [];
  const queue = {
    active: 0,
    get waiting() { return line.length; },
    async run(task) {
      if (queue.active < parallel) queue.active++;
      else {
        if (line.length >= waiting) throw Object.assign(new Error('The converter is busy. Try again in a minute.'), { httpStatus: 429 });
        await new Promise(resolve => line.push(resolve));
      }
      let timer;
      try {
        if (!Number.isFinite(timeoutMs)) return await task();
        const expired = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('The website took too long to convert. Try again or choose a lighter page.'), { httpStatus: 504 })), timeoutMs); });
        return await Promise.race([task(), expired]);
      }
      finally {
        clearTimeout(timer);
        // Hand the slot straight to the next request so a newcomer cannot jump the line.
        const next = line.shift();
        if (next) next(); else queue.active--;
      }
    },
  };
  return queue;
}
