---
kind: error_handling
name: 错误处理体系：Next.js 全局错误页 + Zod 校验 + try/catch 补偿模式
category: error_handling
scope:
    - '**'
source_files:
    - src/app/error.tsx
    - src/app/global-error.tsx
    - src/app/not-found.tsx
    - src/app/api/render/route.ts
    - src/features/director/stage-runner.ts
    - src/features/director/stage-result.ts
    - src/features/render/renderer.ts
    - src/features/render/queue-handler.ts
    - src/features/director/queue-handler.ts
---

该仓库采用分层、就近捕获的错误处理策略，未定义统一的自定义 Error 子类或全局错误码枚举，而是依赖 JavaScript 原生 `Error`、Zod 校验失败以及 Next.js 内置错误页面机制。

**1. 前端全局错误页**
- `src/app/error.tsx`：路由级错误页，展示 `error.message` 并提供「重试」按钮调用 `reset()`。
- `src/app/global-error.tsx`：应用级全局错误页，结构相同但包裹 `<html>`/`<body>`，用于渲染阶段抛出的异常。
- `src/app/not-found.tsx`：404 页面，纯 UI 组件。

**2. API 层错误返回**
- API Route（如 `src/app/api/render/route.ts`）统一使用 `NextResponse.json({ ok, error }, status)` 格式返回错误，状态码按语义区分：400（请求体无效）、404（资源不存在）、409（冲突/入队失败）。
- 通过 `safeParse` 进行参数校验，失败时直接返回 400，不抛出异常。

**3. 业务逻辑中的错误传播**
- 使用 `try/catch` 就近捕获并记录，配合状态机 `transitionNodeStatus(nodeId, 'failed')` 标记节点失败。
- 关键路径（stage-runner、queue-handler、render queue-handler）在 catch 块中执行补偿清理（回滚状态、记录错误），若补偿本身失败则用 `AggregateError` 聚合所有错误后重新抛出。
- `stage-result.ts` 中对模型输出进行 Zod 解析，解析失败直接 `throw new Error(...)`，由上层 runner 捕获。
- `renderer.ts` 的 `assertDeterministic` 对确定性违规抛出结构化错误消息。

**4. 队列与异步任务错误**
- `enqueueDirectorStage` / `enqueueRenderShot` 在入队失败时调用 `compensateEnqueueFailure` 回滚状态并记录错误，再抛出原始错误。
- 队列处理器内部 `failRender` / stage runner 的 catch 块确保无论成功失败都会将节点状态置为 `running` → `success`/`failed`。

**5. 约定与约束**
- 不在业务代码中定义自定义 Error 子类，统一使用 `new Error(message)`。
- API 层禁止 throw，统一返回 `{ ok, error }` JSON。
- 所有可能失败的 I/O 操作都包裹 try/catch，并在 finally 中保证资源清理（临时目录、序列清理）。
- 错误信息以中文为主，面向开发者可读。