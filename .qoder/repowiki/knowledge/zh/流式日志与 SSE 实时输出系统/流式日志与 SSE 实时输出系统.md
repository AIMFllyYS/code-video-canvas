---
kind: logging_system
name: 流式日志与 SSE 实时输出系统
category: logging_system
scope:
    - '**'
source_files:
    - src/lib/stream/stream-bus.ts
    - src/app/api/director/stream/[nodeId]/route.ts
    - src/lib/hooks/use-stage-stream.ts
    - src/app/(app)/canvas/streaming-log-card.tsx
    - src/features/director/runtime-repository.ts
---

本仓库没有引入通用日志框架（如 pino、winston、bunyan 等），而是围绕「AI Director 流水线阶段」构建了一套**进程内流式事件总线 + SSE 实时推送 + 持久化回放**的专用日志系统。核心设计如下：

### 1. 使用的系统与架构
- **进程内事件总线**：`src/lib/stream/stream-bus.ts` 中的 `StreamBus` 以 `${projectId}:${nodeId}` 为键维护有界内存缓冲（默认 256KB，超出截断并置 `truncated`），向订阅者广播 `snapshot / delta / done / error` 四类事件。
- **SSE 服务端通道**：`src/app/api/director/stream/[nodeId]/route.ts` 暴露 `/api/director/stream/:nodeId?projectId=...`，根据是否仍有活跃流决定走“实时订阅”还是“回放持久化日志”，返回标准 EventSource 协议（`text/event-stream`）。
- **前端订阅 Hook**：`src/lib/hooks/use-stage-stream.ts` 在客户端通过 `EventSource` 订阅上述 SSE，累积 `text`、统计 `charCount`、处理 `truncated` 与结构化 `error`。
- **UI 展示组件**：`src/app/(app)/canvas/streaming-log-card.tsx` 将流式文本渲染为可折叠卡片，失败时弹出 `StageErrorDialog` 并支持重试。
- **持久化层**：`src/features/director/runtime-repository.ts` 的 `persistStreamLog` 将每阶段日志写入 storage key `director-stream/${projectId}/${nodeId}/${slug}.log`，并以 `kind: 'director-stream-log'` 注册 artifact pointer，供 SSE 回放读取。

### 2. 关键文件与包
- `src/lib/stream/stream-bus.ts` — 进程内流式事件总线单例 `streamBus`
- `src/app/api/director/stream/[nodeId]/route.ts` — SSE 路由，负责 live 转发与回放
- `src/lib/hooks/use-stage-stream.ts` — 客户端 SSE 订阅 Hook
- `src/app/(app)/canvas/streaming-log-card.tsx` — 流式日志 UI 卡片
- `src/features/director/runtime-repository.ts` — 日志持久化与错误记录（`recordStageError`）

### 3. 约定与约束
- **事件模型**：所有流式日志统一以 `snapshot`（全文快照）、`delta`（增量文本）、`done`（结束）、`error`（结构化 `{stage, message}`）四类事件传输，前后端严格同构。
- **内存上限**：单键缓冲最大 256KB，超出后丢弃最旧内容并标记 `truncated: true`，防止长流打爆内存。
- **清理策略**：末位订阅者断开且流已结束，延迟 30s 后清理缓冲；keepalive 心跳间隔 15s，避免代理/浏览器超时。
- **回放语义**：当无活跃流或刷新后重连，SSE 直接回放已持久化的 `.log` 全文，随后发送 `done` 或 `error`，保证状态一致性。
- **错误传播**：阶段失败通过 `recordStageError` 写入 `canvas_nodes.data.directorError`，SSE 的 `error` 事件与 UI 弹窗共享同一结构。
- **无全局 logger**：除脚本探针与测试中偶发的 `console.log/error/info` 外，业务代码不依赖任何第三方日志库，所有运行时诊断均通过该流式通道与 SSE 暴露。

### 4. 适用边界
该系统仅覆盖 AI Director 各阶段的**逐 token 流式输出与阶段级错误**，并非通用的应用日志框架；常规请求/数据库/外部调用日志仍使用原生 `console.*` 或框架默认输出，未做集中收集或结构化落盘。