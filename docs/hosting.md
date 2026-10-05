# Hosting the demo and converter

**Current deployment (2026-10-05):** [Render Free](https://pixel-web-a3t7.onrender.com/) runs the interactive converter. GitHub Pages redirects there. See [configuration and measured limits](render.md). The recorded showcase described below is historical.

## GitHub Pages: recorded showcase

The `demo/` directory is a small static site. Its Original/Pixel switch displays real, pre-recorded screenshots. It makes no source-site requests and no AI calls. It is useful for seeing the visual result, but cannot convert a pasted URL.

The Pages workflow publishes that directory from `main`. GitHub Actions builds and uploads it; GitHub Pages serves it afterward. Visitors do not start an Actions job, so website traffic does not consume browser-runner minutes.

## GitHub Actions: tests

CI installs Node, Python PDF support and Chromium, then runs serial fixture tests. It does not start a persistent service. A fresh Actions job has startup and scheduling overhead, and cannot preserve user browser sessions between requests. Use it for tests and optional offline performance samples.

## Cloudflare: future conversion service

`cloudflare/` contains an experimental single-container configuration. It runs the same Node, Chromium, Sharp and Python pipeline rather than reducing conversion quality. The Worker requires HTTP Basic authentication through a `PREVIEW_AUTH` secret and routes all preview requests to the same instance so sessions remain available.

The account check on 2026-10-04 returned that Workers Paid was required. No service was deployed and no paid plan was enabled. Credits were not verified. The Docker build was stopped when cloud deployment was deferred, so the container build remains unverified.

Cloud deployment can help availability and capacity. Single-request latency still depends on source network time, page preparation and processing. A sleeping container adds cold-start time. Session and artwork caches are memory-only and disappear on restart. The current single-worker limit is unsuitable for a public multi-user launch.

Before a hosted launch, validate authentication, egress protection, bounded queues, per-user session routing, resource limits and cold/warm timings. Keep the local server as the reference. Do not claim Cloudflare is faster without comparable measurements.

Sources: [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Cloudflare Containers](https://developers.cloudflare.com/containers/), [measurement notes](performance.md).
