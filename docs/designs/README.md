# docs/designs/

设计文档。v3 的规范性技术架构已经迁入
[`CVC-ARCH-V3`](../specs/2026-07-24-refactor-v3-architecture-spec.md)；本目录保留
视觉系统、Pencil 交接与 Demo v1 历史架构。

## 用途

存放架构设计和技术方案文档，包括：
- 系统架构设计（整体架构、模块划分、数据流）
- UI/UX 设计（页面布局、交互设计、组件设计）
- 技术方案（技术选型对比、方案决策记录）

## 当前权威

- `canvas.pen`：视觉 SSOT，只能通过 Pencil MCP 访问；
- `2026-07-23-design-system-inventory.md`：Token/图标/组件规范；
- v3 新 UI：按 N6 Track Plan 执行 Pencil → Playbook → 页面；
- `2026-07-23-platform-architecture-design.md` 与 `tasks.md`：冻结历史文档。

## 文档结构模板

```markdown
# [Design Title]

> Created: YYYY-MM-DD
> Updated: YYYY-MM-DD
> Status: draft | review | accepted | deprecated

## 问题陈述
[要解决什么问题]

## 方案对比
[列出多个候选方案及其优劣]

## 最终决策
[选择了哪个方案]

## 决策理由
[为什么选择这个方案]
```
