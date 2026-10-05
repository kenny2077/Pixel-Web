# Render Free pre-deployment review

Reviewed on 2026-10-05 using independent Standards and Spec reviewers.

## Standards

Credential pattern scan covered all eight existing commits and 91 unique tracked blobs. No matching private keys or provider tokens were found. This is a bounded scan, not a guarantee that every possible secret format was detected. The only personal machine path was a development Python fallback; current code resolves it from the home directory. Fixture addresses and upstream font-license contacts are retained.

Fixed: Node now issues HMAC-signed HttpOnly cookies for standalone hosting and ignores caller-supplied identity headers. Explicit gateway mode remains available for Cloudflare. Capture entries expire and release resources; old captures are evicted before a new browser context starts. Failed preview generation closes its source session. PDF geometry is checked before raster allocation. Hosted downloads have decoded byte budgets; image/font/style response copies are serialized.

## Spec

The deployment selects Render's Free plan only: 512 MB RAM / 0.1 CPU, one retained capture, five-minute source retention and manual deployments. It uses the same converter and defaults to Wikipedia Pixel_art. The Cloudflare paid plan is not used.

The default page exceeded a local emulated Linux 512 MB memory limit during snapshot generation. Example.com passed. Render's native environment must be checked before calling the demo compatible or promoting its URL. Heavy websites may not fit Free resources. Service sleep and restart discard sessions.

## Verification scope

Local suite: 51 tests before the final shared-download-budget and failure-cleanup adjustments; affected tests rerun after those adjustments. GitHub CI for commit 42b95e5 passed. No full public-web security certification is claimed. Network, session, memory and source-site compatibility still require actual service smoke checks.

Actual Render checks subsequently passed: Wikipedia Pixel_art (24 images, about 40 seconds), Example.com (about 3.6 seconds), HTML preview, Style switch and unchanged scroll interaction. Secure HttpOnly cookies are issued; a second visitor cannot fetch or restyle the first visitor's capture. Large-site memory limits and the one-capture policy remain explicit. Chrome automation became unavailable after service creation, so final interaction evidence uses HTTP/API smoke checks rather than a completed visual browser pass.
