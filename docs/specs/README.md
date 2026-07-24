# docs/specs/

## Active v3 specifications

| 文档 | Doc ID | 活动版本 | 权威范围 |
|---|---|---:|---|
| [Product Spec](./2026-07-24-refactor-v3-product-spec.md) | `CVC-PRODUCT-V3` | `3.0.0` | 产品范围、用户行为、用户可见验收 |
| [Architecture Spec](./2026-07-24-refactor-v3-architecture-spec.md) | `CVC-ARCH-V3` | `3.0.0` | 技术合同、状态、数据、依赖、执行与迁移 |
| [Codex Harness](./2026-07-24-refactor-v3-codex-harness.md) | `CVC-HARNESS-V3` | `3.1.0` | 单一 Master Goal、Track/Task 施工、验证、证据与 Git |
| [Task Breakdown](./2026-07-24-refactor-v3-task-breakdown.md) | `CVC-TASKS-V3` | `3.1.0` | 唯一任务状态与依赖账本 |

`AGENTS.md → Product → Architecture → Harness → Task Breakdown → Track Issue` 是
开工读取与责任定位顺序，不是遇到矛盾时凭顺序覆盖的优先级。活动规范不兼容时必须登记
`DOC-CONFLICT`、停止受影响施工，并先修正 owner Spec/Harness/Task；蓝图与 ADR 解释
理由，但不维护 Task 状态。

## Historical specifications

日期为 2026-07-23 的 PRD、Harness 和 Task Breakdown 描述 Demo v1 管线，保留为历史
证据；从 v3 生效后不再指导新重构实施。
