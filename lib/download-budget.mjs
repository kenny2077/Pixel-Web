// Watch decoded download sizes before Playwright copies response bodies into Node.
// Video buffering stays inside Chromium and is not copied into Node, so it is not counted toward the total.
export async function watchDownloads(page, { maxResourceBytes = 6_000_000, maxTotalBytes = 96_000_000, state = { total: 0 } } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const requests = new Map();
  const stop = () => {
    if (state.error) return;
    state.error = new Error('This page exceeds the public demo download limit. Run Pixel Web locally for larger pages.');
    page.context().close().catch(() => {});
  };
  cdp.on('Network.responseReceived', ({ requestId, type, response }) => {
    const limited = ['Image', 'Font', 'Stylesheet'].includes(type);
    requests.set(requestId, { bytes: 0, limited, media: type === 'Media' });
    const length = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'content-length')?.[1];
    if (limited && Number(length) > maxResourceBytes) stop();
  });
  cdp.on('Network.dataReceived', ({ requestId, dataLength }) => {
    const request = requests.get(requestId);
    if (!request?.media) state.total += dataLength;
    if (request) request.bytes += dataLength;
    if (state.total > maxTotalBytes || (request?.limited && request.bytes > maxResourceBytes)) stop();
  });
  cdp.on('Network.loadingFinished', ({ requestId }) => requests.delete(requestId));
  cdp.on('Network.loadingFailed', ({ requestId }) => requests.delete(requestId));
  await cdp.send('Network.enable');
  return { get error() { return state.error; } };
}
