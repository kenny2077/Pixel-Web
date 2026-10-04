# Performance verification

This pass keeps full-page traversal, image resolution, palette algorithms, source font capture and interaction settling unchanged.

Changes:
- A bottom scroll compares source text, links, page height, resolved image URLs and form state. Cosmetic attribute changes do not trigger a rebuild. If unchanged, the API returns `noChange` and keeps the preview iframe. Bottom checks do not show the full-page loading overlay.
- Converted artwork is cached by SHA-256 content and effective rendering parameters, with a 32 MB / 256-entry LRU limit. Readable images keep their existing 1-pixel / 128-color processing. Text-mode changes reuse the same artwork.
- Removed an unused whole-page PNG screenshot. Original view still uses the complete HTML snapshot and original artwork.
- Added separate navigation, preparation, resource, snapshot and artwork capture timings. Refresh timings now measure the current operation rather than elapsed session age.

Run `node scripts/performance-check.mjs before` on the original implementation and `node scripts/performance-check.mjs after` on the updated implementation. Reports are saved under `artifacts/`. Network timings are single samples, not percentile benchmarks. The repeated-image fixture measures deduplication; it is not a typical webpage.

## Cloudflare preview

The `cloudflare/` directory deploys a single Container using the same Node, Playwright, Sharp and PDF implementation. It preserves session routing by sending all requests to the named `performance-preview` instance. This is an isolated test, not a production multi-user service.

The Worker fails closed unless a `PREVIEW_AUTH` secret matches HTTP Basic credentials. Do not remove authentication from this experimental proxy. Local credentials belong in ignored `.cache/`, never in source files. Use an independent workers.dev URL; do not change the existing website or DNS.

Build with `docker build --platform linux/amd64 -t pixelweb-performance:local .`. Deploy from `cloudflare/` with `wrangler deploy`, then set `PREVIEW_AUTH` with `wrangler secret put PREVIEW_AUTH`. Unauthenticated requests must return 401 before benchmarking.

The container sleeps after ten idle minutes. Its memory-only source sessions and artwork cache disappear when it restarts. Measure cold container startup separately from warm conversions. Container availability and credits must be checked on the actual account; signing in does not confirm payment coverage.
