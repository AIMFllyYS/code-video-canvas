---
kind: design
name: 斩断 director↔render 双向耦合
source: session
category: adr
---

# 斩断 director↔render 双向耦合

_来源：1bc7587 → 5c81ef8 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
render handler 反向调用 fabricateShot 形成循环依赖，当 render 缺少产物时不应回调上游重新生成，而应明确标记 upstream_blocked 失败。

## 决策驱动
- 依赖方向清晰
- 错误处理明确
- 幂等性保证

## 备选方案
- **单向依赖：director → render** — 优点：消除循环依赖、render 缺产物即 upstream_blocked 失败、职责边界清晰；缺点：需要调整错误处理逻辑
- **保持双向回调** _（已否决）_ — 优点：灵活性强；缺点：循环依赖导致调试困难、错误传播复杂

## 决策
render 模块仅负责渲染和导出，不再调用 fabricateShot；当检测到缺少必要产物时，直接标记节点为 upstream_blocked 失败，由 pipeline scheduler 决定重试策略。

## 影响
消除了 render 对 director 的反向依赖；失败原因更明确（upstream_blocked vs render_failure）；简化了错误恢复流程。