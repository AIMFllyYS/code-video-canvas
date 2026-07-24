# issue-04 — 分镜静态帧缩略图共享基础设施

> **Frozen Demo v1 issue.** 保留诊断与完成证据；v3 施工只按
> [`refactor-v3/`](./refactor-v3/) 与 v3 Task Breakdown。

| 字段 | 值 |
|---|---|
| 优先级 | P1 |
| Wave | 2（`docs/specs/2026-07-23-harness-task-breakdown.md` Track H），是 issue-05/issue-06 的前置基础设施 |
| 依赖 | 无 |
| 关联决策 | `docs/specs/2026-07-23-ai-development-harness.md` §5.4 `thumbnail.ts` 条目、§3.1 移植映射表第 64 行（`features/render/qa-check.ts` 的姊妹能力） |
| 状态 | **已完成**（2026-07-24，代码提交 `48cd5c5`） |

## 背景

分镜渲染器页面（`src/app/(app)/canvas/shot/[id]/shot-detail.tsx`）的 8 格缩略图轨道和合成导出页（`src/app/(app)/canvas/export/export-workspace.tsx`）的 Final QA 三点复查（25%/60%/95%）本质上是同一能力——"从已渲染分镜的 HTML 按时间点抽取静态帧图片"，但目前两处都是纯 UI 占位，没有任何真实实现。如果分别实现会违反 AGENTS.md 的 SSOT 原则，因此新增 `src/features/render/thumbnail.ts` 作为共享基础设施，本 issue 只负责这一层，不涉及任何页面 UI 接线（UI 接线分别是 issue-05、issue-06 的范围）。

## 1. 现状调研结论

**CDP 截帧能力**（`src/features/render/frame-capture.ts`）：`openFrameCapture(htmlPath)` 启动 Chromium、创建固定 viewport 的 context/page，加载本地 HTML，等待字体、验证 `window.__CVC_RENDER__@v1`，再建立 CDP session；`FrameCaptureSession.capture(frame, fps)` 串行调用 `runtime.seek(frame, fps)`，以 `Page.captureScreenshot({format:'png'})` 返回 PNG `Buffer`；必须显式 `close()`。同一 page 内多帧截取必须**串行**，禁止并发 seek。

**完整渲染顺序**（`src/features/render/renderer.ts`）：读 HTML → 确定性守卫（`assertDeterministic`）→ render-key/cache 命中判断 → 全帧 PNG sequence → ffmpeg 编码 MP4 → StorageAdapter 落盘 → `render-mp4` artifact 索引 → `finally` 清理临时资源。**缩略图能力不能插入这条主链路**，否则会绑定全帧序列生命周期、拖慢 MP4 主作业、且在 cache 命中时被跳过。

**渲染规格来源**：`renderSpec`（`fps`/`durationInFrames`/`width`/`height`/`seed`）持久化在 `canvas_nodes.data.renderSpec`，由 FABRICATE 阶段可信派生（`src/features/director/stage-result.ts:48-66`）。缩略图按百分比换算帧号时，直接读这份已校验的 `renderSpec`，不重新猜测总帧数。

**存储与索引**：`artifacts.kind` 是无 enum 约束的 SQLite `text` 列，新增 `frame-thumbnail` kind 不需要数据库迁移，只需要在 artifact content-type 映射（`src/features/artifacts/service.ts` 的 `artifactContentType()`）里补一行 `frame-thumbnail → image/png`，否则 `/api/artifacts/[id]` 下载时会给出错误的 `application/octet-stream`。`StorageAdapter.put()` 接口本身不区分格式，直接接受 `Buffer`，PNG 可以像 MP4 一样存取。

## 2. 模块设计

新增 `src/features/render/thumbnail.ts`，单一职责：**给定可信的 shot 渲染上下文 + 目标百分比数组，产出并登记对应静态帧 PNG，返回 artifact 指针；不做视频编码，不做页面接线**。

