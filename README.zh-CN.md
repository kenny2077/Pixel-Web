# Pixel Web

<img src="demo/assets/banner.svg" alt="Pixel Web：把网页转换为像素风格" width="100%">

把公开网站转换为完整、可点击的 pixel-style preview。保留原有 layout、清晰图片和受支持的 controls。转换使用 image algorithms 和 pixel fonts，不调用 AI。

[查看录制 demo](https://kenny2077.github.io/Pixel-Web/) · [English README](README.md) · [贡献指南](CONTRIBUTING.md)

Demo 展示已录制的转换结果，不接收新 URL。完整转换需要在本地启动 Node server。本项目为早期版本，不保证每个网站都能完整交互。

## 本地运行

需要 Node.js 22+、Python 3.10+ 和浏览器。macOS 使用已安装的 Google Chrome；Linux 使用 Playwright Chromium。Windows 尚未验证。

```bash
git clone https://github.com/kenny2077/Pixel-Web.git
cd Pixel-Web
npm ci
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-pdf.txt
# Linux 还需要执行：
npx playwright install --with-deps chromium
npm start
```

打开 http://127.0.0.1:4173，粘贴公开 URL，点击 Convert。默认使用 All pixel text。在 Style 中可以更换文字、pixel size、palette 和 dithering。

## 功能

- 保留整页 DOM、双栏、footer 和下半页内容。
- 把受支持的按钮、菜单、输入和表单操作传回隔离的 source browser。
- 图片与小 icons 使用更细的像素和更多颜色，头像保留原始形状。
- 支持英文和中文 pixel fonts；保留 icon fonts。
- 复杂媒体可显示 static frame；PDF 保留可点击 annotations。
- 重用相同图片的转换结果。页底没有新增内容时，不重建预览。

## 测试与部署

```bash
pip install -r requirements-dev.txt
npm test
npm run check:repo
# 启动本地服务后：
npm run verify
```

GitHub Actions 用于测试。GitHub Pages 用于静态 demo。Cloudflare Container 配置已准备，但尚未部署或验证速度；需要 Workers Paid plan。首次加载仍受原网站网络影响，没有固定的速度保证。

当前一次只执行一个转换或操作，保留最多三个 source sessions，每个十分钟。WebSockets、复杂 iframe、上传下载和账号支付流程尚未完整支持。完整限制见 [English README](README.md#compatibility-and-limits) 和 [SECURITY.md](SECURITY.md)。

代码使用 [MIT license](LICENSE)。字体与录制网站保留各自许可。见 [第三方说明](THIRD_PARTY_NOTICES.md)。
