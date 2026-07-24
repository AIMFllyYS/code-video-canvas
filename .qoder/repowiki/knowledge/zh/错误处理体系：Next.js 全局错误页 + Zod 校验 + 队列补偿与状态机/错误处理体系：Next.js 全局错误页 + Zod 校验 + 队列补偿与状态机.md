---
kind: error_handling
name: 错误处理体系：Next.js 全局错误页 + Zod 校验 + 队列补偿与状态机
category: error_handling
scope:
    - '**'
source_files:
    - src/app/error.tsx
    - src/app/global-error.tsx
    - src/app/not-found.tsx
    - src/app/api/render/route.ts
    - src/app/api/director/stage/route.ts
    - src/app/(app)/canvas/export/export-api.ts
    - src/features/render/queue-handler.ts
    - src/features/director/queue-handler.ts
    - src/features/canvas/status.ts
    - src/lib/queue/init.ts
---

本仓库的错误处理围绕三条主线组织：前端 Next.js 全局错误页面、API 路由的输入校验与统一响应、以及后台队列作业的状态机与补偿机制。三者共同构成从用户可见错误到后台不可恢复异常的完整链路。

1. 前端全局错误页面
- `src/app/error.tsx` 与 `src/app/global-error.tsx` 分别捕获页面级与根级未处理异常，统一展示“出错了/系统错误”+ message + “重试”按钮；`src/app/not-found.tsx` 提供 404 页面。这些是 Next.js App Router 约定的客户端组件，用于兜底渲染层抛出的 Error。

2. API 路由：Zod 校验 + 统一 JSON 响应
- 所有 API 路由（如 `src/app/api/render/route.ts`、`src/app/api/director/stage/route.ts`）使用 `z.object(...).strict()` 对请求体进行强类型校验，失败时返回 `{ ok: false, error: '...' }` 并附带 HTTP 状态码（400/404/409 等）。
- 业务逻辑包裹在 try/catch 中，catch 分支将 `error instanceof Error ? error.message : '默认消息'` 包装为 `{ ok: false, error }` 返回，避免堆栈泄露。
- 外部 fetch 调用通过 `response.ok` 判断失败，并用本地 `errorOf(body, fallback)` 提取 `body.error` 或回退消息，再 `throw new Error(...)` 向上冒泡。

3. 队列作业：状态机 + 补偿 + AggregateError
- 队列处理器位于 `src/features/render/queue-handler.ts` 与 `src/features/director/queue-handler.ts`，通过 `register*Handler` 注册任务，`enqueue*` 函数负责入队前的断言、状态转换与失败补偿。
- 节点状态由 `src/features/canvas/status.ts` 中的 `transitionNodeStatus` 原子维护，定义严格的状态转移表（idle→pending→running→success/failed→stale），非法转换直接抛错。
- 入队失败时执行 `compensateEnqueueFailure`：尝试回滚 running/failed 状态并记录错误，若补偿本身失败则用 `AggregateError` 聚合原始错误与补偿错误，确保问题可追踪。
- 渲染失败路径 `failRender` 同样采用 try-catch 收集清理错误，最终可能抛出 `AggregateError('渲染失败补偿不完整')`。

4. 队列初始化防重入
- `src/lib/queue/init.ts` 通过 `globalThis.__cvcQueueInitialized` 与 `__cvcQueueInitializing` Promise 锚定标志，保证多模块图下只启动一次队列，避免 split-brain 重复消费。

5. 约定与约束
- API 响应统一遵循 `{ ok: boolean, error?: string, ... }` 结构，客户端通过 `response.ok` 与字段存在性双重校验。
- 所有异步操作失败均走 `throw new Error(message)` 向上冒泡，由上层 catch 转换为 HTTP 响应，不在底层直接返回 HTTP 对象。
- 状态变更必须经过 `transitionNodeStatus`，禁止绕过状态机直接写库。
- 队列作业失败后必须进入 failed 状态并记录错误，且自动推进下游失败仅 console.error，不阻断主流程。

6. 关键文件
- 前端错误页：`src/app/error.tsx`、`src/app/global-error.tsx`、`src/app/not-found.tsx`
- API 路由示例：`src/app/api/render/route.ts`、`src/app/api/director/stage/route.ts`、`src/app/(app)/canvas/export/export-api.ts`
- 队列与状态机：`src/features/render/queue-handler.ts`、`src/features/director/queue-handler.ts`、`src/features/canvas/status.ts`、`src/lib/queue/init.ts`