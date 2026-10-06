import { Container, getContainer } from '@cloudflare/containers';
import { reserveRuntime } from './budget.mjs';

export class PixelWebContainer extends Container {
  defaultPort = 4173;
  pingEndpoint = '/health';
  sleepAfter = '2m';
  envVars = { PIXELWEB_PUBLIC_SERVICE: '1', PIXELWEB_SESSION_MODE: 'gateway' };

  async fetch(request) {
    const allowed = await this.ctx.storage.transaction(async storage => {
      const result = reserveRuntime(await storage.get('runtime-budget'));
      if (result.allowed) await storage.put('runtime-budget', result.ledger);
      return result.allowed;
    });
    if (!allowed) {
      await this.stop();
      return Response.json({ error: 'The public demo has reached its monthly limit. Please run Pixel Web locally.' }, { status: 429 });
    }
    return super.fetch(request);
  }
}

export default {
  async fetch(request, env) {
    const publicDemo = env.PUBLIC_DEMO === 'true';
    // Public access is enabled only after the hosted backend passes verification.
    if (!publicDemo && (!env.PREVIEW_AUTH || request.headers.get('Authorization') !== `Basic ${env.PREVIEW_AUTH}`)) {
      return new Response('Sign in to the PixelWeb performance preview.', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="PixelWeb preview", charset="UTF-8"', 'Cache-Control': 'no-store' },
      });
    }
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return new Response('Invalid origin', { status: 403 });
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/') && !/^\/(preview|original|showcase)\//.test(path)) return env.ASSETS.fetch(request);
    const supplied = request.headers.get('Cookie')?.match(/(?:^|;\s*)pixelweb_session=([a-f\d-]{36})(?:;|$)/)?.[1];
    const session = supplied || crypto.randomUUID();
    const headers = new Headers(request.headers);
    headers.set('X-PixelWeb-Session', session);
    const response = await getContainer(env.PIXELWEB, 'performance-preview').fetch(new Request(request, { headers }));
    const outgoing = new Response(response.body, response);
    if (!supplied) outgoing.headers.append('Set-Cookie', `pixelweb_session=${session}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400`);
    return outgoing;
  },
};
