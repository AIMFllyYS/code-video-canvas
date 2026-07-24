# Architecture Decision Records

本目录保存 CodeVideoCanvas 已接受的长期架构决策。

规则：

1. ADR 被接受后只允许修正文法、链接和事实性勘误；
2. 改变决策必须新增一份 ADR，并在旧 ADR 标记 `Superseded by ADR-xxxx`；
3. ADR 解释“为什么”，规范性接口以 v3 Architecture Spec 为准；
4. Task/Track 状态不得写入 ADR。

## 当前 ADR

| ADR | 状态 | 决策 |
|---|---|---|
| [ADR-0001](./0001-postgres-local-cloud-ready.md) | Accepted | Postgres 本地开发优先、云就绪 |
| [ADR-0002](./0002-trigger-execution-boundary.md) | Accepted | Trigger.dev 只负责执行编排 |
| [ADR-0003](./0003-pi-agent-runtime.md) | Accepted | Pi Agent 作为 CVC 唯一 Agent Runtime |
| [ADR-0004](./0004-video-compiler-hyperframes.md) | Accepted | video-compiler → HyperFrames 单时钟 |
