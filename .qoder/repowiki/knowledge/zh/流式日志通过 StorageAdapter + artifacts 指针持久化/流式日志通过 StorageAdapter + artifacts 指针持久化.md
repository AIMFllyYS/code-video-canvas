---
kind: design
name: 流式日志通过 StorageAdapter + artifacts 指针持久化
source: session
category: adr
---

# 流式日志通过 StorageAdapter + artifacts 指针持久化

_来源：2ebef8c → 7c2ea78 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
需要将逐 token 输出的文本持久化为可回看日志，要求刷新不丢、阶段完成后仍可展开回看，且不能影响现有的 getCanvasGraph 轮询性能。

## 决策驱动
- 零 DB 迁移成本
- 复用现有 pi-session 范式
- 避免拖慢画布轮询
- 真实可追溯

## 备选方案
- **StorageAdapter + artifacts 指针** — 优点：零迁移、复用既有模式、独立 artifact 不污染 node.data；缺点：需要新增 director-stream-log kind 排除逻辑
- **canvas_nodes.data.streamingLog 字段** _（已否决）_ — 优点：实现简单；缺点：getCanvasGraph 每 1.5s 轮询会 select 所有节点的 data，数十 KB 日志会严重拖慢性能
- **新建 director_stream_logs SQLite 表** _（已否决）_ — 优点：结构化存储；缺点：需 Drizzle 迁移（AGENTS.md 要求先问）、增加维护复杂度

## 决策
在 DirectorRuntimeRepository 新增 persistStreamLog，写入 storage.put(key, text) 并插入 artifacts 指针行（kind: 'director-stream-log'），key 用稳定相对路径 director-stream/${projectId}/${nodeId}/${stageSlug}.log。queries.ts 中 getNodeArtifacts 排除该 kind 避免死链 chip。

## 影响
成功时落全文、失败时落已流出部分文本；SSE 路由在无活跃流时读持久化日志作为 snapshot 回放；director-stream-log 从产物 chips 中排除。持久化失败不得掩盖主流程错误。