```ts
export const FRAME_THUMBNAIL_KIND = 'frame-thumbnail' as const

export interface ThumbnailTarget {
  /** [0, 1] 区间的时间点百分比，如 0.25 */
  fraction: number
}

export interface ThumbnailContext {
  projectId: string
  nodeId: string
  htmlKey: string
  frames: FrameSpec // 复用 renderer.ts 已有的 { fps, durationInFrames, width, height }
}

export interface ThumbnailResult {
  fraction: number
  frame: number
  artifactId: string
  contentHash: string
}

export async function captureThumbnails(
  context: ThumbnailContext,
  targets: readonly ThumbnailTarget[],
  dependencies?: ThumbnailDependencies
): Promise<ThumbnailResult[]>
```

实现要点：

1. **百分比 → 帧号换算**：`frame = Math.round(fraction * (durationInFrames - 1))`，保证 `0% → 0`、`100% → 最后一张有效帧`，25%/60%/95% 不会越界。
2. **缓存寻址**：`sourceKey = sha256('cvc-thumbnail-v1\0' + html + JSON.stringify(frames))`，输出路径 `thumbnails/{projectId}/{nodeId}/{sourceKey}/frame-{8位帧号}.png`；对每个目标帧先查是否已有对应 `frame-thumbnail` artifact 且 `storage.exists()`，只对未命中的帧真正截图（避免同一 HTML 被两个消费页面各自重复截同一帧）。
3. **同一 page 内批量截取**：多个未命中帧只 `openFrameCapture()` 一次，在同一 page 内按帧号顺序串行 `capture()`，用完统一 `close()`——不为每张缩略图各开一个浏览器实例。
4. **产物落盘顺序**：PNG Buffer 先 `storage.put()`，`contentHash` 为 PNG 实体 SHA-256，再登记 `frame-thumbnail` artifact；索引失败必须删除已写入的 PNG，与 `renderer.ts` 现有的补偿语义保持一致。
5. **持久化端口**：不让 `thumbnail.ts` 直接操作 Drizzle，在 `RenderRepository` 新增三个方法：`loadCompletedThumbnailContext(projectId, nodeId)`（确认节点是成功的 `shot-codegen`、读取对应 FABRICATE HTML key 与 `renderSpec`）、`findThumbnail(projectId, nodeId, sourceKey, frame)`、`registerThumbnail(...)`。

## 3. 调用时机（架构选择）

**结论：按需生成 + 持久缓存，不在 `renderer.ts` 主渲染流程里自动触发。**

理由：
- 主渲染在 cache 命中时会直接短路返回；自动截缩略图会破坏这条低延迟路径。
- 每镜固定预生成 8 张（渲染器页）+ 3 张（导出页 QA）会增加 Playwright 启动/seek/PNG I/O 开销，且用户未必会访问这两个页面。
- 缓存寻址（sourceKey）让首次消费触发生成、后续任一页面复用同一批 artifact，不重复截同一帧。

消费方分别是 issue-05（8 个等距 fraction）与 issue-06（`[0.25, 0.6, 0.95]`），后者大概率直接命中前者已生成的缓存帧或只需补齐差集。

**不在本 issue 范围**：如果未来需要"终片 MP4 的三个全局时间点"（而非单镜 HTML 的时间点），那是基于 ffmpeg 解码 final MP4 的独立能力，不应该被伪装成本模块的功能，需要另立 issue。

## 4. 测试计划

参照现有 `frame-capture.test.ts`（真实 Playwright + HTML fixture）与 `frame-sequence.test.ts`（注入 `openCapture` mock，不启动浏览器）两种模式：

