import test from 'node:test';
import assert from 'node:assert/strict';
import * as urls from '../lib/urls.mjs';

test('URL input accepts public HTTP URLs and refuses credentials and unsafe protocols', () => {
  assert.equal(typeof urls.normalizeUrl, 'function');
  assert.equal(urls.normalizeUrl('example.com'), 'https://example.com/');
  for (const input of ['file:///etc/passwd', 'javascript:alert(1)', 'https://u:p@example.com', 'http://localhost', 'http://127.0.0.1', 'http://[::1]']) {
    assert.throws(() => urls.normalizeUrl(input));
  }
});

test('private, reserved and mapped private IPs are blocked', () => {
  assert.equal(typeof urls.isPublicIP, 'function');
  for (const address of ['127.0.0.1', '10.2.3.4', '172.16.2.3', '192.168.1.1', '169.254.169.254', '100.64.1.1', '0.0.0.0', '224.1.1.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) assert.equal(urls.isPublicIP(address), false, address);
  assert.equal(urls.isPublicIP('93.184.216.34'), true);
  assert.equal(urls.isPublicIP('2606:4700:4700::1111'), true);
});
