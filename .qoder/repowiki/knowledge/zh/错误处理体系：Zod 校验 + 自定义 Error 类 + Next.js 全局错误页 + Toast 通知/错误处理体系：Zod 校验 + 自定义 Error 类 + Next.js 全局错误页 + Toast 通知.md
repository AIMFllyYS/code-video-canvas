---
kind: error_handling
name: 错误处理体系：Zod 校验 + 自定义 Error 类 + Next.js 全局错误页 + Toast 通知
category: error_handling
scope:
    - '**'
source_files:
    - src/app/error.tsx
    - src/app/global-error.tsx
    - src/app/not-found.tsx
    - src/app/api/director/stage/route.ts
    - src/features/director/tools/write-artifact.ts
    - src/features/director/queue-handler.ts
    - src/features/render/queue-handler.ts
    - src/components/ui/toast.tsx
---

## 1. 系统/方法概述
该仓库采用分层错误处理策略：
- **请求层**：使用 Zod schema 对 API 入参进行强类型校验，失败时返回结构化 JSON 错误响应。
- **业务层**：通过自定义 `Error` 子类（如 `ArtifactValidationError`）和 `AggregateError` 表达可区分、可聚合的错误。
- **渲染/队列层**：在异步任务中统一捕获异常，记录状态并补偿失败，必要时抛出 `AggregateError` 汇总清理错误。
- **前端 UI 层**：Next.js 内置 `error.tsx` / `global-error.tsx` 作为页面级与全局级错误兜底；业务错误通过 `Toast` 组件以 `variant="error"` 形式反馈给用户。

## 2. 关键文件与包
- **Next.js 错误页**：`src/app/error.tsx`、`src/app/global-error.tsx`、`src/app/not-found.tsx`
- **API 路由校验与响应**：`src/app/api/director/stage/route.ts`、`src/app/api/render/route.ts`、`src/app/api/render/export/route.ts`、`src/app/api/settings/route.ts`
- **自定义错误类型**：`src/features/director/tools/write-artifact.ts`（`ArtifactValidationError`）
- **队列与渲染错误聚合**：`src/features/director/queue-handler.ts`、`src/features/render/queue-handler.ts`
- **UI 错误提示**：`src/components/ui/toast.tsx` 及在各页面中的使用（canvas-inspector、export-workspace、shot-detail、settings-form、new-project-dialog）

## 3. 架构与约定
- **输入校验优先**：所有 API route 均以 `z.object(...).strict()` 定义 schema，并通过 `.safeParse()` 解析请求体。校验失败直接返回 `{ ok: false, error: message }` 的 400 响应，不进入业务逻辑。
- **领域错误显式化**：业务规则违反抛出自定义 `Error` 子类（如 `ArtifactValidationError`），包含结构化 `errors` 字段，便于上层区分与展示。
- **异步任务补偿**：队列处理器在 `try/catch` 中执行核心逻辑，失败时调用 `failRender` / `compensateEnqueueFailure` 等函数尝试回滚状态（transitionNodeStatus、recordError），若补偿过程也失败则用 `AggregateError` 汇总所有错误抛出，保证错误可见性。
- **前端错误呈现**：页面级错误由 Next.js 错误页接管；用户操作失败通过 `Toast variant="error"` 显示简短消息，避免阻塞流程。
- **404 处理**：`not-found.tsx` 提供统一的“页面不存在”页面，引导用户返回首页。

## 4. 开发者应遵循的规则
- **API 入参必须用 Zod 校验**：使用 `requestSchema.safeParse(body)` 并在失败时返回 400 结构化错误，禁止直接使用未校验的请求数据。
- **业务错误抛出自定义 Error 子类**：新增领域错误时应继承 `Error` 并设置 `name` 字段，携带足够上下文信息（如 `errors: string[]`），方便调用方区分处理。
- **异步任务必须做补偿**：在 `catch` 块中确保状态回滚与错误记录，若补偿失败需聚合为 `AggregateError` 抛出，不得静默吞掉错误。
- **前端错误通过 Toast 反馈**：用户可恢复的错误（如网络失败、参数无效）使用 `Toast variant="error"` 提示，不要 `alert` 或崩溃页面。
- **利用 Next.js 错误页兜底**：不可恢复的运行时错误交由 `error.tsx` / `global-error.tsx` 展示，保持用户体验一致。
- **避免裸 `throw new Error('...')`**：尽量使用语义化的错误类型或结构化错误对象，便于测试断言与日志分析。