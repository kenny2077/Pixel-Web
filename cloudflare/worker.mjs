import { Container, getContainer } from '@cloudflare/containers';

export class PixelWebContainer extends Container {
  defaultPort = 4173;
  sleepAfter = '10m';
}

export default {
  async fetch(request, env) {
    // Keep the test deployment private. Missing credentials fail closed.
    if (!env.PREVIEW_AUTH || request.headers.get('Authorization') !== `Basic ${env.PREVIEW_AUTH}`) {
      return new Response('Sign in to the PixelWeb performance preview.', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="PixelWeb preview", charset="UTF-8"', 'Cache-Control': 'no-store' },
      });
    }
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return new Response('Invalid origin', { status: 403 });
    return getContainer(env.PIXELWEB, 'performance-preview').fetch(request);
  },
};
