---
kind: error_handling
name: 错误处理体系：Next.js 边界 + 领域错误类型 + 队列补偿模式
category: error_handling
scope:
    - '**'
source_files:
    - src/app/error.tsx
    - src/app/global-error.tsx
    - src/app/not-found.tsx
    - src/features/director/tools/write-artifact.ts
    - src/features/director/stage-runner.ts
    - src/features/director/queue-handler.ts
    - src/features/render/queue-handler.ts
---

## 1. 系统/方法概述

本仓库采用分层错误处理策略：
- **Next.js App Router 边界**：`src/app/error.tsx`、`src/app/global-error.tsx`、`src/app/not-found.tsx` 提供页面级与全局级错误兜底 UI，统一展示 `error.message` 并提供“重试”按钮。
- **领域自定义错误类**：在业务层定义具名错误（如 `ArtifactValidationError`），通过 `throw new XxxError(...)` 向上抛出，便于调用方按类型区分处理。
- **AggregateError 聚合清理失败**：在队列处理器与阶段运行器中，当主流程异常后的状态回滚/记录等“补偿操作”再次失败时，使用原生 `AggregateError` 将原始错误与所有清理错误合并抛出，避免掩盖根因。
- **Zod 校验错误**：API 与工具入口普遍以 `z.object(...).strict().safeParse()` 做输入校验，失败后直接抛出自定义错误或结构化错误数组，不依赖 try/catch 包裹。

未发现统一的中间件式错误包装（如 Express-style middleware）或全局 panic/recover 机制；错误传播主要依靠 Promise rejection 与显式 throw。

## 2. 关键文件与包

- `src/app/error.tsx` — 路由级错误页组件
- `src/app/global-error.tsx` — 应用级全局错误页组件
- `src/app/not-found.tsx` — 404 页面
- `src/features/director/tools/write-artifact.ts` — 定义 `ArtifactValidationError`，产物写入前用 Zod 校验并抛错
- `src/features/director/stage-runner.ts` — Director 阶段执行器，捕获异常后尝试清理并可能抛出 `AggregateError`
- `src/features/director/queue-handler.ts` — Director 作业入队失败时的补偿逻辑，同样使用 `AggregateError`
- `src/features/render/queue-handler.ts` — 渲染作业入队/失败补偿，复用相同模式

## 3. 架构与约定

- **UI 层**：所有可恢复的客户端错误由 Next.js 内置 Error Boundary 接管，组件内不再自行捕获显示；不可恢复的全局崩溃由 `global-error.tsx` 兜底。
- **服务端/特征层**：
  - 输入校验一律走 Zod schema，失败路径直接返回 `{ ok: false, errors }` 或抛出 `ArtifactValidationError`，不在上层再套 try/catch。
  - 涉及多步副作用（写存储、写库、改状态）的操作，在 catch 分支中对每个清理步骤单独 try/catch，收集 `cleanupErrors`，若存在则 `throw new AggregateError([error, ...cleanupErrors], message)`，确保清理失败不会覆盖原始错误。
  - 队列处理器（Director / Render）对“入队失败补偿”和“执行失败补偿”采用同一模板函数，保证一致性。
- **无全局错误中间件**：API Route 未看到统一的错误响应封装，错误主要通过 Promise rejection 向上传播至 Next.js 运行时。

## 4. 开发者应遵循的规则

1. **不要吞掉错误**：catch 块中必须至少记录或重新抛出，禁止空 catch。
2. **优先使用 Zod 校验**：对外部输入（API payload、工具参数）使用 `z.object(...).strict().safeParse`，失败后直接抛出自定义错误或返回结构化错误对象。
3. **使用具名错误类**：需要被调用方区分的错误请定义 `class XxxError extends Error`，并在构造函数中设置 `this.name`。
4. **补偿操作要隔离**：在清理/回滚逻辑中对每个子步骤独立 try/catch，并用 `AggregateError` 汇总，不要掩盖主错误。
5. **UI 层交给 Error Boundary**：不要在组件内部手动捕获并显示错误信息，交由 `error.tsx` / `global-error.tsx` 统一呈现。
6. **保持消息可读性**：错误 message 使用中文描述，包含上下文（如 stage 名称、nodeId），便于排障。
