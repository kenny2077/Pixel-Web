# Security

Pixel Web loads arbitrary public websites in a separate browser context. Source scripts execute in that browser. The preview does not receive source scripts or existing user cookies.

## Supported deployment boundary

The default server binds to `127.0.0.1`. Keep it local. An experimental hosted instance must have authentication and controlled access. The Cloudflare Worker fails closed without its preview authentication secret.

Private and reserved addresses are checked, WebSockets are blocked, and source deadlines bound work. These controls do not make the converter a hardened public proxy. DNS is checked but not pinned; a source can also run scripts and initiate public network requests. Do not expose an unauthenticated instance or use it for sensitive account, payment or administrative workflows.

Source sessions and converted artwork are kept in memory. Sessions expire after ten minutes; restarting ends them. Do not submit private URLs or secrets in public issues, screenshots, logs or demo recordings.

## Report a vulnerability

Use the repository's **Security → Report a vulnerability** private reporting flow. Include a minimal reproduction, affected version and impact. Do not publish exploit details in an issue before a fix is available. This project has no guaranteed response SLA.
