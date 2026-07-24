# ADR-0001：Postgres 本地开发优先、云就绪

- 状态：Accepted
- 日期：2026-07-24
- 决策人：项目负责人

## Context

当前应用使用 SQLite，同步查询已经深入 canvas、director、render、audio 和 settings。
项目未来将与采用 Postgres 合同的 PurpleInk 迁移合并，并面向生产环境。继续把 SQLite
作为正式运行时，会让 repository、ID、事务、workspace 和幂等语义持续分叉。

## Decision

1. 正式结构化数据运行时切换为 Postgres；
2. 本地开发使用 Docker Compose 单 Postgres 服务；
3. Drizzle schema 使用 `pg-core` 和 tracked SQL migration；
4. workspace 业务表使用 `(workspace_id,id)` 复合键；
5. 本轮自动创建单一 local workspace，不实现登录；
6. 迁移前使用 SQLite Online Backup API 生成活动 WAL 的一致性快照；禁止直接复制
   `app.db` 冒充备份；
7. SQLite 只用于一次性只读 export/import，不保留双写或 fallback；
8. model route 与加密 provider credential 分表；缺 master key 时禁止明文 fallback；
9. 生产数据库供应商在部署阶段选择，不进入领域代码。

## Consequences

正面：

- 提前统一未来最昂贵的数据边界；
- 支持真实并发、约束、attempt fencing 和 command receipt；
- Trigger worker 与 Next 可共享业务真源。

代价：

- repository 必须全面 async 化；
- 需要显式迁移历史数据；
- 本地开发多一个 Docker 依赖；
- 数据库测试必须使用真实 Postgres 最终验收。

## Rejected alternatives

- 继续 SQLite：与生产和 PurpleInk 继续分叉；
- SQLite/PG 长期双支持：成倍增加测试矩阵和语义差异；
- PGlite 正式 fallback：无法代替部署级 Postgres 行为；
- 复制 PurpleInk 完整 schema：当前产品不需要其 SaaS 全域。

## Verification

- fresh Postgres 能应用全部 tracked migrations；
- 跨 workspace FK 被拒绝；
- receipt/fingerprint 与 attempt fencing 有 integration test；
- runtime source scan 无 `better-sqlite3`；
- SQLite backup 通过 `PRAGMA quick_check`、逐表计数与 SHA-256；
- SQLite import 有主键/计数/hash 对账报告。
