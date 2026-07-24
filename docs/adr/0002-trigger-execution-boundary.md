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
8. 所有 CVC Trigger key 显式使用 global scope；业务 receipt 同 key/同 fingerprint
   重放原结果，同 key/不同 fingerprint 返回 409；
9. receipt 与 `pipeline_runs(triggering)` 同事务创建；dispatch 中断由相同 global
   key 和 reconciler 恢复；
10. `task_attempts` 是步骤真源、`pipeline_runs` 是聚合真源、`canvas_nodes` 是
    可重建投影；Realtime 不写业务终态；
11. 删除旧 queue、stream-bus、SSE 和 instrumentation 启动逻辑。

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
- `cvc.shot.generate → cvc.shot.media/cvc.shot.render` 的依赖图受 graph test 约束；
- receipt replay/conflict、stale attempt 和 dispatch recovery 有 integration test；
- UI 刷新后以 PG snapshot 对账；
- source scan 无旧 queue/stream import。

## 官方机制锚点

以下 Trigger.dev v4 官方合同在 2026-07-24 重新核验，实施时仍须以锁定 SDK 的
类型与 spike 为准：

- [Idempotency](https://trigger.dev/docs/idempotency)：v4.3.1 起 task 内 raw string
  默认是 run scope；跨 parent 重放必须显式
  `idempotencyKeys.create(key, { scope: "global" })`；
- [Concurrency & Queues](https://trigger.dev/docs/queue-concurrency)：共享 queue
  集中限制同类资源；parent 到 waitpoint 后 checkpoint 并释放并发槽；
- [Triggering](https://trigger.dev/docs/triggering)：禁止用 `Promise.all` 包裹
  `triggerAndWait`；同类 fan-out 用 `batchTriggerAndWait`，异类 fan-out 用 typed
  batch，并逐个检查 `Result.ok`；
- [Realtime React hooks](https://trigger.dev/docs/realtime/react-hooks/subscribe)：
  `useRealtimeRunsWithTag` 只消费受 scope 的 tag/token；CVC 仍以 Postgres Snapshot
  作为持久化业务终态。
