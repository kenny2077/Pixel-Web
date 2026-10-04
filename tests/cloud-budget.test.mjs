import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveRuntime, reservationMs, runtimeLimitMs } from '../cloudflare/budget.mjs';

test('runtime reservations cover overlapping activity and preserve the monthly limit', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');
  const first = reserveRuntime(null, now);
  assert.equal(first.ledger.usedMs, reservationMs);
  const next = reserveRuntime(first.ledger, now + 1000);
  assert.equal(next.ledger.usedMs, reservationMs + 1000);
  assert.equal(reserveRuntime({ ...next.ledger, usedMs: runtimeLimitMs }, now + 2000).allowed, false);
  assert.equal(reserveRuntime({ ...next.ledger, requests: 3000 }, now + 2000).allowed, false);
  const month = reserveRuntime(next.ledger, Date.parse('2026-11-01T00:00:00Z'));
  assert.equal(month.ledger.usedMs, reservationMs);
  assert.equal(month.ledger.requests, 1);
});
