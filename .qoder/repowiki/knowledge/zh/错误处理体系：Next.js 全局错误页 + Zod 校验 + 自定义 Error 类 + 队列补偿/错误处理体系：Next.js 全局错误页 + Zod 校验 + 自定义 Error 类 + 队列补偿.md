---
kind: error_handling
name: 错误处理体系：Next.js 全局错误页 + Zod 校验 + 自定义 Error 类 + 队列补偿
category: error_handling
scope:
    - '**'
source_files:
    - src/app/error.tsx
    - src/app/global-error.tsx
    - src/app/not-found.tsx
    - src/app/(app)/canvas/stage-error-dialog.tsx
    - src/app/(app)/canvas/streaming-log-card.tsx
    - src/app/(app)/canvas/export/export-api.ts
    - src/app/(app)/canvas/shot/[id]/shot-api.ts
    - src/app/(app)/canvas/canvas-action-api.ts
    - src/features/audio/stepfun-audio-client.ts
    - src/features/director/tools/write-artifact.ts
    - src/features/director/queue-handler.ts
    - src/features/render/queue-handler.ts
---

本仓库的错误处理围绕 Next.js App Router 的全局错误页面、Zod 数据校验、少量自定义 Error 子类以及队列/渲染流程的补偿机制构建，未建立统一的错误类型枚举或中间件层。

1. 系统/框架层面
- Next.js 全局错误页：`src/app/error.tsx` 捕获路由级异常，显示“出错了”与重试按钮；`src/app/global-error.tsx` 捕获根级异常，显示“系统错误”；`src/app/not-found.tsx` 统一 404 页面。三者均为客户端组件，通过 `reset()` 触发重试。
- 无服务端全局错误中间件，API 路由直接抛出 `Error`，由 Next.js 默认转为 HTTP 错误响应。

2. 数据校验与输入错误
- 广泛使用 Zod（`z.object(...).strict()`）对请求体、外部 API 响应进行强类型校验，校验失败时抛出 `z.ZodError`（在测试中可见），或由业务函数自行 `throw new Error(...)` 描述具体语义。
- 音频模块 `stepfun-audio-client.ts` 对 SSE 事件流定义独立 schema（`asrErrorSchema`），遇到 `type: 'error'` 的事件直接抛错并携带消息。

3. 自定义错误类型
- `ArtifactValidationError`（`src/features/director/tools/write-artifact.ts`）继承 `Error`，用于产物写入时的结构化校验失败，包含 `errors: string[]` 字段，被 stage-runner 识别并转换为可持久化的阶段错误。
- 测试中可见 `APIError`、`MockAPIError` 等仅用于模拟，非生产代码。

4. 网络与 API 调用错误
- 前端 fetch 调用统一模式：检查 `response.ok`，失败时用本地 `errorOf(body, fallback)` 提取 `body.error` 字符串作为错误消息，再 `throw new Error(...)` 上抛。
- 典型文件：`canvas-action-api.ts`、`export/export-api.ts`、`shot/[id]/shot-api.ts`、`stepfun-audio-client.ts`。

5. 异步任务与队列补偿
- 导演流水线与渲染队列在入队失败时执行补偿（回滚节点状态、记录错误），若补偿本身失败则用 `AggregateError` 聚合原始错误与补偿错误，确保失败信息不丢失。
- 关键位置：`features/director/queue-handler.ts`、`features/render/queue-handler.ts`。

6. UI 层错误呈现
- `StageErrorDialog` 展示来自数据库 `directorError` 的持久化失败原因，支持手动重试。
- `StreamingLogCard` 在阶段失败时自动弹出错误弹窗，并通过 `resolveVisibleStageError` 优先取持久化错误，其次取流式错误。

7. 约定与约束
- 所有外部 HTTP 调用必须检查 `response.ok` 并抛出可读错误，禁止吞掉异常。
- 产物写入必须通过 `writeValidatedArtifact` 并使用 `ArtifactValidationError` 表达校验失败。
- 队列操作失败必须进入补偿逻辑，最终可能以 `AggregateError` 形式暴露。
- 前端错误展示依赖 Next.js 内置 `error.tsx` / `global-error.tsx`，无需自定义全局 catch 包装。

8. 关键文件
- `src/app/error.tsx`、`src/app/global-error.tsx`、`src/app/not-found.tsx`
- `src/app/(app)/canvas/stage-error-dialog.tsx`、`src/app/(app)/canvas/streaming-log-card.tsx`
- `src/app/(app)/canvas/export/export-api.ts`、`src/app/(app)/canvas/shot/[id]/shot-api.ts`、`src/app/(app)/canvas/canvas-action-api.ts`
- `src/features/audio/stepfun-audio-client.ts`
- `src/features/director/tools/write-artifact.ts`、`src/features/director/queue-handler.ts`、`src/features/render/queue-handler.ts`