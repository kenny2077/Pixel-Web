# Google Cloud Run deployment

Service: https://pixel-web-803742923007.us-central1.run.app/

Created 2026-10-06 in project `pixel-web-demo`, region `us-central1`. It runs the same Dockerfile as Render, with more CPU and memory.

## Configuration

| Setting | Value | Why |
| --- | --- | --- |
| CPU / memory | 1 vCPU, 2 GiB | Chromium snapshot and artwork work is CPU-bound; 0.1 CPU was the main cause of 45-second conversions on Render. |
| Instances | 0 to 1 | Sessions and caches live in memory, so all visitors must reach the same instance. Scaling to zero keeps idle cost at zero. |
| Billing | Request-based (default) | CPU is billed only while a request is in flight. |
| Execution environment | Second generation, startup CPU boost | Full Linux system calls for Chromium; faster cold starts. |
| Concurrency / timeout | 20 requests, 120 seconds | One conversion runs at a time; static files and previews are served alongside it. |
| Environment | `PIXELWEB_PUBLIC_SERVICE=1`, `PIXELWEB_SESSION_MODE=cookie`, `PIXELWEB_MAX_CAPTURES=2`, `PIXELWEB_SESSION_MS=300000` | Signed anonymous cookies, pinned egress, two retained pages for five minutes. |

Cloud Run sends `X-Forwarded-Proto: https`, so session cookies are marked `Secure`. Cloud Run does not compress responses; the server gzips text itself. A Wikipedia preview is about 3.7 MB of HTML and 1.1 MB on the wire.

## Cost controls

- A $5 monthly budget on the billing account alerts at 20%, 50% and 100% of actual spend and 100% of forecast spend. Alerts do not stop the service.
- At most one instance can run.
- The Artifact Registry repository keeps only the newest image (about 370 MB compressed, within the 0.5 GB free storage).

At this traffic, usage should stay within Cloud Run's free monthly allowance (180,000 vCPU-seconds and 360,000 GiB-seconds). A Wikipedia conversion uses roughly 7–9 vCPU-seconds. The account started on Google's free trial; the service stops when the trial ends unless the billing account is upgraded.

## Deploy

```bash
gcloud run deploy pixel-web --source . --region us-central1 --project pixel-web-demo \
  --allow-unauthenticated --cpu 1 --memory 2Gi --min-instances 0 --max-instances 1 \
  --concurrency 20 --timeout 120 --execution-environment gen2 --cpu-boost \
  --set-env-vars PIXELWEB_PUBLIC_SERVICE=1,PIXELWEB_SESSION_MODE=cookie,PIXELWEB_MAX_CAPTURES=2,PIXELWEB_SESSION_MS=300000
```

`.gcloudignore` limits the upload to the files the Dockerfile copies. Cloud Build builds the image remotely for `linux/amd64`.

## Measurements

Single samples from a client in the United States, 2026-10-06. These are not percentile guarantees.

| Request | Cloud Run (1 vCPU) | Render Free (0.1 CPU) |
| --- | --- | --- |
| Wake from idle to first response | pending measurement | 42.6 s |
| Landing page with saved example visible | 0.8–1.2 s warm | (live conversion: about 90 s from cold) |
| Example.com conversion | 1.6 s | 5.4 s |
| Wikipedia Pixel_art conversion | 8.6 s first, 6.8 s with cached artwork | 44.2 s |
| GitHub repository page conversion | 9.9 s | not measured |

Wikipedia stages on Cloud Run: navigation 2.2 s, preparation 2.0 s, snapshot 2.1 s, artwork 1.5 s. Navigation time depends on the source site and is not reduced by more CPU.
