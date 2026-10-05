export function sourceHttpError(status) {
  if (status === 999 || status === 403) {
    return Object.assign(new Error(`This website denied access to the converter (HTTP ${status}). Open the original website or choose another public page.`), { code: 'SOURCE_ACCESS_DENIED', sourceStatus: status });
  }
  if (status === 429) return Object.assign(new Error('This website is limiting requests (HTTP 429). Wait before trying again.'), { code: 'SOURCE_RATE_LIMITED', sourceStatus: status });
  return Object.assign(new Error(`The source website returned HTTP ${status}. Try another public page.`), { code: 'SOURCE_HTTP_ERROR', sourceStatus: status });
}
