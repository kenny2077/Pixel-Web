// Reserve runtime conservatively, including startup, action and idle shutdown time.
export const runtimeLimitMs = 3 * 60 * 60_000;
export const reservationMs = 10 * 60_000;
export function reserveRuntime(previous, now = Date.now()) {
  const month = new Date(now).toISOString().slice(0, 7);
  const ledger = previous?.month === month ? previous : { month, usedMs: 0, until: 0, requests: 0 };
  const until = now + reservationMs;
  const usedMs = ledger.usedMs + Math.max(0, until - Math.max(now, ledger.until));
  if (usedMs > runtimeLimitMs || ledger.requests >= 3000) return { allowed: false, ledger };
  return { allowed: true, ledger: { month, usedMs, until, requests: ledger.requests + 1 } };
}
