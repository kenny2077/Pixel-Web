# Changelog

This project uses [Conventional Commits](CONTRIBUTING.md#commits-and-pull-requests). Version 0.x is experimental; compatibility and interfaces can change.

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
