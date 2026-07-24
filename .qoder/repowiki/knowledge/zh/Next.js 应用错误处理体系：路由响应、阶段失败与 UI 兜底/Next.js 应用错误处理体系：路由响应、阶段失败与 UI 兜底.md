---
kind: error_handling
name: Next.js 应用错误处理体系：路由响应、阶段失败与 UI 兜底
category: error_handling
scope:
    - '**'
source_files:
    - src/app/error.tsx
    - src/app/global-error.tsx
    - src/app/not-found.tsx
    - src/app/(app)/canvas/stage-error-dialog.tsx
    - src/app/(app)/canvas/export/export-api.ts
    - src/app/(app)/canvas/shot/[id]/shot-api.ts
    - src/features/director/stage-runner.ts
    - src/features/director/tools/write-artifact.ts
    - src/app/api/render/route.ts
---

本仓库的错误处理围绕 Next.js App Router 的运行时错误页面、API Route 结构化响应以及 Director 流水线阶段的持久化失败记录展开，形成「服务端返回结构化错误 → 客户端抛 Error → 统一错误页/弹窗展示」的分层模式。

1. 系统/框架层面
- 使用 Next.js 内置错误页面：src/app/error.tsx（路由级）和 src/app/global-error.tsx（全局级），均接收 error: Error & { digest?: string } 并渲染「出错了/系统错误 + 重试按钮」。src/app/not-found.tsx 提供 404 页面。这些页面是 React Server Components 生态下的标准错误边界。
- API Route 全部通过 NextResponse.json({ ok, error, ... }, { status }) 返回结构化 JSON，HTTP 状态码用于区分 400/404/409 等语义；没有引入中间件或统一的异常处理中间件。

2. 关键文件与位置
- 错误页面与 404：src/app/error.tsx、src/app/global-error.tsx、src/app/not-found.tsx
- 画布阶段失败弹窗：src/app/(app)/canvas/stage-error-dialog.tsx
- 前端 fetch 封装与错误转换：src/app/(app)/canvas/export/export-api.ts、src/app/(app)/canvas/shot/[id]/shot-api.ts
- 核心阶段执行器（捕获并持久化错误）：src/features/director/stage-runner.ts
- 产物校验自定义错误类型：src/features/director/tools/write-artifact.ts（ArtifactValidationError）
- 典型 API Route 示例：src/app/api/render/route.ts、src/app/api/jobs/[id]/route.ts、src/app/api/artifacts/[id]/route.ts

3. 架构与约定
- API 层：每个 route 先对请求体做 Zod 校验，失败直接返回 { ok: false, error, status: 400 }；业务校验失败返回 404/409；正常入队/查询成功返回 { ok: true, jobId, ... }。所有 catch 分支都通过 messageOf(error) 将 Error.message 转为字符串后放入 error 字段，避免泄露堆栈。
- 客户端 fetch 层：export-api.ts 与 shot-api.ts 在 response.ok === false 时调用本地 errorOf(body, fallback) 提取 body.error 或回退到中文提示，再 throw new Error(...)，由上层组件捕获并通过 toast/dialog 展示。
- Director 阶段执行：stage-runner.ts 的 createStageRunner 用 try/catch 包裹整个阶段流程，失败时：
  - 将节点状态置为 failed
  - 调用 repository.recordStageError(nodeId, stage, error) 把错误信息持久化到 DB
  - 通过 streamBus.markError 标记 SSE 流错误
  - 若清理步骤也失败，则抛出 AggregateError 聚合主错误与清理错误
- 产物写入：writeValidatedArtifact 对输入进行 Zod 校验与内容校验，失败抛出 ArtifactValidationError（继承 Error，name 固定），以便上层区分「参数/内容校验失败」与「IO/DB 失败」。

4. 约定与约束
- API 响应必须遵循 { ok: boolean; error?: string; [其他字段] } 结构，客户端据此判断成功/失败。
- HTTP 状态码约定：400 表示请求体/参数无效，404 表示资源不存在，409 表示作业已存在/冲突，201 表示创建成功。
- 前端 fetch 封装禁止吞掉后端 error 字段，必须将其包装成 new Error(...) 向上抛出，再由 UI 层决定展示策略。
- 阶段失败原因以文本形式持久化，UI 通过 StageErrorDialog 展示真实错误消息并提供手动重试入口，而非自动恢复。
- 未定义全局错误中间件或 Sentry 集成，错误上报依赖 Next.js 默认的 digest 机制与日志输出。