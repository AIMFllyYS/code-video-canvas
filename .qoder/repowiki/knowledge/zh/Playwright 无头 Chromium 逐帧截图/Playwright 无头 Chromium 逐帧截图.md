---
kind: external_dependency
name: Playwright 无头 Chromium 逐帧截图
slug: playwright-chromium
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

### Playwright 截图合同
- 渲染流程：打开 shot HTML → 等待 `document.fonts.ready` → 断言页面暴露 `window.__CVC_RENDER__@v1` 且含 `seek` 函数 → 通过 CDP `Page.captureScreenshot` 按 frame/fps seek 后截图 PNG → 落盘序列 → ffmpeg 编码 MP4。
- 每个 shot 复用一个 BrowserContext/Page，多 worker 并发取帧；失败时清理临时目录。