- `thumbnail.test.ts` 以依赖注入为主，不启动真实 Playwright：fraction→frame 换算与边界值；缓存命中时不打开 capture session；多帧未命中时只开一次 session、按序 capture、关闭一次；PNG 写入 + SHA-256 + artifact 登记；索引失败时删除已写文件；HTML/帧规格变化时生成不同 sourceKey（不误命中旧图）。
- 保留一个小型真实集成测试：用既有 deterministic HTML fixture + `LocalFsStorage` 调用 `captureThumbnails()`，断言返回 PNG 签名且重复调用命中同一 artifact。

## 5. 允许改动范围 / 禁止改动 / 完成条件

**目标**：新增 `src/features/render/thumbnail.ts` 共享缩略图基础设施，支撑分镜渲染器页面缩略图轨道与合成导出页 Final QA 复用同一套确定性截帧+缓存能力。

**前置任务**：无。

**允许改动范围**：
- `src/features/render/thumbnail.ts`（新增）及对应测试
- `src/features/render/repository.ts`（仅新增缩略图上下文读取/缓存登记三个方法，不改现有渲染/导出查询逻辑）
- `src/features/artifacts/service.ts`（仅新增 `frame-thumbnail → image/png` 的 content-type 映射）
- 必要的 `FrameSpec`/`RenderContext` 相关类型导出（如现有类型不够用）

**禁止改动**：
- 不修改 `render-shot` 状态机、全帧 sequence、ffmpeg MP4 编码参数
- 不在 `renderer.ts` 主渲染路径里自动预生成缩略图
- 不直接让客户端读取 `StorageAdapter` 裸路径或本机绝对路径
- 不实现终片 MP4 全局抽帧
- 不做 issue-05/issue-06 的 UI/API 接线（本 issue 只交付 `features/render/thumbnail.ts` 本身）

**完成条件**：
- [x] 指定 `fraction` 能稳定映射到有效帧号，并通过 `__CVC_RENDER__.seek(frame, fps)` 抽取 PNG
- [x] 同一 `sourceKey` + 帧号复用既有 artifact；HTML/规格变化不会误命中旧图
- [x] `frame-thumbnail` PNG 可经 artifact id 下载，响应 `Content-Type: image/png`
- [x] 同一次多帧请求只复用一个 capture session；异常时正确关闭 session；登记失败时补偿删除已写文件
- [x] 单元 mock 测试与至少一条真实 Playwright 集成测试通过
- [x] `pnpm lint && pnpm tsc --noEmit && pnpm build` 通过

## 完成证据（2026-07-24）

- 提交 `48cd5c5`：新增 `src/features/render/thumbnail.ts`（`captureThumbnails`/`thumbnailSourceKey`/`fractionToFrame`），公共类型下沉到 `types.ts` 避免 `thumbnail.ts` ↔ `repository.ts` 循环依赖。
- `RenderRepository` 新增 `loadCompletedThumbnailContext`/`findThumbnail`/`registerThumbnail` 三个方法；`artifacts/service.ts` 补充 `frame-thumbnail → image/png` 映射。
- 测试：13 个依赖注入 mock 单测（缓存命中/未命中、单 session 批量截取、失败补偿等）+ 3 个真实 Playwright 集成测试，全部通过。
- `pnpm lint`、`pnpm tsc --noEmit`、`pnpm test`（60 files / 208 tests）、`pnpm build` 均在合入后的干净 `main` 上验证通过。
- 本 issue 只交付基础设施本身，`frame-thumbnail` 尚无消费方（待 issue-05/issue-06 接线），这是预期状态。

## 6. 施工前需确认的假设

- 假设 `renderSpec`（`fps`/`durationInFrames`/`width`/`height`）在缩略图生成时总是可用（即目标 shot 已至少成功跑完一次 FABRICATE）；若节点尚无 `renderSpec`，`captureThumbnails()` 应该抛出清晰错误（"该分镜尚未生成渲染规格"），不静默跳过。
- 假设消费方（issue-05/issue-06）会在拿到 `ThumbnailResult[]` 后自行决定如何展示（img 标签/下载链接），本模块不关心 UI 呈现形式。
