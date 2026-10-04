# Contributing to Pixel Web

Follow the [README setup](README.md#quick-start), then install test dependencies with `pip install -r requirements-dev.txt` in the active Python environment. Run `npm test` and `npm run check:repo` before opening a pull request. Browser tests are serial to keep memory use predictable. `npm run verify` needs a running local server and network access; it is a smoke check, not a deterministic CI test.

## Report a rendering bug

Include a public source URL, viewport dimensions, style settings, expected result and actual result. Add original and converted screenshots when useful. Remove private data, credentials and account content. If possible, reduce the problem to a small HTML fixture and add a test that fails before your fix.

## Make a focused change

Keep the converter universal. Fix layout or capture rules at their source; avoid hostname-specific patches. Preserve full-page content, image detail, icon fonts, source semantics and Chinese/English text. Conversion must not depend on AI services.

| Directory | Responsibility |
| --- | --- |
| `lib/capture.mjs` | Source browser, preparation, DOM and artwork capture |
| `lib/pixels.mjs` | Deterministic pixel processing |
| `lib/preview.mjs` | Sanitized preview HTML and typography |
| `lib/interaction.mjs` | Forwarded source controls and change detection |
| `public/` | Converter shell and preview bridge |
| `tests/` | Synthetic regression fixtures |
| `demo/` | Static, recorded GitHub Pages showcase |

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
feat: add a new capability
fix: correct a rendering or interaction bug
perf: reduce work without changing results
docs: improve documentation or examples
test: add regression coverage
chore: update project tooling
ci: update automated checks
```

Use a short imperative subject. Add a scope when it helps, such as `fix(capture): preserve intrinsic grid rows`. Describe the problem, changed behavior, test evidence and limitations in the PR. Screenshots support visual changes; they do not replace functional tests. Do not claim broad compatibility from one successful website.
