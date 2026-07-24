# N1.2 Fresh Postgres Migration 证据

- Task：`N1.2`
- 状态：`done`
- 日期：2026-07-25
- 分支：`main`
- 实现 commit：`513bb1d`
- evidence class：`runtime-local + tracked-migration`
- workflowVersion：`cvc-v3-foundation|cvc-arch-v3.0.0|legacy-html-v1|legacy-cvc-render-v1|node22-playwright1.61.1-ffmpeg-static5.3.0`
- push：`false`

## 1. Driver 与生成物

- pnpm 精确安装 `postgres@3.4.9`；`pnpm why postgres` 只显示该 direct dependency
  以及 Drizzle 对同一版本的 peer 解析。
- `drizzle-kit generate --name v3_postgres_foundation` 生成一个 0000 SQL 与两个
  meta 文件，inventory 为十二表。
- 人工审阅后只在 SQL 末尾追加 approved/released artifact immutable trigger；
  meta JSON 未手改。
- 再次运行 generator 返回 `No schema changes, nothing to migrate`。

## 2. Final fresh 与 repeat

终审发现两阶段启动要求 `pipeline_runs.trigger_run_id` 在 dispatch 前可空。修订
schema 并重新生成未提交 migration 后，先对本轮新建的本地 `cvc` throwaway 库逐表
核对，十二表均为 0 行；随后只清理该空库的 `public/drizzle` schema，并从最终 tracked
0000 migration 重新建立。N1.1 的 SQLite 原库与只读 snapshot 未被读取、修改或删除。

| 阶段 | 命令 | 结果 |
|---|---|---|
| final fresh | `pnpm db:migrate` | exit 0 |
| repeat | `pnpm db:migrate` | exit 0；仅有 already exists notice |
| PG contracts | `pnpm vitest run --config vitest.pg.config.ts src/lib/db/schema.pg.test.ts src/lib/db/schema-metadata.pg.test.ts` | exit 0；2 files / 10 tests |
| runtime unit | `pnpm test -- src/lib/db/postgres-client.test.ts src/lib/db/postgres-migrator.test.ts` | exit 0；2 files / 8 tests |

Repeat 后 Drizzle journal 恰有 1 行，`pipeline_runs.trigger_run_id` 的实库
`is_nullable=YES`。

## 3. 实库 inventory

最终 `public` schema 恰有十二张业务表：

```text
ai_invocations
artifacts
canvas_edges
canvas_nodes
command_receipts
media_routes
model_routes
pipeline_runs
projects
provider_credentials
task_attempts
workspaces
```

Catalog 汇总为 12 primary keys、23 foreign keys、31 CHECK、13 UNIQUE；artifact
immutable trigger 在 information schema 中分别登记 UPDATE 与 DELETE 两个事件。

## 4. 启动与失败边界

八项 unit test 证明：

- import `client/migrate` 不连接、不迁移；
- 缺少 `DATABASE_URL` 时 fail closed；
- 并发 `getPostgresDb()` 复用同一 pending Promise/client；
- 连接失败会关闭 client、清 rejected cache，修复配置后可重试；
- 显式 migration 成功或失败都关闭专用 client，失败原样传播。

## 5. Exit gate

A02 通过：空 Postgres 可只从 tracked migration 建立十二表；repeat migration 幂等；
应用模块 import 不会自动连接、generate、push 或 migrate。
