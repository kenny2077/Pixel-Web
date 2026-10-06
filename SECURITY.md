# Security

Pixel Web loads arbitrary public websites in a separate browser context. Source scripts execute in that browser. The preview does not receive source scripts or existing user cookies.

## Supported deployment boundary

The local default binds to `127.0.0.1`. The Render demo enables public-service mode with signed anonymous cookies, public-IP-pinned source connections and bounded capture retention. It is a low-traffic demonstration, not a security-audited general-purpose proxy. Cloudflare gateway mode is separate and remains undeployed.

Private and reserved addresses are checked, WebSockets are blocked, and source deadlines bound work. These controls do not make the converter a hardened public proxy. Local mode checks DNS but does not pin it; hosted mode pins source connections to the checked public address. A source can still run scripts and initiate public network requests. Do not expose an unauthenticated instance or use it for sensitive account, payment or administrative workflows.

Source sessions and converted artwork are kept in memory. Local sessions expire after ten minutes and Render demo sessions after five; restarting ends them. Do not submit private URLs or secrets in public issues, screenshots, logs or demo recordings.

## Report a vulnerability

Use the repository's **Security → Report a vulnerability** private reporting flow. Include a minimal reproduction, affected version and impact. Do not publish exploit details in an issue before a fix is available. This project has no guaranteed response SLA.
