# Repository presentation reference

Reviewed [Hermes Agent](https://github.com/NousResearch/hermes-agent) on 2026-10-04 at observed main commit `af90026aa09949579bd423d24def3d38f743cde0`.

Its README opens with a brand banner and useful entry links, then explains capabilities, setup and documentation. The inspected README uses a banner and badges; it does not embed a screenshot gallery or video. Its assets folder mostly holds Nous/Hermes brand graphics. Product screenshots live under its documentation website.

Pixel Web borrows the information order: identity, purpose, visual proof, quick start, capabilities, operation, limitations and contribution paths. Its own visual conversion result leads the demo. No upstream brand artwork, screenshots, code or substantial README text is copied.

Sources: [README](https://github.com/NousResearch/hermes-agent/blob/main/README.md), [assets](https://github.com/NousResearch/hermes-agent/tree/main/assets), [LICENSE](https://github.com/NousResearch/hermes-agent/blob/main/LICENSE), [contribution guide](https://github.com/NousResearch/hermes-agent/blob/main/CONTRIBUTING.md).

## Recorded comparison design

本次 repository 展示继承 `DESIGN.md` 的 Destroy-style 视觉。Demo 使用自托管 Pixelify、深灰 canvas 和 panel、白色 text、灰色 bevel button，以及 lavender keyboard focus。README banner 使用项目自有 pixel lettering。Aurora screenshot 保留源网页颜色。

Demo 是可滚动的介绍页面。Desktop 使用两栏介绍，窄屏改为单栏。较大的标题、(44px) button 和 screenshot comparison 是该页面的展示选择，不新增全局 design token。Original / Pixel switch 仅切换 recorded screenshot。页面在介绍、caption 和说明中标明此边界，并将实际 conversion 引导到 local setup。

本次未改变全局视觉系统，未更新 `DESIGN.md` 或 design sidecar。已有 converter 与 design 文档的 layout 漂移不在本次范围内：文档仍描述中央 URL panel 和转换后的 toolbar，当前 `public/style.css` 已将 URL controls 放入 header；文档的窄屏 brand 为 (24px)，当前实现为 (18px)。
