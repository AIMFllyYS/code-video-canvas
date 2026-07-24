# Issues 11–13 + Gemini 真实端测报告

> 日期：2026-07-24
> 分支：`feature/issues-11-13-gemini`
> 测试项目：`Gemini 多模型真实端测 2026-07-24`

## 结论

Issue 11、12、13 均按任务卡完整范围实现并通过真实外部模型、Next.js
服务、桌面浏览器与 390×844 窄屏端测。测试项目最终为 `19/19` 节点
`success`，三条分镜均生成 render、StepFun 配音、StepFun ASR 字幕与
Gemini Vision QA 产物，并生成可信 `final-mp4`。

Gemini 是新增 provider，不替换 StepFun。Director/视觉节点可在设置页逐节点
选择 Gemini 或 StepFun；TTS/ASR 固定使用 StepFun。

## Provider 与配置证据

- `gemini-3.6-flash` 官方 API 最小调用成功，实测约 1.76 秒返回。
- `gemini-3.1-flash-lite` 官方 API 最小调用成功，实测约 0.63 秒返回。
- Gemini Director tool-calling 使用 Pi 已有原生
  `google-generative-ai` API，保留 Gemini 3 thought signature；Key 校验和
  Vision 保持官方 OpenAI-compatible 请求。
- 设置页真实显示两个 provider 的配置来源与 9 类节点路由；切换
  Gemini → StepFun → Gemini 后刷新仍持久化。
- 设置 GET/POST 响应不返回 Key；本地 `.env.local` 由 `.gitignore` 忽略，
  tracked diff 中本地 Key 字面量命中数为 0。

## 应用链路

真实页面创建项目后点击一次“一键启动”，链路完成：

1. INGEST：真实 Gemini 生成 3 个 script unit 并事务性 fan-out。
2. DIRECT / SHOT_SPEC：生成全局导演结果与三份 shot contract。
3. FABRICATE / render：三份裸 HTML 通过确定性门禁并由 Chromium + ffmpeg
   生成 3 个 `render-mp4`。
4. ASSEMBLE：三份 StepFun TTS MP3、三份元数据、三份 StepFun ASR
   `subtitle-track`，以及 score 节点全部完成。
5. FINALIZE：三份规则 + Gemini Vision 双层 QA 完成；可信
   `exportProject()` 先生成 `final-mp4`，随后 export FINALIZE 成功。

当前 artifact 数量（与本轮能力直接相关）：

| kind | 数量 |
|---|---:|
| `render-mp4` | 3 |
| `voiceover-audio` | 3 |
| `voiceover-metadata` | 3 |
| `subtitle-track` | 3 |
| `qa-vision-report` | 3 |
| `frame-thumbnail` | 9 |
| `final-mp4` | 2（自动终片 + 页面手动复验，内容哈希相同） |

测试期间为复现/修复 provider 与协议问题保留了历史 failed job；它们是诊断
历史，不代表当前项目状态。权威节点投影为 19 个节点全部 `success`，最新
终片与页面状态均取服务端真实记录。

## 终片与下载

- 最新 artifact：`163fc372-eb1b-4636-8c5c-a6d1b44fd088`
- SHA-256：
  `286b155454cb2ce969ab18f2064e4fd24ec117a8d799857dbff413d5b710ba37`
- HTTP：`200`，`Content-Type: video/mp4`
- 文件大小：534,477 bytes
- ffprobe：H.264、1080×1920、30 fps、24.000 秒
- 页面刷新后自动恢复终片预览、100% 与真实 `final.mp4` 链接。

本 issue 组没有扩展终片混音范围：StepFun 配音 MP3 和字幕轨道均已真实生成，
但当前 `exportProject()` 尚未把逐镜 voiceover 混入 MP4；本次终片因此只有
视频流。界面和报告均不把它表述成已混音。

## 端侧修正

真实联调期间定位并修复：

- Gemini OpenAI-compatible `store:false` 不兼容；
- Gemini 3 tool follow-up 丢失 thought signature；
- FABRICATE 返回 Markdown 围栏且缺少 `window.__CVC_RENDER__@v1`；
- export FINALIZE 在 `final-mp4` 生成前被提前入队；
- 成功重试后历史 `directorError` 仍显示“阶段失败”；
- 导出页刷新后既有终片显示 0%，且导出中伪造固定 62%。

30 份 Pi 会话里有 4 份留下真实门禁反馈，合计 7 次反馈痕迹；同会话修正后
链路继续完成。桌面画布、桌面导出页、390×844 导出页与移动端设置抽屉均通过
DOM 与像素复验。

## 最终门禁

- `pnpm lint`：退出 0
- `pnpm tsc --noEmit`：退出 0
- `pnpm test`：77 files / 348 tests 全绿
- `pnpm build`：Next.js 16.2.11 production build 退出 0
- `git diff --check`：退出 0
- 45 个变更文件 UTF-8 扫描：U+FFFD 0、常见乱码 0
- tracked diff 本地 Gemini Key 字面量：0
