// First-in, first-out admission for browser work. Requests wait for a slot instead of failing;
// only an already long line is refused, so a burst cannot pile up past the request timeout.
export function createQueue({ parallel = 1, waiting = 8 } = {}) {
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
      try { return await task(); }
      finally {
        // Hand the slot straight to the next request so a newcomer cannot jump the line.
        const next = line.shift();
        if (next) next(); else queue.active--;
      }
    },
  };
  return queue;
}
