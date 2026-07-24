---
kind: error_handling
name: 错误处理体系：Next.js 全局错误页 + Zod 校验 + 结构化业务错误类型
category: error_handling
scope:
    - '**'
source_files:
    - src/app/error.tsx
    - src/app/global-error.tsx
    - src/app/api/director/pipeline/route.ts
    - src/app/api/render/route.ts
    - src/app/api/projects/route.ts
    - src/app/api/director/stage/route.ts
    - src/app/api/director/stream/[nodeId]/route.ts
    - src/lib/stream/stream-bus.ts
    - src/features/director/pi-output.ts
    - src/features/director/tools/write-artifact.ts
---

## 1. 系统/方法概述
本仓库采用分层错误处理策略：
- 前端（Next.js App Router）通过 `error.tsx` 与 `global-error.tsx` 提供统一的客户端错误页面，展示 `error.message` 并提供重试按钮。
- API 路由层统一使用 Zod 进行请求体验证，失败时返回 `{ ok: false, error }` 并附带合适的 HTTP 状态码（400/404/409）。
- 业务逻辑层定义专用 Error 子类（如 `DirectorToolOutputError`、`ArtifactValidationError`），携带语义化 code/message，便于上层区分处理。
- 流式 SSE 通道通过 `StreamError` 结构体传递阶段级错误，并在事件总线中广播 `error` 事件。

## 2. 关键文件与包
- `src/app/error.tsx` — 客户端默认错误页
- `src/app/global-error.tsx` — 全局错误页（包裹 html/body）
- `src/app/api/director/pipeline/route.ts` — 流水线启停 API，统一 try/catch 返回 `{ ok, error }`
- `src/app/api/render/route.ts` — 渲染入队 API，含 `messageOf` 辅助函数
- `src/app/api/projects/route.ts` — 项目创建 API，catch 后返回 400
- `src/app/api/director/stage/route.ts` — 单阶段入队 API，Zod 校验 + 409 错误
- `src/app/api/director/stream/[nodeId]/route.ts` — SSE 流式日志，支持 `snapshot/delta/done/error` 事件
- `src/lib/stream/stream-bus.ts` — 进程内流式事件总线，定义 `StreamError` 接口与事件类型
- `src/features/director/pi-output.ts` — `DirectorToolOutputError` 自定义错误类
- `src/features/director/tools/write-artifact.ts` — `ArtifactValidationError` 自定义错误类

## 3. 架构与约定
- **请求验证**：所有 API 路由均使用 `z.object(...).strict()` 对请求体进行强校验，失败直接返回 400，避免无效数据进入业务层。
- **统一响应格式**：API 成功返回 `{ ok: true, ...data }`，失败返回 `{ ok: false, error: string }`，HTTP 状态码按语义选择（400 参数错误、404 资源不存在、409 冲突/入队失败）。
- **业务错误类型化**：核心模块抛出继承自 `Error` 的自定义类，包含 `name` 和可选 `code` 字段，例如 `DirectorToolOutputError.code = 'DIRECTOR_TOOL_OUTPUT_MISSING'`、`ArtifactValidationError.errors: string[]`。
- **SSE 错误传播**：流式通道将阶段错误封装为 `StreamError { stage, message }`，通过 `event: error` 推送给前端，同时持久化到 artifact 供回放。
- **前端错误展示**：Next.js 内置 `error.tsx`/`global-error.tsx` 捕获未处理异常，显示中文“出错了”/“系统错误”及原始 message，并提供“重试”按钮调用 `reset()`。

## 4. 约定与约束
- **API 层必须使用 Zod 校验请求体**，失败立即返回 400 且 `ok: false`。
- **业务函数抛出具体 Error 子类**而非裸字符串或通用 Error，以便调用方区分处理。
- **SSE 流必须遵循 snapshot → delta* → done/error 事件序列**，错误事件需携带 `StreamError` 结构。
- **前端错误页不泄露堆栈**，仅展示 `error.message`，敏感信息不得暴露给客户端。
- **流式总线订阅者异常被吞掉**（try/catch 包裹 listener），确保单个订阅者崩溃不影响其他订阅者与主流程。