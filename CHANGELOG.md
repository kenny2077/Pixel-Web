# Changelog

This project uses [Conventional Commits](CONTRIBUTING.md#commits-and-pull-requests). Version 0.x is experimental; compatibility and interfaces can change.

## Unreleased

### Features

- Public Cloud Run demo (1 vCPU, 2 GiB, at most one instance, scales to zero).
- The converter opens with a saved Wikipedia conversion and starts Chromium in the background; links and controls load the live page.
- Hosted public-service mode with HMAC-signed anonymous sessions and per-visitor capture ownership.
- The Render Free deployment was replaced by Cloud Run and removed.
- Hosted source connections are pinned to checked public addresses.
- Source refusals (HTTP 403/999 and 429) return structured errors with a link to the original site.

### Performance

- Scroll preparation waits only while the page is still changing: Wikipedia preparation fell from 4.4 to 3.4 seconds locally.
- Snapshots omit declarations the preview reproduces from inheritance or browser defaults: Wikipedia's snapshot HTML fell from 6.3 MB to 2.3 MB with identical rendering on the sites checked.
- Text responses are gzip-compressed; the Docker image installs only Chromium's headless shell (1.0 GB to 0.37 GB compressed).
- Chromium starts at boot and after `/api/warm`, not on the first conversion.
- Batch interaction metadata writes, serialize CSS declarations in one pass and skip resampling for one-pixel image cells.

### Documentation

- README screenshot, architecture diagram with light and dark variants, and a Docker quick start.
- Deployed latency samples and Cloud Run hosting notes.

## 0.1.0 — 2026-10-04

### Features

- Full-page public website conversion with preserved DOM, layout and selectable text.
- Isolated source sessions for supported controls, inputs and link navigation.
- English and Chinese pixel typography; source icon-font preservation.
- Fine image processing, configurable background artwork and original-view comparison.
- Static media fallback and rendered PDFs with link annotations.

### Fixes

- Preserve circular avatars, control geometry, multi-column references and intrinsic document flow.
- Keep lazy and scroll-revealed content within the bounded capture window.

### Performance

- Reuse transformed artwork with a bounded content cache.
- Skip preview rebuilds for bottom-scroll checks with no meaningful change.
- Remove an unused full-page screenshot and record separate capture-stage timings.

### Project

- Publish documentation, MIT license, contribution templates and automated CI.
- Add a recorded GitHub Pages comparison. Hosted conversion remains experimental and undeployed.
