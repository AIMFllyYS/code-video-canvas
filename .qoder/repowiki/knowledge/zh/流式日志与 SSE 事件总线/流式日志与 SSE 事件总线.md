---
kind: logging_system
name: 流式日志与 SSE 事件总线
category: logging_system
scope:
    - '**'
source_files:
    - src/lib/stream/stream-bus.ts
    - src/app/api/director/stream/[nodeId]/route.ts
    - src/lib/hooks/use-stage-stream.ts
    - src/app/(app)/canvas/streaming-log-card.tsx
    - src/features/director/pi-session.ts
---

本仓库没有引入通用日志框架（如 winston、pino），而是采用「进程内流式事件总线 + Server-Sent Events」的轻量方案，将 AI 节点各阶段的逐 token 输出以结构化事件形式实时推送到前端。核心设计如下：

1. 基础设施：`src/lib/stream/stream-bus.ts` 实现 `StreamBus` 类，以 `${projectId}:${nodeId}` 为键维护有界内存缓冲（上限 256KB，超出置 `truncated`），提供 `publish/delta`、`markDone`、`markError`、`subscribe/snapshot` 等 API，并通过 `globalThis.__cvcStreamBus` 单例避免 Next.js HMR split-brain。
2. SSE 路由：`src/app/api/director/stream/[nodeId]/route.ts` 暴露 `/api/director/stream/:nodeId?projectId=...`，根据是否活跃流选择 live 订阅或回放持久化日志；事件类型包括 `snapshot`（初始全文+终态）、`delta`（增量文本）、`done`、`error`（含 `stage`/`message` 结构体）。
3. 前端 Hook：`src/lib/hooks/use-stage-stream.ts` 封装 EventSource 连接，按 `projectId:nodeId:status` 派生 key 管理生命周期，返回 `{text, streaming, charCount, truncated, error}` 状态供 UI 消费。
4. UI 组件：`src/app/(app)/canvas/streaming-log-card.tsx` 组合 CollapsibleCard 展示流式文本、字符计数、截断提示，并在失败时通过 `StageErrorDialog` 弹出持久化错误详情。
5. 写入点：AI 会话在 `src/features/director/pi-session.ts` 中监听 agent 事件，将增量文本经 `streamBus.publish(streamKey, delta)` 广播。
6. 辅助日志：业务异常使用 `console.error('[模块] 描述', {字段})` 直写控制台（如 `gemini-adapter.ts`、`stepfun-adapter.ts`、`stage-runner.ts`、`queue-handler.ts`），无统一 logger 抽象。

约定与约束：
- 事件契约严格遵循 `StreamEvent` 联合类型（snapshot/delta/done/error），错误统一为 `{ stage, message }`。
- 流缓冲上限 256KB，超长自动截断并标记 `truncated`，防止内存膨胀。
- 末位订阅者断开后延迟 30s 清理缓冲，兼顾刷新/短暂重连的回放需求。
- SSE 连接在客户端 `EventSource` 自动重连机制下工作，服务端通过 snapshot 兜底保证一致性。
- 持久化由 Director 层负责（artifact 存储），StreamBus 仅做进程内中转，不直接读写 DB。