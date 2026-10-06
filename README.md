<p align="center"><img src="demo/assets/banner.svg" alt="Pixel Web — the web, in pixels" width="100%"></p>

<p align="center">
  <a href="https://github.com/kenny2077/Pixel-Web/actions/workflows/ci.yml"><img src="https://github.com/kenny2077/Pixel-Web/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-ededed?labelColor=444444" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A522-ededed?labelColor=444444" alt="Node.js 22 or newer">
  <br>
  <a href="https://pixel-web-803742923007.us-central1.run.app/"><b>Open the demo</b></a> · <a href="#quick-start">Quick start</a> · <a href="#how-it-works">How it works</a> · <a href="README.zh-CN.md">中文</a>
</p>

Turn a public website into a full-page, clickable pixel-style preview. Keep its layout, recognizable images and working controls. Conversion uses image algorithms and pixel fonts, with no AI calls.

**[Open the interactive demo](https://pixel-web-803742923007.us-central1.run.app/)** or run the converter locally. The demo opens with a saved conversion of Wikipedia's Pixel art article and accepts public URLs. It runs on Google Cloud Run and scales to zero, so the first request after a quiet period starts a new instance. Pixel Web is an early release with documented compatibility limits.

<a href="https://pixel-web-803742923007.us-central1.run.app/"><img src="docs/assets/wikipedia-pixel-art.png" alt="Pixel Web showing Wikipedia's Pixel art article: the table of contents, article text and Appearance panel in pixel type, with the cat portrait re-rendered as pixel art." width="100%"></a>

<p align="center"><sub>Wikipedia's <i>Pixel art</i> article in Pixel Web. Layout, links and selectable text are kept; the artwork is re-rendered with a reduced palette.</sub></p>

## What it does

- **Full pages.** Rendered text, layout, columns, backgrounds and below-the-fold content are preserved.
- **Live controls.** Supported menus, buttons, inputs and forms are forwarded to an isolated source browser. Links continue in pixel mode.
- **Readable artwork.** Images and small icons get finer pixels and a larger palette than background artwork. Avatar shapes are preserved.
- **English and Chinese.** Self-hosted Pixelify Sans and Fusion Pixel CJK, with icon-font glyphs protected.
- **Style control.** Pixel headings, all pixel text or original fonts; adjustable background pixel size, palette and dithering.
- **Media and PDFs.** Supported dynamic media is captured as stills. PDF pages render with clickable annotations.

## Quick start

Requires **Node.js 22+**, **Python 3.10+** and a browser. macOS uses installed Google Chrome; Linux uses Playwright Chromium. Windows has not been verified.

```bash
git clone https://github.com/kenny2077/Pixel-Web.git
cd Pixel-Web
npm ci
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-pdf.txt

# Linux: also install the browser and its system dependencies
npx playwright install --with-deps chromium

npm start
```

Open **http://127.0.0.1:4173**, paste a public URL and select **Convert**. All pixel text is the default. Use **Style** to adjust the result or compare it with the original fonts and artwork.

To skip the Node, Python and browser setup, run the bundled image instead:

```bash
docker build -t pixel-web .
docker run --rm -p 127.0.0.1:4173:4173 pixel-web
```

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/architecture-dark.svg">
  <img src="docs/assets/architecture-light.svg" alt="An isolated Chromium context loads the public page and runs its scripts. Pixel Web snapshots the DOM and computed styles, converts artwork, and builds preview HTML. Your browser shows that HTML in an iframe that runs only Pixel Web's bridge script; clicks, typing and scrolling are replayed on the source page, which is then captured again." width="100%">
</picture>

The source page never runs in your browser. Pixel Web loads it in a separate Chromium context, scrolls it once so lazy and scroll-revealed content appears, then records the DOM, computed styles and the images, fonts and stylesheets it fetched.

Artwork goes through Lanczos resampling, weighted median-cut quantization and integer pixel replication in worker threads, one per available CPU, and is cached by content hash. Converted images and fonts are served as separate cacheable files, so the preview HTML stays small and style changes reuse unchanged artwork. The preview is rebuilt as plain HTML with pixel fonts, so text stays selectable and the layout matches the original. It is served under a strict Content Security Policy that allows only Pixel Web's bridge script. When you click, type or scroll, the bridge sends the action back; the server repeats it on the live source page and captures the result. A scroll that reveals nothing new keeps the current preview.

## Performance and hosting

Conversion time depends mostly on the source site and on available CPU. On Cloud Run with 1 vCPU, a warm conversion of Wikipedia's Pixel art article took 7.9–9.7 seconds; the same page took about 45 seconds on the earlier Render Free deployment with 0.1 CPU. These are single samples, not guarantees. See [Cloud Run deployment and measurements](docs/cloud-run.md), [measurement method](docs/performance.md) and [earlier Render Free samples](docs/access-and-latency.md).

| Platform | Role |
| --- | --- |
| **Local Node server** | Full converter with retained source sessions. The reference setup. |
| **Google Cloud Run** | Public demo: 1 vCPU, 4 GiB, one instance at most, scales to zero. Signed anonymous sessions; two retained pages, five-minute retention. |
| **GitHub Pages** | Redirects to the Cloud Run demo. |
| **GitHub Actions** | Lockfile install and automated tests only. |
| **Cloudflare Container** | Experimental configuration in `cloudflare/`. Requires Workers Paid; not deployed or measured. |

Changing provider does not remove source-page waits or source-site refusals. Compare cold starts and warm requests before claiming a speed improvement. [Hosting notes](docs/hosting.md).

## Compatibility and limits

- Requests wait in a first-in, first-out queue; when eight are already waiting, the server answers busy. Locally one conversion runs at a time (`PIXELWEB_MAX_PARALLEL` raises it) and three source sessions are kept for ten minutes. The public demo keeps two pages for five minutes, so other visitors' conversions can replace yours. A restart or scale-down ends all sessions.
- Initial captures have a 90-second deadline; interaction refreshes have 50 seconds. On heavy pages, slow fallbacks (video frames, element screenshots, rendered backgrounds) stop near the deadline and are listed as warnings. Readiness waits are bounded, so very late content can be missed.
- Videos are paused once they start, so previews show one still frame. Video buffering does not count toward the public demo's 96 MB download limit.
- Infinite feeds have no finite whole page. The converter traverses them within a bounded preparation window.
- Cross-origin iframe apps, WebSockets, uploads, downloads and device permissions are not fully proxied. CAPTCHAs, bot checks and login walls are not bypassed; pages that answer with one are reported as refusals with a link to the original site. Account and payment flows are not verified.
- Still media is a visual fallback; not every video player or canvas application remains functional.
- Private destinations are blocked. Hosted mode pins source connections to checked public addresses; local mode checks DNS but does not pin it. This is not a hardened public proxy: keep your own instance local or access-controlled. See [SECURITY.md](SECURITY.md).

## Development

```bash
pip install -r requirements-dev.txt
npm test                 # Serial algorithm, browser, layout, PDF and API tests
npm run check:repo       # Documentation links and portable dependency metadata
npm run verify           # Live website smoke checks; start the server first
```

Live checks save results to the ignored `artifacts/` directory. CI uses synthetic fixtures so upstream site changes cannot break every pull request. [CONTRIBUTING.md](CONTRIBUTING.md) covers the workflow, module map and commit style.

## License and credits

Code is [MIT licensed](LICENSE). Bundled fonts keep their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). Captured websites remain the property of their owners and subject to their terms.

Visual inspiration: [Sprite Fusion Destroy](https://destroy.spritefusion.com/).
