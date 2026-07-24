---
kind: logging_system
name: 流式日志系统（SSE + 内存事件总线）
category: logging_system
scope:
    - '**'
source_files:
    - src/lib/stream/stream-bus.ts
    - src/app/api/director/stream/[nodeId]/route.ts
    - src/lib/hooks/use-stage-stream.ts
    - src/app/(app)/canvas/streaming-log-card.tsx
    - src/features/director/stage-runner.ts
---

本仓库未引入第三方日志框架，而是实现了一套面向 AI 导演流水线阶段的**流式日志系统**：后端通过进程内事件总线累积逐 token 输出，前端通过 SSE（Server-Sent Events）实时订阅并渲染。核心设计围绕“运行中增量推送 + 终态持久化回放”的双通道模式。

### 1. 使用的系统与组件
- **SSE 通道**：`/api/director/stream/[nodeId]` 路由以 `text/event-stream` 返回，支持 keepalive、自动重连与错误帧。
- **进程内事件总线**：`StreamBus` 类以 `${projectId}:${nodeId}` 为键维护有界内存缓冲（默认 256KB，超出置 truncated），广播 snapshot / delta / done / error 四类事件。
- **前端 Hook 与 UI**：`useStageStream` hook 封装 EventSource 订阅逻辑；`StreamingLogCard` 组件负责折叠展示、字符计数、截断提示与失败弹窗。
- **持久化回放**：阶段产物中以 `kind: 'director-stream-log'` 的 artifact 保存完整文本，SSE 在节点已终态时直接回放该 artifact。

### 2. 关键文件与包
- `src/lib/stream/stream-bus.ts` — 进程内流式事件总线单例（globalThis 锚定避免 split-brain）
- `src/app/api/director/stream/[nodeId]/route.ts` — SSE 服务端路由，合并 live 订阅与持久化回放
- `src/lib/hooks/use-stage-stream.ts` — 客户端 SSE 订阅 Hook
- `src/app/(app)/canvas/streaming-log-card.tsx` — 流式日志卡片 UI
- `src/features/director/stage-runner.ts` — 阶段执行器，调用 `streamBus.publish/markDone/markError`
- `src/features/render/queue-handler.ts` — 渲染队列中同样使用 console.error 记录下游推进失败

### 3. 架构与约定
- **事件模型**：`StreamEvent` 统一为 `{type:'snapshot'|'delta'|'done'|'error', ...}`，前端按类型处理。
- **错误模型**：`StreamError` / `DirectorNodeError` 结构一致，包含 `stage` 与 `message`，失败时先经 SSE error 事件，再落盘到 `canvas_nodes.data.directorError`。
- **缓冲策略**：内存上限 256KB，末尾订阅者断开后保留 30s 以便刷新/短暂重连回放；多实例部署需替换为 Redis pub/sub（代码注释明确标注）。
- **连接生命周期**：仅在节点状态非 idle/pending 时建立 EventSource；status 稳定期间 1.5s router.refresh 不触发重连。
- **split-brain 防护**：全局单例 `streamBus` 挂载于 `globalThis.__cvcStreamBus`，避免 Next.js Turbopack/HMR 下模块重复求值导致的事件总线分裂。

### 4. 约定与约束
- **无结构化日志框架**：业务代码中仅使用 `console.log/error/info` 做调试输出（如 `gemini-adapter.ts`、`stepfun-adapter.ts`、`stage-runner.ts` 中的 `console.error('[xxx] ...')`），无统一 logger 模块或日志级别配置。
- **流式日志字段约定**：所有 SSE 事件必须遵循 `SnapshotPayload` / `StageStreamError` 接口定义，不得随意扩展字段。
- **产物 kind 命名**：流式日志 artifact 固定使用 `kind: 'director-stream-log'`，由 `getLatestArtifact(projectId, nodeId, 'director-stream-log')` 读取。
- **内存安全约束**：`publish` 前检查 `entry.done` 自动重置新轮次；`emit` 内部 try/catch 单个监听器异常不影响其他订阅者。
- **测试覆盖**：`streaming-log-card.test.ts`、`[nodeId]/route.test.ts` 覆盖了错误解析、SSE 事件序列、持久化回放等关键路径。

### 5. 当前局限
- 仅支持单进程内存总线，生产多实例需自行替换为分布式消息中间件。
- 无日志级别、采样率、输出目标（文件/远程服务）等通用日志能力，仅服务于 AI 阶段输出的可视化需求。