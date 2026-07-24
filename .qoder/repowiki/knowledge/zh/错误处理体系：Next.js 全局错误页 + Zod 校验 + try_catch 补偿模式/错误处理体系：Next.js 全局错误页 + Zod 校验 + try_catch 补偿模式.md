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
    - src/components/ui/toast.tsx
    - src/app/api/render/export/route.ts
    - src/app/api/director/stage/route.ts
---

本仓库采用分层错误处理策略，覆盖客户端渲染、API 路由与业务逻辑三个层面：

1. **客户端全局错误页**：`src/app/error.tsx` 与 `src/app/global-error.tsx` 分别处理页面级与全局级异常，统一展示「出错了 / 系统错误」+ 错误消息 + 「重试」按钮，通过 Next.js App Router 的 error boundary 机制捕获未处理异常。

2. **404 页面**：`src/app/not-found.tsx` 提供统一的 404 页面，包含返回首页链接。

3. **API 层错误约定**：所有 API 路由（如 `src/app/api/render/export/route.ts`、`src/app/api/director/stage/route.ts`）遵循一致的响应格式：成功返回 `{ ok: true, ... }`，失败返回 `{ ok: false, error: string }`。请求体使用 Zod schema 进行严格校验（`z.object(...).strict()`），校验失败直接返回 400 并附带 `parsed.error.issues[0]?.message`。

4. **try/catch 补偿模式**：业务代码广泛使用 try/catch 包裹外部调用（AI 适配器、ffmpeg、队列等），捕获后提取 `error instanceof Error ? error.message : String(error)` 作为用户可读消息，并通过 toast 通知或 JSON 响应返回。例如 `features/ai/gemini-adapter.ts`、`features/render/queue-handler.ts` 等均遵循此模式。

5. **前端 Toast 通知**：`src/components/ui/toast.tsx` 提供全局 toast 系统，支持 `info | success | warning | error` 四种变体，作为用户反馈的统一出口。

6. **无自定义 Error 类**：代码中未发现继承 `Error` 的自定义错误类型定义，错误主要通过原生 `new Error('message')` 抛出，由上层统一格式化。

7. **无 panic/recover 机制**：TypeScript/Node.js 环境下未使用类似 panic/recover 的模式，错误均通过 throw/catch 传播。

8. **中间件缺失**：未发现 Express/Koa 风格的错误处理中间件，错误处理内联在各路由文件中。