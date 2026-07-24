# ADR-0002：Trigger.dev 只负责执行编排

- 状态：Accepted
- 日期：2026-07-24

## Context

当前进程内 queue、自动推进、重试、SSE 和状态恢复分散在多个模块，并依赖 Next
进程内单例。项目需要可取消、可重试、可观测且未来能迁移生产 worker 的执行面。

## Decision

1. 使用 Trigger.dev Cloud 控制面；
2. 开发期通过 `trigger dev` 在本机执行 task 代码；
3. 只定义七类稳定 task；
4. task 通过 application service 操作业务，不直接访问 UI/SDK 实现；
5. Trigger 管 queue、retry、cancel、run status、logs 和 Realtime；
6. Postgres 管 project/node/run/attempt/artifact 等业务事实；
7. 不创建通用 `run_events` 镜像；
8. 删除旧 queue、stream-bus、SSE 和 instrumentation 启动逻辑。

## Consequences

正面：

- 删除多套基础设施；
- 资源并发与重试规则集中；
- 前端获得标准 Realtime；
- worker 可迁移生产环境。

代价：

- 开发不再完全离线；
- 生产 worker 必须能访问 Postgres/ArtifactStore；
- parent/child task 版本需要治理；
- 取消和 temp cleanup 必须显式传播。

## Rejected alternatives

- 继续进程内 queue：无法稳定跨进程/部署；
- Redis/BullMQ：增加另一套需要维护的控制面；
- Trigger + 自建 scheduler 并存：双调度器不可接受；
- 每个 Canvas 节点一个 task：把产品视图误当执行边界。

## Verification

- `trigger dev` 下启动、并发、失败、重试、取消、Realtime 全部有证据；
- task 数量和 ID 受 source test 约束；
- UI 刷新后以 PG snapshot 对账；
- source scan 无旧 queue/stream import。
