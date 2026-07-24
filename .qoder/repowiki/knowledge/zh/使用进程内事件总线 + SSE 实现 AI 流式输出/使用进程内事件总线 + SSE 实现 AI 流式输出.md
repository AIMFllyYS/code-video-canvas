---
kind: design
name: 使用进程内事件总线 + SSE 实现 AI 流式输出
source: session
category: adr
---

# 使用进程内事件总线 + SSE 实现 AI 流式输出

_来源：2ebef8c → 7c2ea78 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
Inspector 面板中节点生成状态为写死的'生成中，进度无法预估'，用户需要看到 Director 后台 worker 里 Pi Agent 逐 token 产出的真实内容。需要在全部六阶段（INGEST/DIRECT/SHOT_SPEC/FABRICATE/ASSEMBLE/FINALIZE）接入流式输出，并通过实时通道推送到浏览器。

## 决策驱动
- token 级实时性
- 刷新不丢的持久化能力
- 零 DB 迁移成本
- 与现有 1.5s 轮询共存

## 备选方案
- **进程内事件总线 + SSE** — 优点：内存级延迟、无需额外基础设施、与 EventSource 天然契合；缺点：单实例部署限制（多实例需 Redis pub/sub 后置）
- **WebSocket 全双工** _（已否决）_ — 优点：双向通信灵活；缺点：重连逻辑复杂、SSE 已足够单向推送场景
- **长轮询** _（已否决）_ — 优点：实现简单；缺点：无法达到 token 级实时性，增加服务器负载

## 决策
采用进程内 stream-bus 作为 pub/sub 中间层，通过 /api/director/stream/[nodeId] SSE 路由将 delta 推送到浏览器 EventSource；以 projectId:nodeId 为键避免暴露 session.id。

## 影响
新增 src/lib/stream/stream-bus.ts 有界内存缓冲（256KB/键防膨胀）、SSE 路由支持活跃流转发与无流时的持久化回放、前端 useStageStream hook 管理连接生命周期。多实例部署需替换为 Redis pub/sub。