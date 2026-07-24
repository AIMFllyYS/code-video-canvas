# docs/conventions/

项目规范、编码约定、架构规范。v3 的规范性架构合同位于
[`CVC-ARCH-V3`](../specs/2026-07-24-refactor-v3-architecture-spec.md)，本目录提供
日常开发约定与解释，不维护另一套架构决策。

## 用途

存放项目内部的规范文档，包括：
- 编码规范（TypeScript、React、CSS 命名等）
- 架构规范（目录结构、模块划分、依赖方向）
- Git 规范（分支策略、Commit 消息格式）
- API 设计规范
- 文档编写规范

## 与 AGENTS.md 的关系

`AGENTS.md` 是面向 AI 编码代理的运行入口，本目录面向所有开发者。两者都应投影
Product/Architecture/Harness 的规则；发生冲突时必须登记 `DOC-CONFLICT` 并先修正规范，
不能自行挑选一份执行。

## v3 入口

- [架构规范](./architecture-conventions.md)
- [编码规范](./coding-standards.md)
- [Git 工作流](./git-workflow.md)
- [Codex Goal Harness](../specs/2026-07-24-refactor-v3-codex-harness.md)
