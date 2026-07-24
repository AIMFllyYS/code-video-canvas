---
kind: error_handling
name: 错误处理体系：Next.js 全局错误页 + API 统一响应 + 领域错误类型与重试门控
category: error_handling
scope:
    - '**'
source_files:
    - src/app/error.tsx
    - src/app/global-error.tsx
    - src/app/api/director/pipeline/route.ts
    - src/app/api/director/stage/route.ts
    - src/app/api/render/route.ts
    - src/features/director/stage-runner.ts
    - src/features/director/tools/write-artifact.ts
    - src/features/render/renderer.ts
---

## 1. 系统/框架层面的错误处理
- **Next.js App Router 全局错误页**：`src/app/error.tsx` 处理客户端路由级错误，显示「出错了」及 `error.message`；`src/app/global-error.tsx` 捕获整个应用崩溃，显示「系统错误」。两者均提供「重试」按钮调用 `reset()`。
- **API 路由统一响应格式**：所有 `src/app/api/*` 路由返回 `{ ok: boolean, error?: string }` 结构，失败时附带 HTTP 状态码（400 参数校验、404 资源不存在、409 冲突/入队失败等），成功时 `{ ok: true, ...payload }`。
- **请求体校验**：全部使用 Zod schema 配合 `safeParse`，解析失败直接返回 400 并携带 `issues[0]?.message`。

## 2. 核心错误类型与传播
- **`ArtifactValidationError`**（`src/features/director/tools/write-artifact.ts`）：自定义 `Error` 子类，携带 `errors: string[]`，用于产物校验失败场景。stage runner 针对 SHOT_SPEC / FABRICATE 阶段最多自动重试 `MAX_GATE_RETRIES=2` 次，超过后抛出带累积消息的同类错误。
- **`AggregateError`**：在 stage runner 清理阶段（状态更新、错误记录、流日志持久化）任一子操作失败时，将主错误与清理错误聚合抛出，保证失败可见性。
- **渲染确定性违规**：`HyperframesRenderer.assertDeterministic` 对 HTML 源执行规则检查，违规直接 `throw new Error('确定性违规：...')`。

## 3. 架构与约定
- **Stage Runner 错误边界**（`src/features/director/stage-runner.ts`）：
  - 正常路径：`running → success → advancePipeline`。
  - 异常路径：`failed → recordStageError → persistStreamLog → streamBus.markError → throw`。
  - 下游 `advancePipeline` 失败仅 `console.error` 不掩盖主错误（`advanceWithoutMasking`）。
  - Session 关闭失败被吞掉（`closeWithoutMasking`），避免覆盖根因。
- **队列层错误隔离**：`enqueueDirectorStage` / `enqueueRenderShot` 的 catch 块统一包装为 `{ ok: false, error }` 并返回 409，防止未捕获异常泄漏到 Next.js 运行时。
- **存储写入原子性**：`writeValidatedArtifact` 先写 storage，再插入 DB；DB 写入失败则回滚删除 storage key，保证一致性。

## 4. 约定与约束（基于代码实现观察）
- API 路由必须使用 Zod `strict()` schema 校验请求体，失败返回 400。
- 所有异步操作包裹 try/catch，错误统一转为 `{ ok: false, error: messageOf(error) }` 响应。
- Director 阶段的产物写入必须通过 `writeValidatedArtifact`，禁止绕过校验。
- 节点状态机只允许 `running → success | failed`，失败路径必须调用 `recordStageError` 和 `streamBus.markError`。
- 渲染流程必须在 `finally` 中清理临时目录与帧序列，确保资源释放。
- 前端错误页面固定展示中文标题（「出错了」「系统错误」）与重试按钮，不暴露堆栈信息。

## 5. 关键文件
- `src/app/error.tsx` / `src/app/global-error.tsx` — Next.js 全局错误页
- `src/app/api/director/pipeline/route.ts` / `src/app/api/director/stage/route.ts` / `src/app/api/render/route.ts` — API 路由错误封装
- `src/features/director/stage-runner.ts` — 阶段执行器与错误边界
- `src/features/director/tools/write-artifact.ts` — 产物校验与 `ArtifactValidationError`
- `src/features/render/renderer.ts` — 渲染器与确定性检查
- `src/lib/stream/stream-bus.ts` — 流式日志与错误标记（引用）
