import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

export function isPublicIP(address) {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    // Special-purpose ranges are matched to their exact size; 192.0.66.0/24, for example, serves real sites.
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 88 && c === 99) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(ip) !== 6) return false;
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice(7);
    if (isIP(mapped) === 4) return isPublicIP(mapped);
    const parts = mapped.split(':');
    if (parts.length !== 2) return false;
    const n = parseInt(parts[0], 16) * 65536 + parseInt(parts[1], 16);
    return isPublicIP([n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255].join('.'));
  }
  // Only globally routable IPv6 unicast. Exclude documentation and transition ranges.
  return /^[23]/.test(ip) && !ip.startsWith('2001:db8') && !ip.startsWith('2002:') && !ip.startsWith('2001:0:');
}

export function normalizeUrl(input) {
  const text = String(input || '').trim();
  if (!text) throw new Error('Enter a public website URL.');
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS URL without credentials.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || (isIP(hostname) && !isPublicIP(hostname))) throw new Error('Only public websites can be converted.');
  return url.href;
}

export async function assertPublicUrl(input) {
  const url = normalizeUrl(input);
  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(v => !isPublicIP(v.address))) throw new Error('This URL does not resolve to a public website.');
  return url;
}
