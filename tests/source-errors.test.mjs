import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceHttpError } from '../lib/source-errors.mjs';

test('source refusal and rate limits remain distinguishable from converter failures', () => {
  const denied = sourceHttpError(999);
  assert.equal(denied.code, 'SOURCE_ACCESS_DENIED');
  assert.equal(denied.sourceStatus, 999);
  assert.match(denied.message, /denied access/);
  assert.match(denied.message, /original website/);
  assert.equal(sourceHttpError(429).code, 'SOURCE_RATE_LIMITED');
  assert.equal(sourceHttpError(503).code, 'SOURCE_HTTP_ERROR');
});
