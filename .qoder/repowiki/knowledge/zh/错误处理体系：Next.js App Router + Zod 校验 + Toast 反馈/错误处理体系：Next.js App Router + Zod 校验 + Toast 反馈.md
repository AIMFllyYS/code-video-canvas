---
kind: error_handling
name: 错误处理体系：Next.js App Router + Zod 校验 + Toast 反馈
category: error_handling
scope:
    - '**'
source_files:
    - src/app/error.tsx
    - src/app/global-error.tsx
    - src/components/ui/toast.tsx
    - src/app/(app)/canvas/canvas-action-api.ts
    - src/app/(app)/canvas/pipeline-feedback.ts
    - src/app/api/render/route.ts
    - src/app/api/director/stage/route.ts
    - src/app/api/director/pipeline/route.ts
    - src/features/director/stage-result.ts
---

本仓库采用分层、约定驱动的错误处理体系，覆盖客户端 UI、API 路由、业务逻辑与全局异常四个层面。

1. 系统/框架
- Next.js App Router 的 `error.tsx` 与 `global-error.tsx` 作为页面级与全局级错误边界，统一渲染“出错了/系统错误”页面并提供重试按钮。
- API 层使用 `NextResponse.json` / `Response.json` 返回结构化 `{ ok, error }` 响应体，配合 HTTP 状态码（400/404/409）区分参数错误、资源不存在与业务冲突。
- 请求体校验统一通过 `zod` 的 `safeParse`，失败时直接返回 400 并附带第一条错误信息。
- 前端用户反馈统一通过 `src/components/ui/toast.tsx` 提供的 `Toast` 组件与 `toast.show()` 单例，支持 `info/success/warning/error` 四种变体。

2. 关键文件与位置
- 全局错误边界：`src/app/error.tsx`、`src/app/global-error.tsx`
- API 路由示例：`src/app/api/render/route.ts`、`src/app/api/director/stage/route.ts`、`src/app/api/director/pipeline/route.ts`、`src/app/api/jobs/[id]/route.ts`、`src/app/api/artifacts/[id]/route.ts`
- 前端调用封装：`src/app/(app)/canvas/canvas-action-api.ts`（将 fetch 响应转换为抛错或成功结果）
- 管道反馈描述器：`src/app/(app)/canvas/pipeline-feedback.ts`（将 PipelineControlResult 转为 Toast 文案）
- 通用 Toast 组件与全局入口：`src/components/ui/toast.tsx`
- 阶段结果校验与业务错误抛出：`src/features/director/stage-result.ts`

3. 架构与约定
- API 层约定：所有 POST/GET 路由先做 zod 校验，失败返回 `{ ok: false, error: string }` + 400；找不到资源返回 404；业务冲突（如重复入队）返回 409。成功路径返回 `{ ok: true, jobId }` 等具体字段。
- 客户端调用约定：`canvas-action-api.ts` 对 `response.ok` 进行判断，非 2xx 时从 `body.error` 提取字符串或回退为默认消息，再 `throw new Error(...)` 上抛给上层组件捕获。
- 业务层错误：在 `stage-result.ts` 等核心逻辑中直接 `throw new Error(message)`，由上层 try/catch 或 API 路由 catch 块统一包装为 `{ ok: false, error }`。
- UI 展示约定：组件侧通过 `<Toast variant="error" title="失败" body={error} />` 或直接调用 `toast.show('error', ...)` 呈现错误，避免分散的 alert/console。
- 管道操作反馈：`pipeline-feedback.ts` 将 `PipelineControlResult` 中的 `enqueuedNodeIds`/`failedNodeIds`/`autopilot` 映射为用户可读的成功/错误文案，再由组件渲染 Toast。

4. 约束与模式总结
- 禁止直接使用 `console.log` 作为错误上报；对外暴露的错误信息必须经过 `messageOf`/`parsed.error.issues[0]?.message` 等归一化。
- 所有外部输入（请求体、模型输出 JSON）必须经 zod 校验后再使用，未通过即视为参数错误。
- 客户端与服务端之间不传递原始 Error 对象，仅传递字符串消息，防止敏感堆栈泄露。
- 页面级异常由 Next.js 内置错误边界兜底，保证应用不会白屏。
- 无自定义错误类型枚举或类层次结构，错误以字符串消息为主，辅以 HTTP 状态码与 `{ ok, error }` 响应体进行区分。