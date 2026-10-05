# Render Free deployment

Service: https://pixel-web-a3t7.onrender.com/

Created 2026-10-05 from the public `kenny2077/Pixel-Web` repository, Docker runtime, Oregon region, Free compute: 512 MB RAM and 0.1 CPU. No paid compute plan, database, disk or Cloudflare subscription was enabled. Auto-deploy is off to limit build usage; deploy reviewed commits manually from Render.

The service uses the existing full-page converter. It starts at Wikipedia Pixel_art, accepts public URLs and forwards supported source controls. Node issues signed HttpOnly cookies, so visitors cannot choose an identity by sending a header. Hosted egress checks and pins public addresses.

## Actual verification

- Render build and health check succeeded on commit `42b95e5`.
- Wikipedia Pixel_art converted successfully: 24 images, approximately 40 seconds in one warm service request. This is not a latency guarantee.
- Example.com converted in about 3.6 seconds. Preview HTML, style switching and unchanged-scroll interaction passed. A second visitor cookie was denied access to preview and style endpoints belonging to the first visitor.
- The same page crashed during a local amd64-emulated 512 MB container test. Native Render succeeded; large or concurrent workloads remain limited.
- The free configuration retains one capture for five minutes and runs one conversion at a time. A new conversion replaces the previous capture. This is a low-traffic demo, not a multi-user production service.

## Free-plan behavior

Render currently provides 750 free instance hours per workspace per month. It sleeps after 15 minutes without inbound traffic; waking can take about a minute. Sessions and caches disappear after restart. Free hours being exhausted suspends free services. Outbound bandwidth and build minutes have separate limits; accounts with payment methods can incur supplemental usage charges. No artificial keep-alive is configured.

Before adding a payment method, review workspace billing and usage limits if zero spend is required. No billing credentials were added during this deployment. See [Render Free documentation](https://render.com/docs/free).

## Configuration

`render.yaml` records the Free plan, `/health`, public cookie mode, one capture, five-minute retention and Node heap limit. No API secret is required. The ephemeral cookie signing key is generated in memory when the server starts; restarts invalidate old cookies.

Large downloaded resources and oversized PDF geometry are rejected rather than silently truncated. The public demo cannot promise support for every site, CAPTCHA, account flow, video application or unusually large document. Full local operation remains available.
