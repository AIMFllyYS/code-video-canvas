---
kind: design
name: 阶段失败通过 Dialog 组件展示真实错误信息
source: session
category: adr
---

# 阶段失败通过 Dialog 组件展示真实错误信息

_来源：2ebef8c → 7c2ea78 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
Director 阶段失败时 recordStageError 已将 directorError 写入 canvas_nodes.data，但从未向用户展示。需要复用现有 UI 原语呈现服务端已持久化的错误信息。

## 决策驱动
- 复用优先机制
- 错误信息真实性
- 避免新增视觉原语

## 备选方案
- **复用 Dialog + Toast 组合** — 优点：Dialog/Toast 已登记源自 canvas.pen、无需新增 Pencil symbol、符合复用优先；缺点：需确保消息内容区可滚动处理长 message
- **新增独立的 StageErrorDialog 原语** _（已否决）_ — 优点：语义更明确；缺点：违反复用优先原则、增加设计系统维护负担

## 决策
在 stage-error-dialog.tsx 业务组合中使用已登记的 Dialog 组件，仅当 node.status==='failed' 且存在 directorError 时弹出，显示真实的 stage 和 message 信息，提供重试按钮复用 triggerNodeAction。

## 影响
错误弹窗仅在 failed 态且有持久化 directorError 时展示，重跑成功后按 status 自动隐藏；瞬时入队错误保留 Inspector 既有内联 Toast，需详读的阶段失败用弹窗。