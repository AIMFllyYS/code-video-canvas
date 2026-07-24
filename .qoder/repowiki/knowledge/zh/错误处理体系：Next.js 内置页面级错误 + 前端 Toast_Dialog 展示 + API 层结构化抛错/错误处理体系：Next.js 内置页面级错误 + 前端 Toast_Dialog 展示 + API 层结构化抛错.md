---
kind: error_handling
name: 错误处理体系：Next.js 内置页面级错误 + 前端 Toast/Dialog 展示 + API 层结构化抛错
category: error_handling
scope:
    - '**'
source_files:
    - src/app/error.tsx
    - src/app/global-error.tsx
    - src/app/not-found.tsx
    - src/components/ui/toast.tsx
    - src/app/(app)/canvas/stage-error-dialog.tsx
    - src/app/(app)/canvas/streaming-log-card.tsx
    - src/app/(app)/canvas/export/export-api.ts
    - src/app/(app)/canvas/canvas-action-api.ts
    - src/features/canvas/actions.ts
---

该仓库采用 Next.js App Router 的内置错误页面机制与前端轻量 UI 组件组合实现错误处理，未引入第三方错误管理库或自定义 Error 类型体系。整体呈现“服务端抛出结构化错误 → 客户端捕获并展示”的分层模式。

1. 系统/框架层面
- 使用 Next.js 的 `error.tsx`、`global-error.tsx`、`not-found.tsx` 作为页面级错误兜底，统一渲染“出错了/系统错误/404”等中文提示，并提供“重试”按钮调用 `reset()` 恢复状态。
- 前端通过自研 `Toast` 组件（`src/components/ui/toast.tsx`）提供全局通知能力，支持 info/success/warning/error 四种变体，并通过模块级单例 `toast.show/dismiss/subscribe` 暴露最小可用 API。
- 阶段级失败通过 `StageErrorDialog` 弹窗持久化展示服务端记录的 `directorError.message`，并在节点状态变为 `failed` 时自动弹出一次。

2. API 层错误约定
- 所有 fetch 调用遵循同一模式：检查 `response.ok`，若失败则从响应体中提取 `body.error` 字符串作为错误消息，否则回退到预设 fallback；随后用 `throw new Error(...)` 向上抛出。
- 对响应体结构进行轻量校验（如 `objectBody`、`isResolutionPreset`），不符合预期的字段直接抛错，避免下游误用。
- 服务端 actions（如 `src/features/canvas/actions.ts`）在参数非法时由 zod schema.parse 抛错，业务异常（如项目不存在）则 `throw new Error(...)`。

3. 架构与约定
- 错误信息以纯字符串形式在 API 边界传递，客户端不定义自定义 Error 子类，仅依赖 `Error` 实例的 `message` 字段。
- 流式执行（SSE）的错误来源有两个：服务端持久化的 `DirectorNodeError`（刷新不丢）和实时流中的 `stream.error`，两者取并集后由 `StreamingLogCard` 统一展示。
- 未使用 `try/catch` 包裹所有调用点，而是让错误向上传播至 Next.js 路由或 React 组件边界，由顶层 `error.tsx`/`global-error.tsx` 兜底。

4. 约束与规范
- API 响应必须包含可解析的 JSON body，且非成功响应需携带 `error` 字符串字段，否则客户端会回退到固定文案。
- 前端不得吞掉错误：所有 `fetch` 失败路径均显式 `throw new Error(...)`，保证错误冒泡至页面级错误处理器。
- 用户可见的错误文案统一使用中文（“出错了”“系统错误”“页面不存在”“阶段失败”等），无英文错误码或技术堆栈泄露。
- 未观察到 `panic/recover`、全局 `unhandledrejection` 监听或集中式错误上报逻辑，错误传播依赖语言默认行为。