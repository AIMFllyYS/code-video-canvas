---
kind: logging_system
name: 日志系统 — 基于 console.error 与 SSE 流式总线的混合输出
category: logging_system
scope:
    - '**'
source_files:
    - src/lib/stream/stream-bus.ts
    - src/app/api/director/stream/[nodeId]/route.ts
    - src/app/(app)/canvas/streaming-log-card.tsx
    - src/features/director/stage-runner.ts
    - src/features/render/qa-check.ts
    - src/features/ai/gemini-adapter.ts
    - src/app/api/render/export/route.ts
    - src/instrumentation.ts
---

## 1. 使用的系统与框架
- 未引入专用日志库（如 pino、winston、bunyan）。应用通过原生 `console.error` / `console.log` 直接输出诊断信息，并在关键路径使用结构化对象作为第二个参数。
- 运行时日志通过 Next.js App Router 的 Server-Sent Events（SSE）通道暴露给前端，由进程内 `StreamBus` 聚合 AI 逐 token 输出并持久化为 artifact。
- 测试/脚本侧使用 Playwright `.playwright-cli/console-*.log` 记录浏览器控制台输出，属于 E2E 辅助产物。

## 2. 核心文件与位置
- 进程内流式总线：`src/lib/stream/stream-bus.ts`（内存缓冲 + 订阅广播 + 自动清理）
- SSE 日志路由：`src/app/api/director/stream/[nodeId]/route.ts`（按 projectId:nodeId 隔离，支持 live 与回放）
- 前端流式展示组件：`src/app/(app)/canvas/streaming-log-card.tsx`（增量渲染、截断提示、错误弹窗）
- Director 阶段执行器：`src/features/director/stage-runner.ts`（在成功/失败分支调用 `persistStreamLog` 落盘全文）
- QA 检测模块：`src/features/render/qa-check.ts`（独立于 Director 的规则检测，失败走 `console.error`）
- AI 适配器：`src/features/ai/gemini-adapter.ts`、`src/features/ai/stepfun-adapter.ts`（校验失败时 `console.error` 记录 status/message）
- 导出 API：`src/app/api/render/export/route.ts`（QA 触发失败的 best-effort 记录）
- 初始化钩子：`src/instrumentation.ts`（仅初始化队列，无日志初始化）

## 3. 架构与约定
- **双轨日志**：
  - 诊断日志：各模块直接使用 `console.error('[模块] 描述', { status, message })` 等结构化对象，便于在 Node 标准输出中检索。
  - 业务流日志：AI 阶段的 token 级输出经 `streamBus.publish(key, delta)` 累积到内存缓冲，再由 `stage-runner` 在阶段结束时调用 `repository.persistStreamLog(projectId, nodeId, stage, text)` 写入 artifact（kind=`director-stream-log`），供 SSE 回放。
- **SSE 通道设计**：`/api/director/stream/[nodeId]?projectId=...` 根据 `streamBus.isActive(key)` 与节点状态决定 live 订阅或一次性回放；对 split-brain 场景做了空快照合并持久化日志的兜底逻辑。
- **内存上限与清理**：`StreamBus` 单键缓冲上限 `MAX_BUFFER_CHARS = 256KB`，超出置 `truncated=true`；末位订阅者断开后延时 30s 清理，避免短重连丢失回放。
- **错误传播**：阶段失败时 `streamBus.markError(key, { stage, message })`，同时 `stage-runner` 将 `directorError` 写回节点上下文，前端 `StreamingLogCard` 以 `resolveVisibleStageError` 优先显示持久化错误。
- **可观测性边界**：QA 检测、导出 readiness 等非 AI 路径不经过 Director 管线，失败统一走 `console.error`，不阻断主流程（best-effort）。

## 4. 约定与约束
- **无全局 logger 初始化**：`instrumentation.ts` 仅初始化队列，未注册任何日志中间件或格式化器。
- **结构化字段约定**：`console.error` 调用普遍附带 `{ status, message }` 或 `{ projectId, nodeId, message }` 等对象，便于外部采集工具解析。
- **流式日志 key 规范**：统一使用 `${projectId}:${nodeId}` 作为 StreamBus 键，SSE 路由与查询均依赖该约定。
- **持久化 kind 命名**：流式日志 artifact 固定 `kind='director-stream-log'`，查询时会过滤掉 `pi-session` 与 `director-stream-log` 两类内部指针（见 `features/canvas/queries.ts`）。
- **降级策略**：SSE 连接建立时若检测到终态节点但内存快照为空，会主动读取持久化日志并补发 snapshot+done/error，保证刷新后一致性。
- **测试覆盖**：`stream/[nodeId]/route.test.ts` 验证了 publish/snapshot/delta/done/error 全生命周期及持久化回放路径。

## 5. 当前局限与演进方向
- 缺少统一的日志级别（debug/info/warn/error）与采样控制，目前全部以 `console.error` 为主。
- 进程内 `StreamBus` 适用于单实例 Demo；多实例部署需替换为 Redis pub/sub（代码注释已标注后置）。
- 未来计划用 Trigger 替代 queue/retry/cancel/stream-bus（见 docs/plans 中的重构蓝图），届时日志子系统可能随事件驱动模型迁移。