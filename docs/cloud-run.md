# Google Cloud Run deployment

Service: https://pixel-web-803742923007.us-central1.run.app/

Created 2026-10-06 in project `pixel-web-demo`, region `us-central1`. It replaced the Render Free deployment and uses the repository Dockerfile.

## Configuration

| Setting | Value | Why |
| --- | --- | --- |
| CPU / memory | 4 vCPU, 8 GiB | Chromium and artwork work are CPU-bound; artwork runs in one worker thread per CPU. A Hugging Face monthly paper listing (43 autoplaying videos, 321 images) ran out of memory at 2 GiB with one conversion; 8 GiB leaves room for two at once. |
| Instances | 0 to 1 | Sessions and caches live in memory, so all visitors must reach the same instance. Scaling to zero keeps idle cost at zero. |
| Billing | Request-based (default) | CPU is billed only while a request is in flight. |
| Execution environment | Second generation, startup CPU boost | Full Linux system calls for Chromium; faster cold starts. |
| Concurrency / timeout | 20 requests, 300 seconds | Two conversions run at once (`PIXELWEB_MAX_PARALLEL=2`); up to eight more wait in line. A conversion that runs past 150 seconds gives up its slot, because a request Cloud Run has cut off loses its CPU and would otherwise block the queue. |
| Environment | `PIXELWEB_PUBLIC_SERVICE=1`, `PIXELWEB_SESSION_MODE=cookie`, `PIXELWEB_MAX_CAPTURES=3`, `PIXELWEB_MAX_PARALLEL=2`, `PIXELWEB_SESSION_MS=300000` | Signed anonymous cookies, pinned egress, three retained pages for five minutes. |

Cloud Run sends `X-Forwarded-Proto: https`, so session cookies are marked `Secure`. Cloud Run does not compress responses; the server gzips text itself. Previews reference converted images and fonts as separate cacheable files, so a Wikipedia preview downloads about 0.4 MB instead of 3.6 MB.

## Cost controls

- A $5 monthly budget on the billing account alerts at 20%, 50% and 100% of actual spend and 100% of forecast spend. Alerts do not stop the service.
- At most one instance can run.
- The Artifact Registry repository keeps only the newest image (about 370 MB compressed, within the 0.5 GB free storage).

Cloud Run's free monthly allowance is 180,000 vCPU-seconds and 360,000 GiB-seconds. At 4 vCPU and 8 GiB, a 10-second conversion uses about 40 vCPU-seconds and 80 GiB-seconds, so the allowance covers about 4,500 such conversions a month. Beyond it, request-based billing costs about $0.0009 per 10-second conversion, paid from the trial credit while it lasts. The account started on Google's free trial; the service stops when the trial ends unless the billing account is upgraded.

## Deploy

```bash
gcloud run deploy pixel-web --source . --region us-central1 --project pixel-web-demo \
  --allow-unauthenticated --cpu 4 --memory 8Gi --min-instances 0 --max-instances 1 \
  --concurrency 20 --timeout 300 --execution-environment gen2 --cpu-boost \
  --set-env-vars PIXELWEB_PUBLIC_SERVICE=1,PIXELWEB_SESSION_MODE=cookie,PIXELWEB_MAX_CAPTURES=3,PIXELWEB_MAX_PARALLEL=2,PIXELWEB_SESSION_MS=300000
```

`.gcloudignore` limits the upload to the files the Dockerfile copies. Cloud Build builds the image remotely for `linux/amd64`.

## CPU comparison

Sequential conversions of the same pages, 2026-10-06, single samples. The 1 vCPU column predates queueing, worker threads and separate preview files. Transfer is the compressed preview plus its files.

| Page | 1 vCPU, earlier code | 2 vCPU | 4 vCPU |
| --- | --- | --- | --- |
| Wikipedia Pixel_art | 8.9 s, 3.6 MB | 9.4 s, 0.4 MB | 10.1 s, 0.4 MB |
| The Guardian | 44.9 s, 9.1 MB | 27.9 s, 4.3 MB | 23.9 s, 4.3 MB |
| Stripe | 107.0 s, 11.4 MB | 53.5 s, 4.1 MB | 37.3 s, 4.1 MB |
| Bilibili | 35.3 s, 15.4 MB | 38.9 s, 8.0 MB | 22.6 s, 6.6 MB |
| Vercel | 46.7 s, 1.6 MB | 14.7 s, 0.6 MB | 12.5 s, 0.6 MB |
| Notion | 43.5 s, 2.9 MB | 8.7 s, 0.8 MB | 15.5 s, 0.8 MB |
| Hugging Face monthly papers | failed | 57.3 s, 6.1 MB | 54.4 s, 6.2 MB |
| **Nine pages that converted everywhere** | **327 s, 60 MB** | **192 s, 25 MB** | **164 s, 24 MB** |

Artwork time across those nine pages fell from 106 s to 48 s (2 vCPU) and 31 s (4 vCPU). Navigation barely changed, because it waits on the source sites. Small pages gain little from more CPUs; image-heavy pages gain most. CNN and Amazon answered these runs with an error page and a bot check, which are now reported as refusals instead of converted.

## Measurements

Single samples from a client in the United States, 2026-10-06. These are not percentile guarantees.

| Request | Cloud Run (1 vCPU) | Render Free, removed (0.1 CPU) |
| --- | --- | --- |
| Wake from idle to first response | 1.9 s (Chromium ready 2.2 s later; Wikipedia then 7.3 s) | 42.6 s |
| Landing page with saved example visible | 0.8–1.2 s warm | (live conversion: about 90 s from cold) |
| Example.com conversion | 1.6–2.1 s | 5.4 s |
| Wikipedia Pixel_art conversion | 9.7 s first, 7.9 s with cached artwork | 44.2 s |
| GitHub repository page conversion | 9.9 s | not measured |
| Hugging Face monthly papers (321 images, 43 videos) | 48–67 s, about 23 video frames skipped | failed at the download limit |

Wikipedia stages on Cloud Run (commit `c2e0224`): navigation 1.7 s, preparation 3.5 s, snapshot 2.1 s, artwork 1.5 s. The cold-start row was measured on the previous revision, whose scroll preparation waited less per step. Navigation time depends on the source site and is not reduced by more CPU.
