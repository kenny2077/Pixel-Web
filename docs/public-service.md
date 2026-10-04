# Public interactive service preparation

The local interface now opens `https://en.wikipedia.org/wiki/Pixel_art` when no URL is supplied. A supplied URL still takes priority. The GitHub README links to the demo instead of embedding its large screenshot.

The intended hosted interface is the same full-viewport toolbar, with no login, signup or marketing screen. Worker static assets serve the current `public/` shell. API and capture requests go to the existing converter Container. GitHub Pages will link or redirect to that service only after it is verified; the currently published Pages site remains a recorded comparison.

## Budget selected by the owner

Target: $5/month base Workers Paid plan, included usage only. No plan or paid resource has been activated by this implementation.

The prepared single `standard-1` instance has 4 GiB memory and 0.5 vCPU, and sleeps after two idle minutes. A persistent Durable Object ledger reserves overlapping ten-minute activity windows, allowing at most three reserved runtime hours and 3,000 backend requests per UTC month. At the runtime allowance this represents 12 GiB-hours and at most 90 vCPU-minutes for the selected instance, before other account usage. A denied reservation stops the container and returns a clear monthly-limit error. Cold startup, reservations and unused reserved idle time intentionally reduce the number of conversions available.

This is a conservative application admission limit, not a provider billing hard cap. It has not yet been validated against Cloudflare runtime metering. Quotas are shared with other account services; Workers/Durable Objects/network charges and taxes may apply. Do not enable the public service until account-wide included-usage headroom and billing settings have been reviewed. Do not claim an absolute $5 account bill.

## Anonymous session boundary

The gateway assigns a random HttpOnly session cookie and replaces the session header before forwarding. Capture entries store the owner; another session cannot retrieve or interact with that entry. Local operation remains unchanged. Public access is disabled by default (`PUBLIC_DEMO=false`). The existing private preview credential remains required until public mode is explicitly enabled after verification.

## Remaining launch checks

- Enable the Workers Paid base plan in the owner's account without enabling additional paid products.
- Validate the complete Linux container, PDF rendering, memory use and page interactions.
- Verify Durable Object reservations and idle shutdown in the actual platform.
- Add and verify source-network isolation before anonymous public access. Current URL checks do not pin DNS; the converter is not yet a hardened public proxy.
- Verify two independent visitor sessions cannot read or control each other.
- Enable public mode and update the Pages destination only after those checks pass.

Source pricing, checked 2026-10-04: https://developers.cloudflare.com/containers/platform/pricing/
