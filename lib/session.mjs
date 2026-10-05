import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export function cookieSession(cookie, key) {
  const token = cookie?.match(/(?:^|;\s*)pixelweb_session=([^;]+)/)?.[1];
  const [id, signature] = (token || '').split('.');
  const sign = value => createHmac('sha256', key).update(value).digest('hex');
  if (/^[a-f\d-]{36}$/.test(id || '') && /^[a-f\d]{64}$/.test(signature || '') && timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(id), 'hex'))) return { owner: id };
  const owner = randomUUID();
  return { owner, token: `${owner}.${sign(owner)}` };
}
