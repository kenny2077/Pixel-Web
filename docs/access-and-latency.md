# Source access and latency

Checked 2026-10-05.

HTTP 999 was reproduced for the supplied LinkedIn profile from both Render and a local anonymous Chrome context. The local response points to an authwall. Conversion is stopped before snapshot/image processing. This is source access refusal, not insufficient converter CPU. HTTP 403/999 and 429 now carry separate source-error codes; denied pages offer an original-site link. No login cookies, proxy rotation or anti-bot bypass were added.

The Render Free baseline measured approximately 42.4 seconds to wake the health endpoint, 2.8 seconds for a warm Example.com conversion and 48.0 seconds for Wikipedia Pixel_art. The Wikipedia sample spent 15.9 seconds in snapshot generation and 11.5 seconds in artwork processing. These are individual samples, not percentile guarantees.

After deploying e75caea, one warm sample measured 3.2 seconds end to end for Example.com (2.9 seconds server processing) and 45.0 seconds end to end for Wikipedia Pixel_art (44.9 seconds server processing). Wikipedia retained 2,758 elements, 23 images and a 15,797-pixel page height. Snapshot generation took 14.7 seconds and artwork processing 10.1 seconds. The sample improved from 48.0 to 44.9 seconds server processing, but does not meet the ten-second heavy-page target or establish a percentile improvement. LinkedIn still refused access in 4.5 seconds, now with the structured error and original-site action.

This pass batches interaction metadata writes, serializes CSS declarations in one operation and skips resampling/replication when image cells are already one pixel. A deterministic fixture confirmed identical RGBA output for that fast path. Full-page traversal, palette sizes and image-resolution policy remain unchanged.

Targets of five seconds for small pages and ten seconds for heavier pages should be evaluated on a warm service. Render Free's 0.1 CPU and sleep behavior cannot guarantee those targets. Cloudflare is optional; changing provider does not remove source refusals. Adequate CPU, memory and an available warm backend matter more than the provider name.

Sources: [Render compute](https://render.com/docs/compute-plans), [Render Free](https://render.com/docs/free), [Cloudflare Container pricing](https://developers.cloudflare.com/containers/platform/pricing/), [LinkedIn access restrictions](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibition-of-scraping-software?intendedLocale=en&lang=en-us).
