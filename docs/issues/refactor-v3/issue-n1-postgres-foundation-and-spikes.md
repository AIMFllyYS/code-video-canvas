# Track N1 Postgres Foundation and Spikes Implementation Plan

> **For agentic workers:** 按本 Issue 的 Task 顺序逐项施工；辅助 skill 只有在用户与
> 运行环境允许时才可使用，不是完成条件。Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** 用可回滚、可对账的方式把所有活动结构化数据迁到 Postgres，并用三个真实 spike 消除 Trigger.dev、Pi terminal Tool 与 HyperFrames CLI 的集成不确定性。

**Architecture:** Postgres 成为应用唯一活动结构化数据源；SQLite 仅以只读原库、Online Backup 快照和迁移工具输入存在。仓储全部改为异步，业务表以 workspace 复合主外键隔离。`model_routes` 只服务四种 `AiTaskKind`，`media_routes` 只服务 `tts|asr`，二者共用加密的 `provider_credentials`，但媒体服务不进入 Pi Agent。N1 只建立 Trigger/HyperFrames canary，不承载正式编排；Pi 仍是唯一 Agent Runtime，普通 `openai` 仍是兼容客户端，禁止误删。

**Tech Stack:** PostgreSQL 17.5、Docker Compose、Drizzle ORM/Postgres.js、SQLite Online Backup API、Vitest、Trigger.dev 4.5.7、Pi Agent 0.81.1、HyperFrames CLI 0.7.70、TypeScript strict、PowerShell、pnpm 9

---

## 规范与施工边界

- 需求：`PROD-FOUND-001..005`、`PROD-AI-001..005`、`PROD-RUN-001..006`。
- 架构：`DATA-001..006`、`EXEC-CMD-001..004`、`EXEC-TRIGGER-001..007`、
  `CONTRACT-AI-001..007`、`TEST-001..006`、`SEC-001..003`。
- N1 不实现七任务 DAG、run API、Realtime UI、Pi 四任务合同或正式 HyperFrames
  renderer；它们分别属于 N2、N3、N4。
- 每个 Task 开始前执行 Harness Git preflight；package/lockfile 变更必须串行，
  `pnpm-lock.yaml` 只能由 pnpm 生成；每个 Task 只 stage 自己的路径并本地 commit，
  不 push。
- `.env*` 只允许服务端读取，不得 stage、回显或写入证据。Compose 中
  `cvc_dev_only` 只用于绑定 `127.0.0.1:54327` 的本地 throwaway 数据库。
- 本 Issue 的 checkbox 是实施步骤；唯一状态账本仍是
  `docs/specs/2026-07-24-refactor-v3-task-breakdown.md`。

## 固定数据边界

活动 PG schema 恰好包含以下十二张领域表：

1. `workspaces`
2. `projects`
3. `canvas_nodes`
4. `canvas_edges`
5. `pipeline_runs`
6. `task_attempts`
7. `artifacts`
8. `command_receipts`
9. `model_routes`
10. `media_routes`
11. `provider_credentials`
12. `ai_invocations`

禁止创建通用 `run_events`、继续把业务事实写入 `jobs`，或让 Trigger metadata
取代上述表。SQL 使用 `snake_case`、UUID、`timestamptz`、命名 CHECK；
workspace 业务表使用 `(workspace_id,id)` 复合 PK/FK，聚合使用
`revision bigint`。

<a id="task-n11"></a>

### Task N1.1: 对活动 WAL 数据库执行 SQLite Online Backup

**Dependencies:** 无；这是 N1 第一项，N1.2 之前必须完成并验证快照。

**Files:**

- Create: `src/lib/migration/sqlite-online-backup.ts`
- Create: `src/lib/migration/sqlite-online-backup.test.ts`
- Create: `scripts/migration/sqlite-backup.ts`
- Create: `docs/evidence/refactor-v3/n1/sqlite-backup.md`
- Create (runtime output, local evidence only): `.data/legacy-sqlite-archives/baseline-before-postgres/app.db`
- Create (runtime output, local evidence only): `.data/legacy-sqlite-archives/baseline-before-postgres/backup-report.json`
- Read-only source: `.data/app.db`
- Read-only inventory: `.data/app.db-wal`
- Read-only inventory: `.data/app.db-shm`
- Prohibited: `Copy-Item`, `copyFile`, `cp`, Explorer 复制或任何逐文件复制活动数据库
- Prohibited: 写入、checkpoint、VACUUM、迁移或删除 `.data/app.db*`
- Prohibited: `src/lib/db/schema.ts`、`src/lib/db/migrations/**`

- [ ] **Step 1: 盘点文件与持有进程，不停止服务、不复制文件**

Run:

```powershell
git status --short --branch
git diff --stat
Get-Item -LiteralPath '.data/app.db','.data/app.db-wal','.data/app.db-shm' -ErrorAction SilentlyContinue | Select-Object FullName,Length,LastWriteTimeUtc,Attributes
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'CodeVideoCanvas|next dev|next start' } | Select-Object ProcessId,Name,CommandLine
```

Expected: 输出明确记录 DB/WAL/SHM 是否存在、大小、UTC mtime 和可能持有进程；
缺少 WAL/SHM 不是失败，但不得据此假定数据库不活动。源路径必须解析为当前
workspace 下的 `.data/app.db`。

- [ ] **Step 2: 写保持 WAL writer 打开的失败测试**

`src/lib/migration/sqlite-online-backup.test.ts` 必须：

1. 在临时目录创建 SQLite fixture，执行 `journal_mode=WAL` 与
   `wal_autocheckpoint=0`；
2. 创建六张 legacy 表
   `projects/canvas_nodes/canvas_edges/jobs/artifacts/settings`；
3. 保持 writer connection 打开，提交一条只存在于 WAL 视图中的
   `projects` 记录；
4. 调用尚不存在的 `createSqliteOnlineBackup()`；
5. 断言快照 `PRAGMA quick_check` 为 `ok`、六表 counts 精确、WAL 中的记录存在；
6. 断言源 DB/WAL 的 SHA-256 在 backup 前后不变；
7. 断言目标已存在时拒绝覆盖。

Run: `pnpm test -- src/lib/migration/sqlite-online-backup.test.ts`

Expected: FAIL，错误包含
`Cannot find module './sqlite-online-backup'`。

- [ ] **Step 3: 用 `Database.backup()` 实现一致性快照**

`src/lib/migration/sqlite-online-backup.ts` 的公开合同固定为：

```ts
export const LEGACY_TABLES = [
  'projects',
  'canvas_nodes',
  'canvas_edges',
  'jobs',
  'artifacts',
  'settings',
] as const

export interface SqliteBackupReportV1 {
  schemaVersion: 1
  source: {
    db: FileInventoryV1
    wal: FileInventoryV1 | null
    shm: FileInventoryV1 | null
  }
  destination: string
  quickCheck: 'ok'
  rowCounts: Record<(typeof LEGACY_TABLES)[number], number>
  snapshotSha256: string
  backupPages: { totalPages: number; remainingPages: number }
  completedAt: string
}

export async function createSqliteOnlineBackup(
  request: { sourcePath: string; destinationPath: string }
): Promise<SqliteBackupReportV1>
```

实现必须使用：

```ts
const source = new Database(request.sourcePath, {
  readonly: true,
  fileMustExist: true,
})
const metadata = await source.backup(request.destinationPath)
```

随后关闭 source，使用新的 readonly connection 打开目标，执行
`PRAGMA quick_check` 与六条固定 `count(*)`，关闭目标后再计算快照 SHA-256。
任何检查失败立即删除未验收的目标和 report；已存在的目标永不覆盖。只有快照和
report 可写，源 DB/WAL/SHM 始终只读。验证成功后将快照设置为只读；报告路径使用
绝对规范化路径但不得含 Key。

- [ ] **Step 4: 实现固定路径 CLI，且用源码扫描阻止文件复制**

`scripts/migration/sqlite-backup.ts` 只接受：

```text
--source .data/app.db
--destination .data/legacy-sqlite-archives/baseline-before-postgres/app.db
--report .data/legacy-sqlite-archives/baseline-before-postgres/backup-report.json
```

CLI 在调用前重复打印脱敏 inventory，在成功后原子写 report，并在 Windows 对
snapshot 设置 ReadOnly attribute。不得向 stdout 打印设置值或 SQL 行内容。

Run:

```powershell
rg -n "Copy-Item|copyFile\\(|copyFileSync\\(" src/lib/migration scripts/migration
pnpm test -- src/lib/migration/sqlite-online-backup.test.ts
```

Expected: 第一条无匹配且退出 1；测试 GREEN，并证明未 checkpoint 活动 WAL
也能进入快照。

- [ ] **Step 5: 生成真实基线备份并独立复核**

Run:

```powershell
pnpm tsx scripts/migration/sqlite-backup.ts --source .data/app.db --destination .data/legacy-sqlite-archives/baseline-before-postgres/app.db --report .data/legacy-sqlite-archives/baseline-before-postgres/backup-report.json
Get-Content -LiteralPath '.data/legacy-sqlite-archives/baseline-before-postgres/backup-report.json' -Encoding utf8
Get-FileHash -Algorithm SHA256 -LiteralPath '.data/legacy-sqlite-archives/baseline-before-postgres/app.db'
Get-Item -LiteralPath '.data/legacy-sqlite-archives/baseline-before-postgres/app.db' | Select-Object FullName,Length,LastWriteTimeUtc,Attributes
```

Expected: report 的 `quickCheck` 为 `ok`，六个 count 均为非负整数，report
SHA 与 `Get-FileHash` 一致，快照 Attributes 包含 `ReadOnly`；源文件仍存在且未被
脚本写入。若 `.data/app.db` 不存在，任务以“无可迁移数据”的明确证据阻塞，不得
创建空库冒充快照。将脱敏摘要写入
`docs/evidence/refactor-v3/n1/sqlite-backup.md`，只记录相对路径、inventory、
quick_check、六表 count、源文件前后 hash、快照 hash、命令退出码和
fixture/live 边界；禁止绝对路径、SQL 行内容、setting 值或 secret。

- [ ] **Step 6: Task-Light 检查并本地提交源码**

Run:

```powershell
pnpm eslint src/lib/migration/sqlite-online-backup.ts src/lib/migration/sqlite-online-backup.test.ts scripts/migration/sqlite-backup.ts
pnpm typecheck
git diff --check
git add -- src/lib/migration/sqlite-online-backup.ts src/lib/migration/sqlite-online-backup.test.ts scripts/migration/sqlite-backup.ts docs/evidence/refactor-v3/n1/sqlite-backup.md
git diff --cached --check
git commit -m "chore(migration): add WAL-safe SQLite backup"
```

Expected: lint/typecheck/diff 通过；`.data/**` 不在 staged diff；commit 只含三个
源码文件和一份脱敏 evidence。

**N1.1 exit gate:** 活动 WAL 上的 Online Backup 测试与真实 `.data/app.db`
快照均通过 quick_check、六表计数与 SHA 验证；未使用 `Copy-Item`；源数据库未被
迁移工具写入；只读快照可用于 N1.4。

<a id="task-n12"></a>

### Task N1.2: 建立 Postgres、十二表 Drizzle schema 与受审 migration

**Dependencies:** N1.1。

**Files:**

- Create: `docker-compose.dev.yml`
- Create: `scripts/setup/postgres-init.sql`
- Create: `src/lib/db/schema/core.ts`
- Create: `src/lib/db/schema/canvas.ts`
- Create: `src/lib/db/schema/execution.ts`
- Create: `src/lib/db/schema/artifacts.ts`
- Create: `src/lib/db/schema/ai.ts`
- Create: `src/lib/db/schema/index.ts`
- Create: `src/lib/db/test/pg-test-database.ts`
- Create: `src/lib/db/schema.pg.test.ts`
- Create: `src/lib/db/schema-metadata.pg.test.ts`
- Create: `src/lib/db/postgres-client.test.ts`
- Create: `src/lib/db/postgres-migrator.test.ts`
- Create: `vitest.pg.config.ts`
- Create: `docs/evidence/refactor-v3/n1/postgres-health.md`
- Create: `docs/evidence/refactor-v3/n1/fresh-migration.md`
- Create: `docs/evidence/refactor-v3/n1/constraint-matrix.md`
- Create (generated and reviewed): `src/lib/db/migrations/pg/0000_v3_postgres_foundation.sql`
- Create (generated): `src/lib/db/migrations/pg/meta/_journal.json`
- Create (generated): `src/lib/db/migrations/pg/meta/0000_snapshot.json`
- Modify: `drizzle.config.ts`
- Modify: `src/lib/db/client.ts`
- Modify: `src/lib/db/index.ts`
- Modify: `src/lib/db/migrate.ts`
- Modify: `scripts/setup/db-migrate.ts`
- Modify: `vitest.config.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`（只能由 pnpm 生成）
- Read-only legacy schema: `src/lib/db/schema.ts`
- Read-only legacy migrations: `src/lib/db/migrations/0000_gray_captain_cross.sql`
- Read-only legacy migrations: `src/lib/db/migrations/0001_friendly_calypso.sql`
- Read-only legacy migrations: `src/lib/db/migrations/0002_solid_prism.sql`
- Read-only legacy migrations: `src/lib/db/migrations/0003_wild_black_tarantula.sql`
- Prohibited: app/worker import 时自动 migrate、`drizzle-kit push`、`run_events`
- Prohibited: plaintext credential 列、`model_routes` 中的 Key、`media_routes` 中的 Key

**N1.2 → N1.3 可编译迁移边界（DOC-CONFLICT 修订）：**

当前 20 余个生产 caller 同步消费 legacy `getDb()`，另有 15 个测试直接消费
`createDb()`；这些 caller 的 async PG cutover 归 N1.3。若 N1.2 直接把同名 API
替换为 Promise 并删除 legacy exports，全仓 typecheck 必然失败；不得用交叉类型、
伪同步 thenable、跳过 TypeScript 文件或提前吞并 N1.3 掩盖冲突。

因此 N1.2 只新增明确命名的 `getPostgresDb(): Promise<PostgresDb>` 与
`migratePostgres()`，并保持现有 `getDb()/Db/createDb()/runMigrations()` 及 legacy
barrel export 冻结不变，直到 N1.3 完成 caller cutover。新 PG schema、test helper、
migrator 与 application code 禁止调用 legacy API。N1.3 负责把
`getPostgresDb()` 收口为正式 `getDb()` 并删除 legacy runtime export；N1.6 删除
仅供冻结测试/迁移使用的 legacy schema、migration 与 driver 依赖。这是有删除期限的
迁移桥，不是第二套长期数据模型。

- [ ] **Step 1: 串行安装精确 Postgres driver**

Run:

```powershell
pnpm add --save-exact postgres@3.4.9
pnpm why postgres
git diff -- package.json pnpm-lock.yaml
```

Expected: `postgres` 只出现一次且精确为 `3.4.9`；普通 `openai` 与两个 Pi 包都仍
存在；lockfile 只由 pnpm 改写。

- [ ] **Step 2: 写 schema 与不可变 artifact 的失败 PG 测试**

`src/lib/db/schema.pg.test.ts` 至少覆盖：

- fresh migration 后恰有本节列出的十二张领域表；
- `canvas_nodes` 的 `(workspace_id,project_id,logical_key)` 唯一；
- edge 的 source/target 复合 FK 均包含 workspace/project；
- node/run/attempt/artifact lifecycle 均由命名 CHECK 拒绝非法值；
- `task_attempts` 的 `(workspace_id,run_id,task_id,entity_type,entity_id,attempt_no)`
  唯一，`attempt_no > 0`；
- `artifacts` 的
  `(workspace_id,aggregate_type,aggregate_id,kind,version)` 唯一；
- `approved`/`released` artifact 的 UPDATE 与 DELETE 被 DB trigger 拒绝；
- `(workspace_id,idempotency_key)` receipt 唯一；
- `model_routes` 只接受四种
  `project-plan|shot-spec|fabricate|vision-qa`；
- `media_routes` 只接受 `tts|asr`，且
  `(workspace_id,media_task_kind)` 唯一；
- 两种 route 都没有 secret/ciphertext 列；credential 只落共享
  `provider_credentials`；
- project/receipt status、node type/stage 与 route revision 的 named CHECK；
- 所有业务时间列均为 `timestamp with time zone`；
- `ai_invocations` 每个 provider round 一行，initial/repair 的组合 unique；
- route 列 inventory 不含 `secret/key/ciphertext/nonce/auth_tag`，credential 列
  inventory 不含 plaintext secret。
- `postgres-client.test.ts` 证明模块 import 不连接/迁移、并发调用复用 pending
  Promise、rejected cache 被清除、失败 client 被关闭且修复配置后可重试；
- `postgres-migrator.test.ts` 证明缺 URL fail closed，migration 成功或失败都关闭
  专用 client，且 migration 只能由显式调用触发。

Run:

```powershell
docker compose -f docker-compose.dev.yml config
pnpm vitest run --config vitest.pg.config.ts src/lib/db/schema.pg.test.ts src/lib/db/schema-metadata.pg.test.ts
pnpm test -- src/lib/db/postgres-client.test.ts src/lib/db/postgres-migrator.test.ts
```

Expected: 第一条在 compose 尚不存在时、第二条因测试 helper/schema 不存在或两项
unit test 因 PG client/migrator 行为尚未实现而 FAIL；不得先手工建表让测试假绿。

- [ ] **Step 3: 建本地 Postgres Compose 与独立测试数据库**

`docker-compose.dev.yml` 固定：

- image `postgres:17.5-alpine`；
- service 名 `postgres`；
- host 仅 `127.0.0.1:54327:5432`；
- volume `cvc_postgres_dev:/var/lib/postgresql/data`；
- bind mount
  `./scripts/setup/postgres-init.sql:/docker-entrypoint-initdb.d/001-create-test-db.sql:ro`；
- dev DB `cvc`、user `cvc`、本地 throwaway password `cvc_dev_only`；
- healthcheck 使用 `pg_isready -U cvc -d cvc`；
- `scripts/setup/postgres-init.sql` 只创建 owner 为 `cvc` 的 `cvc_test`。

`src/lib/db/test/pg-test-database.ts` 每个测试 suite 使用 advisory lock，清空
`public` schema 后应用已提交 migration；禁止并行 suite 共享脏状态。
`vitest.config.ts` 明确 exclude `**/*.pg.test.ts`，`vitest.pg.config.ts` 只 include
`src/**/*.pg.test.ts` 并串行执行，避免普通 `pnpm test` 在没有 PG 时误跑集成测试。

Run:

```powershell
docker compose -f docker-compose.dev.yml up -d --wait postgres
docker compose -f docker-compose.dev.yml ps
```

Expected: `postgres` 为 healthy；端口没有暴露到非 loopback 地址。
将 image/version、绑定地址、healthcheck 与脱敏 `docker compose ps` 摘要写入
`docs/evidence/refactor-v3/n1/postgres-health.md`；禁止容器环境变量或 credential。

- [ ] **Step 4: 实现十二表 schema 与异步 client/migrator**

schema 分工固定：

- `core.ts`: `workspaces`, `projects`；
- `canvas.ts`: `canvas_nodes`, `canvas_edges`；
- `execution.ts`: `pipeline_runs`, `task_attempts`, `command_receipts`；
- `artifacts.ts`: `artifacts`；
- `ai.ts`: `model_routes`, `media_routes`, `provider_credentials`,
  `ai_invocations`；
- `index.ts`: 只做命名 re-export 和关系汇总。

状态集合固定：

```ts
export const NODE_STATUSES = [
  'idle', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'stale',
] as const
export const RUN_STATUSES = [
  'triggering', 'queued', 'running', 'succeeded', 'failed', 'cancelled',
] as const
export const ATTEMPT_STATUSES = [
  'queued', 'running', 'succeeded', 'failed', 'cancelled', 'superseded',
] as const
export const ARTIFACT_LIFECYCLES = [
  'draft', 'approved', 'released', 'rejected',
] as const
export const PROJECT_STATUSES = ['active', 'archived'] as const
export const COMMAND_RECEIPT_STATUSES = [
  'pending', 'succeeded', 'failed',
] as const
export const CANVAS_NODE_TYPES = [
  'script-import', 'shot-split', 'score', 'export',
  'shot-script', 'shot-codegen', 'shot-sfx', 'shot-subtitle', 'shot-qa',
] as const
export const CANVAS_NODE_STAGES = [
  'INGEST', 'DIRECT', 'SHOT_SPEC', 'FABRICATE', 'ASSEMBLE', 'FINALIZE',
] as const
export const AI_INVOCATION_STATUSES = [
  'running', 'succeeded', 'failed', 'cancelled',
] as const
```

所有时间列为 `timestamp with time zone`，JSON 只用于显式 versioned
payload/checkpoint/metadata。`artifacts.content_hash` 是实体字节 SHA-256；
`storage_key` 可存 StorageAdapter key，但任何 API/UI 不得返回它。`projects` 保留
versioned `export_settings` 与 `autopilot`；`canvas_nodes` 用数值坐标列并要求
versioned `data`，type/stage 必须命中上述集合。`artifacts.project_id` 是必需的
workspace-scoped project FK；polymorphic aggregate 不替代 project 归属。
`provider_credentials` 使用 `(workspace_id,provider)` 唯一，至少含
`envelope_version/ciphertext bytea/nonce bytea/auth_tag bytea/key_version/
verified_at/created_at/updated_at`；nonce 固定 12 bytes、auth tag 固定 16 bytes。
AI 和 media route 只存 provider/model/revision。所有 `revision` 为非负 bigint。
`ai_invocations` 每个真实 provider round 一行；同一 task attempt 的
`invocation_no` 标识逻辑 invocation，`repair_no=0` 是初始 round、`1..2` 是内容
修复，唯一键固定为
`(workspace_id,attempt_id,invocation_no,repair_no)`。

N1.6 删除同名 legacy `src/lib/db/schema.ts` 前，所有新 PG import 必须显式写
`@/lib/db/schema/index`，不得使用会被旧文件优先解析的裸
`@/lib/db/schema`；Drizzle config 也显式指向
`./src/lib/db/schema/index.ts`。

`src/lib/db/client.ts` 新增并缓存 `Promise<PostgresDb>` 与底层 Postgres.js
client；缺少 `DATABASE_URL` 时在首次 `await getPostgresDb()` 明确失败，模块
import 不连库、不迁移。初始化失败必须清除 rejected cache 并关闭已创建 client，
允许修复配置后重试。legacy 同步 `getDb()` 暂时冻结，不得被新 PG 代码调用。

`src/lib/db/migrate.ts` 新增显式 `migratePostgres()`；只有
`scripts/setup/db-migrate.ts` 调用该 PG migrator。legacy `createDb()` 与
`runMigrations()` 只为尚属 N1.3/N1.6 的旧 caller/test 保留，不得进入任何新 PG
import graph。
`package.json` 新增
`"test:pg": "vitest run --config vitest.pg.config.ts"`；`db:generate` 仍是显式
开发命令，不得挂到 `dev/start/build`。

- [ ] **Step 5: 生成、审阅并补齐 DB trigger migration**

Run:

```powershell
$env:DATABASE_URL='postgresql://cvc:cvc_dev_only@127.0.0.1:54327/cvc'
pnpm exec drizzle-kit generate --name v3_postgres_foundation
rg -n "CREATE TABLE|CONSTRAINT|FOREIGN KEY|CREATE TRIGGER|approved|released|media_routes" src/lib/db/migrations/pg/0000_v3_postgres_foundation.sql
```

Expected: 生成 `0000_v3_postgres_foundation.sql` 与两个 meta 文件；执行者逐段审阅
十二表、复合 FK、命名 CHECK、unique，并在该 SQL 末尾加入
`BEFORE UPDATE OR DELETE` trigger function，阻止 `OLD.lifecycle IN
('approved','released')`。禁止手改 meta JSON。

- [ ] **Step 6: 运行 fresh migration GREEN**

Run:

```powershell
$env:DATABASE_URL='postgresql://cvc:cvc_dev_only@127.0.0.1:54327/cvc'
$env:TEST_DATABASE_URL='postgresql://cvc:cvc_dev_only@127.0.0.1:54327/cvc_test'
pnpm db:migrate
pnpm vitest run --config vitest.pg.config.ts src/lib/db/schema.pg.test.ts src/lib/db/schema-metadata.pg.test.ts
pnpm test -- src/lib/db/postgres-client.test.ts src/lib/db/postgres-migrator.test.ts
pnpm typecheck
```

Expected: 空 `cvc` 与每次重建的 `cvc_test` 都从已提交 SQL migration 成功建立；
全部 PG contract 测试 GREEN；重复 `pnpm db:migrate` 为幂等；应用 import 不会自动
改 schema。将 fresh/repeat migration 的命令、exit code、十二表 inventory 写入
`docs/evidence/refactor-v3/n1/fresh-migration.md`，将 workspace 复合 FK、命名
CHECK、unique 与 artifact immutable trigger 的测试矩阵写入
`docs/evidence/refactor-v3/n1/constraint-matrix.md`；两份证据都不得包含连接串。
N1.2 的全仓 `pnpm typecheck` 必须通过；PG schema、helper、migrator 只能 import
`@/lib/db/schema/index`。不得修改 N1.3 caller、构造同步 Promise facade 或放宽
tsconfig 取得假绿。

- [ ] **Step 7: Task-Light 检查并本地提交**

Run:

```powershell
pnpm eslint drizzle.config.ts src/lib/db scripts/setup/db-migrate.ts
git diff --check
git add -- docker-compose.dev.yml scripts/setup/postgres-init.sql drizzle.config.ts src/lib/db/schema src/lib/db/test/pg-test-database.ts src/lib/db/schema.pg.test.ts src/lib/db/schema-metadata.pg.test.ts src/lib/db/postgres-client.test.ts src/lib/db/postgres-migrator.test.ts src/lib/db/client.ts src/lib/db/index.ts src/lib/db/migrate.ts src/lib/db/migrations/pg scripts/setup/db-migrate.ts vitest.config.ts vitest.pg.config.ts package.json pnpm-lock.yaml docs/evidence/refactor-v3/n1/postgres-health.md docs/evidence/refactor-v3/n1/fresh-migration.md docs/evidence/refactor-v3/n1/constraint-matrix.md
git diff --cached --check
git commit -m "feat(db): establish Postgres v3 schema"
```

Expected: lint/typecheck/diff 通过；staged SQL 与 Drizzle schema 一致；没有
`.env*`、`.data/**`、连接串或 legacy SQLite 文件；三份脱敏 evidence 与源码一并
提交。

**N1.2 exit gate:** fresh Postgres 可仅从受审 migration 建立十二表；workspace
复合隔离、状态 CHECK、attempt/receipt unique、artifact 不可变 trigger 均由 PG
测试证明；AI/media routes 分离且共享 credential store；新 PG client 与 app/worker
import 不自动连接或迁移。冻结的 legacy SQLite caller 仍由 N1.3/N1.6 清退，N1.2
不得把该过渡边界误报为 Track N1 的 runtime SQLite zero-import 已完成。

<a id="task-n13"></a>

### Task N1.3: 把 runtime repository 全部切成异步 Postgres

**Dependencies:** N1.2。

**Files:**

- Create: `src/lib/db/transaction.ts`
- Create: `src/lib/migration/legacy-sqlite-test-database.ts`
- Create: `src/features/credentials/provider-credential-store.ts`
- Create: `src/features/credentials/provider-credential-store.pg.test.ts`
- Create: `src/features/routing/model-route-repository.ts`
- Create: `src/features/routing/model-route-repository.pg.test.ts`
- Create: `src/features/routing/media-route-repository.ts`
- Create: `src/features/routing/media-route-repository.pg.test.ts`
- Create: `src/features/artifacts/commit.ts`
- Create: `src/features/credentials/credential-envelope.ts`
- Create: `src/features/credentials/credential-envelope.test.ts`
- Create: `src/features/credentials/index.ts`
- Create: `src/features/routing/index.ts`
- Create: `src/features/director/advance-repository.ts`
- Create: `src/features/director/runtime-artifact-reader.ts`
- Create: `src/features/director/runtime-artifact-source.ts`
- Create: `src/features/director/runtime-artifact-writer.ts`
- Create: `src/features/director/runtime-node-data.ts`
- Create: `src/features/render/persistence.ts`
- Create: `src/features/render/render-artifact-repository.ts`
- Create: `src/features/render/render.pg-fixture.ts`
- Create: `src/lib/queue/in-process-queue.pg.test.ts`
- Create: `src/features/canvas/actions.pg.test.ts`
- Create: `src/features/canvas/contracts.ts`
- Create: `src/features/canvas/fan-out.pg.test.ts`
- Create: `src/features/canvas/queries.pg.test.ts`
- Create: `src/features/canvas/status.pg.test.ts`
- Create: `src/features/director/runtime-repository.pg.test.ts`
- Create: `src/features/render/cache.pg.test.ts`
- Create: `src/features/render/repository.pg.test.ts`
- Create: `src/features/render/thumbnail.integration.pg.test.ts`
- Delete: `src/features/canvas/actions.test.ts`
- Delete: `src/features/canvas/fan-out.test.ts`
- Delete: `src/features/canvas/queries.test.ts`
- Delete: `src/features/canvas/status.test.ts`
- Delete: `src/features/director/runtime-repository.test.ts`
- Delete: `src/features/render/cache.test.ts`
- Delete: `src/features/render/repository.test.ts`
- Delete: `src/features/render/thumbnail.integration.test.ts`
- Modify: `src/lib/db/client.ts`
- Modify: `src/lib/db/index.ts`
- Modify: `src/lib/db/migrate.ts`
- Modify: `src/lib/db/schema.test.ts`
- Modify: `src/features/canvas/actions.ts`
- Modify: `src/features/canvas/fan-out.ts`
- Modify: `src/features/canvas/queries.ts`
- Modify: `src/features/canvas/status.ts`
- Modify: `src/features/canvas/index.ts`
- Modify: `src/features/ai/config.ts`
- Modify: `src/features/ai/config.test.ts`
- Modify: `src/features/ai/gemini-adapter.test.ts`
- Modify: `src/features/ai/gemini-config.test.ts`
- Modify: `src/features/ai/model-routing.test.ts`
- Modify: `src/features/ai/stepfun-adapter.test.ts`
- Modify: `src/features/artifacts/service.ts`
- Modify: `src/features/artifacts/index.ts`
- Modify: `src/features/audio/repository.ts`
- Modify: `src/features/audio/repository.test.ts`
- Modify: `src/features/audio/runtime-repository.ts`
- Modify: `src/features/audio/runtime-repository.test.ts`
- Modify: `src/features/audio/index.ts`
- Modify: `src/features/director/advance.ts`
- Modify: `src/features/director/advance.test.ts`
- Modify: `src/features/director/fabricate.ts`
- Modify: `src/features/director/queue-handler.ts`
- Modify: `src/features/director/queue-handler.test.ts`
- Modify: `src/features/director/runtime-repository.ts`
- Modify: `src/features/director/stage-effects.ts`
- Modify: `src/features/director/stage-effects.test.ts`
- Modify: `src/features/director/stage-runner.ts`
- Modify: `src/features/director/stage-runner.test.ts`
- Modify: `src/features/director/tools/write-artifact.ts`
- Modify: `src/features/director/tools/write-artifact.test.ts`
- Modify: `src/features/render/cache.ts`
- Modify: `src/features/render/concat.ts`
- Modify: `src/features/render/render-shot-repository.ts`
- Modify: `src/features/render/repository.ts`
- Modify: `src/features/render/vision-qa.ts`
- Modify: `src/features/render/vision-qa.test.ts`
- Modify: `src/lib/queue/in-process-queue.ts`
- Modify: `src/lib/queue/query.ts`
- Modify: `src/lib/queue/init.test.ts`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/projects/page.tsx`
- Modify: `src/app/(app)/canvas/page.tsx`
- Modify: `src/app/(app)/canvas/export/page.tsx`
- Modify: `src/app/(app)/canvas/shot/[id]/page.tsx`
- Modify: `src/app/(app)/settings/page.tsx`
- Modify: `src/app/api/artifacts/[id]/route.ts`
- Modify: `src/app/api/artifacts/[id]/route.test.ts`
- Modify: `src/app/api/projects/route.ts`
- Modify: `src/app/api/projects/route.test.ts`
- Modify: `src/app/api/projects/[id]/route.ts`
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/app/api/settings/route.test.ts`
- Modify: `src/app/api/director/pipeline/route.ts`
- Modify: `src/app/api/director/pipeline/route.test.ts`
- Modify: `src/app/api/director/stage/route.ts`
- Modify: `src/app/api/director/stage/route.test.ts`
- Modify: `src/app/api/director/stream/[nodeId]/route.ts`
- Modify: `src/app/api/director/stream/[nodeId]/route.test.ts`
- Modify: `src/app/api/jobs/[id]/route.ts`
- Modify: `src/app/api/jobs/[id]/route.test.ts`
- Modify: `src/app/api/render/route.ts`
- Modify: `src/app/api/render/route.test.ts`
- Modify: `src/app/api/render/export/route.ts`
- Modify: `src/app/api/render/export/route.test.ts`
- Modify: `src/app/api/render/thumbnails/route.ts`
- Prohibited: `better-sqlite3` import outside `src/lib/migration/**` and `scripts/migration/**`
- Prohibited: network/API call while a PG transaction is open
- Prohibited: plaintext credential fallback、客户端 import credential store、同步 `.get/.all/.run`

N1.3 开工时必须重新枚举所有 import
`@/lib/db/client|migrate|schema`、`@/lib/db` barrel 的 tracked caller；实际 caller
清单优先于本节静态列表。所有受 `getDb` async cutover 直接影响的源码与测试都属于
N1.3 允许修改范围，但只能修改 DB 调用/类型/fixture，不得顺带改变非 DB 行为。
完成 caller cutover 后把 `getPostgresDb()` 收口为正式 async `getDb()`，并从 runtime
barrel 删除 legacy schema/client export。legacy `createDb()` 只迁到
`src/lib/migration/legacy-sqlite-test-database.ts` 供即将在 N1.6 删除的
`schema.test.ts` 使用；`src/lib/db/migrate.ts` 在 N1.3 收口为纯 PG migrator，
不得继续 import SQLite。

上述 PG 测试文件替换同名 SQLite 测试，确保常规 `pnpm test` 不依赖本地
`TEST_DATABASE_URL`，而真实数据库合同只由 `vitest.pg.config.ts` 运行。Director 与
Render 新文件是为满足生产文件 350 行硬上限而按 repository、artifact persistence
与 test fixture 职责拆分；它们不得引入第二套状态或平行 artifact commit 实现。
因异步合同传播而新增的跨域调用必须同步补到各 feature 根 `index.ts`，调用方只改
import 路径，禁止继续 deep import 其他域的 types、status、fan-out 或 repository。

- [ ] **Step 1: 写 async/transaction/credential 的失败测试**

新增或改写测试，至少证明：

- repository 方法返回 Promise，caller 必须 `await`；
- project + 四全局节点仍在同一事务；fan-out 全成功或全回滚；
- node/edge 查询始终带 workspace；
- artifact row 与业务引用在同一事务提交；
- module import 与 repository constructor 不打开 DB；
- 缺少 `CVC_CREDENTIAL_MASTER_KEY` 时保存 credential 明确失败；
- AES-256-GCM round-trip 后数据库只含 versioned ciphertext、IV、auth tag，
  不含原文；
- API view 只返回 `configured/verifiedAt/updatedAt`；
- AI route 只接受四种 `AiTaskKind`；media route 只接受 `tts|asr`；
- 两种 route 都从同一个 `ProviderCredentialStore` 解析 provider credential。

Run:

```powershell
pnpm vitest run --config vitest.pg.config.ts src/features/canvas/actions.pg.test.ts src/features/canvas/fan-out.pg.test.ts
pnpm vitest run --config vitest.pg.config.ts src/features/credentials/provider-credential-store.pg.test.ts src/features/routing/model-route-repository.pg.test.ts src/features/routing/media-route-repository.pg.test.ts
```

Expected: 因同步 SQLite repository、缺失 credential/route 实现或未 await 而 RED。

- [ ] **Step 2: 定义异步 repository 与 transaction 边界**

`src/lib/db/transaction.ts` 只暴露 `withTransaction()` 和
`TransactionContext`，由 application service 传入 repository；repository 不得在
领域方法内部偷偷新开跨步骤 transaction。所有原 `.get/.all/.run` 改为
`await db.select/insert/update/delete`，并检查 affected row count。

`ProviderCredentialStore` 公开合同固定为：

```ts
export interface ProviderCredentialStore {
  save(input: {
    workspaceId: string
    provider: string
    secret: string
    verifiedAt: Date
  }): Promise<void>
  loadSecret(workspaceId: string, provider: string): Promise<string | null>
  describe(workspaceId: string, provider: string): Promise<{
    configured: boolean
    verifiedAt: string | null
    updatedAt: string | null
  }>
}
```

本地实现从服务端 `CVC_CREDENTIAL_MASTER_KEY` 解码 32-byte master key，使用随机
96-bit IV 的 AES-256-GCM，并把 envelope 版本和 key version 一起认证。缺 key、
长度错误或 auth tag 错误都 fail closed；不读 `NEXT_PUBLIC_*`，不记录 secret。

- [ ] **Step 3: 逐域迁移并保持旧 API 行为**

按以下顺序逐批改成 async PG，并在每批后跑同域测试：

1. canvas project/node/edge/actions/status；
2. artifact 与 audio repositories；
3. AI settings 读写改为 shared credential + route repositories；
4. Director runtime repository/effects；
5. render cache/repository/vision QA；
6. N2 删除前仍需工作的 legacy in-process queue 的 job 访问改为 PG
   `task_attempts/pipeline_runs` 兼容适配，不重新创建 `jobs` 表。

每个 `projectId/nodeId/artifactId` 查询同时携带可信 `workspaceId`。旧 API 未提供
workspace 的 server entry 只能注入本地 workspace 常量
`00000000-0000-4000-8000-000000000001`，不得由客户端猜；N2 API 会把它提升为
显式上下文。

- [ ] **Step 4: 运行领域 GREEN 与 SQLite runtime import 门禁**

Run:

```powershell
$env:TEST_DATABASE_URL='postgresql://cvc:cvc_dev_only@127.0.0.1:54327/cvc_test'
pnpm vitest run --config vitest.pg.config.ts
pnpm test
rg -n "better-sqlite3|sqlite-core|\\.get\\(|\\.all\\(|\\.run\\(" src --glob '!src/lib/migration/**' --glob '!src/lib/db/schema.ts' --glob '!src/lib/db/schema.test.ts'
pnpm typecheck
```

Expected: PG 与常规测试 GREEN；`better-sqlite3|sqlite-core` 只剩 N1.6 将删除的
两个 frozen legacy schema 文件，任何 runtime import graph 都不再引用它们；
方法名扫描只允许与数据库无关且经人工列明的普通对象方法，不能存在 Drizzle
SQLite 同步调用；typecheck 0。

- [ ] **Step 5: Task-Light 检查并本地提交**

Run:

```powershell
pnpm lint
git diff --check
git add -- src/lib/db/client.ts src/lib/db/index.ts src/lib/db/migrate.ts src/lib/db/schema.test.ts src/lib/db/transaction.ts src/lib/migration/legacy-sqlite-test-database.ts src/features/credentials src/features/routing src/features/canvas src/features/ai/config.ts src/features/ai/config.test.ts src/features/ai/gemini-adapter.test.ts src/features/ai/gemini-config.test.ts src/features/ai/model-routing.test.ts src/features/ai/stepfun-adapter.test.ts src/features/artifacts/service.ts src/features/audio src/features/director src/features/render src/lib/queue/in-process-queue.ts src/lib/queue/query.ts
git add -- "src/app/(app)/page.tsx" "src/app/(app)/projects/page.tsx" "src/app/(app)/canvas/page.tsx" "src/app/(app)/canvas/export/page.tsx" ':(literal)src/app/(app)/canvas/shot/[id]/page.tsx' "src/app/(app)/settings/page.tsx"
git add -- ':(literal)src/app/api/artifacts/[id]/route.ts' ':(literal)src/app/api/artifacts/[id]/route.test.ts' src/app/api/projects/route.ts src/app/api/projects/route.test.ts ':(literal)src/app/api/projects/[id]/route.ts' src/app/api/settings/route.ts src/app/api/settings/route.test.ts
git add -- src/app/api/director/pipeline/route.ts src/app/api/director/pipeline/route.test.ts src/app/api/director/stage/route.ts src/app/api/director/stage/route.test.ts ':(literal)src/app/api/director/stream/[nodeId]/route.ts' ':(literal)src/app/api/director/stream/[nodeId]/route.test.ts' ':(literal)src/app/api/jobs/[id]/route.ts' ':(literal)src/app/api/jobs/[id]/route.test.ts'
git add -- src/app/api/render/route.ts src/app/api/render/route.test.ts src/app/api/render/export/route.ts src/app/api/render/export/route.test.ts src/app/api/render/thumbnails/route.ts src/lib/queue/init.test.ts
git diff --cached --check
git commit -m "refactor(db): make domain repositories async Postgres"
```

Expected: Tier-light checks通过；commit 不含 N1.1 backup、`.env*`、ordinary
`openai` 删除或 N2 Trigger DAG。

**N1.3 exit gate:** 所有活动 repository/query 均异步访问 PG，模块 import 不连库；
跨聚合事务保持原子；workspace 隔离贯穿查询；credential 认证加密且 AI/media
共享 store；runtime 无 SQLite driver/schema import。

<a id="task-n14"></a>

### Task N1.4: 导出 SQLite、导入 PG 并逐行对账

**Dependencies:** N1.1、N1.2、N1.3。

**Files:**

- Create: `src/lib/migration/legacy-export.ts`
- Create: `src/lib/migration/legacy-export-contracts.ts`
- Create: `src/lib/migration/legacy-export-validation.ts`
- Create: `src/lib/migration/legacy-export-routes.ts`
- Create: `src/lib/migration/legacy-export-artifacts.ts`
- Create: `src/lib/migration/legacy-export.test.ts`
- Create: `src/lib/migration/legacy-import.ts`
- Create: `src/lib/migration/legacy-import-contracts.ts`
- Create: `src/lib/migration/legacy-import-plan.ts`
- Create: `src/lib/migration/legacy-import-target-verifier.ts`
- Create: `src/lib/migration/legacy-import.pg.test.ts`
- Create: `src/lib/migration/legacy-reconcile.ts`
- Create: `src/lib/migration/legacy-reconcile.pg.test.ts`
- Create: `src/lib/migration/legacy-id.ts`
- Create: `src/lib/migration/legacy-id.test.ts`
- Create: `scripts/migration/export-sqlite.ts`
- Create: `scripts/migration/import-postgres.ts`
- Create: `scripts/migration/reconcile-postgres.ts`
- Create: `scripts/migration/provision-master-key.ts`
- Create: `docs/evidence/refactor-v3/n1/import-reconciliation.md`
- Create (generated): `src/lib/db/migrations/pg/0001_*.sql`
- Create (generated): `src/lib/db/migrations/pg/meta/0001_snapshot.json`
- Modify (generated): `src/lib/db/migrations/pg/meta/_journal.json`
- Modify: `src/lib/db/schema/ai.ts`
- Modify: `src/features/credentials/provider-credential-store.ts`
- Modify: `src/features/credentials/provider-credential-store.pg.test.ts`
- Create (runtime output, local evidence only): `.data/legacy-sqlite-archives/baseline-before-postgres/export/manifest.json`
- Create (runtime output, local evidence only): `.data/legacy-sqlite-archives/baseline-before-postgres/export/*.jsonl`
- Create (runtime output, local evidence only): `.data/legacy-sqlite-archives/baseline-before-postgres/reconciliation.json`
- Read-only source: `.data/legacy-sqlite-archives/baseline-before-postgres/app.db`
- Read-only artifact root: `.data/artifacts/**`
- Prohibited: 写入/改权限/迁移只读 snapshot 与原 `.data/app.db*`
- Prohibited: 在 JSONL、stdout、日志或 reconciliation 中出现 credential 明文
- Prohibited: 把 legacy absolute path 暴露给 API/UI

为满足生产文件硬上限，上述 split 必须按真实职责落地：
`legacy-export-contracts.ts` 只含版本合同、固定常量、canonical hash 与严格 reader；
`legacy-export-validation.ts` 只含 exact manifest/JSONL shape、disposition/inventory
关联验证；
`legacy-export-routes.ts` 只含 setting 分类、credential envelope 与冻结 route；
`legacy-export-artifacts.ts` 只含 artifact 安全相对 key、实体 inventory/hash；
`legacy-import-contracts.ts` 只含 import/account/plan 合同与 snapshot/JSONL verified loader；
`legacy-import-plan.ts` 只做无 PG 副作用的 validated bundle → project/global 导入规划。
`legacy-import-target-verifier.ts` 只把 expected import plan 与 PG canonical target
投影逐项比较，供 conflict/resume 与 reconciliation 共用。
`legacy-export.ts` 保留只读 SQLite 采集/原子写入，`legacy-import.ts` 保留 receipt 与
PG transaction；允许它们从真实实现入口 re-export 公共合同，但禁止空 re-export
壳、重复状态模型或循环依赖。每个生产文件仍须 ≤350 行、函数 ≤50 行。

Legacy → v3 映射固定如下，importer 不得临场猜测：

| Legacy source | v3 target/default | 无法映射时 |
|---|---|---|
| project | `status=active`、`revision=0`；`workflow_version` 取 export manifest 冻结值；`export_settings` 包为 `{schemaVersion:1,settings}`，autopilot 原样转 boolean | 非法时间/JSON → `invalid-project` |
| node type/status | type 仅九种固定值；status 为 `idle→idle`、`pending→queued`、`running→running`、`success→succeeded`、`failed→failed`、`stale→stale` | `unsupported-node-type|invalid-node-status` |
| node stage | 忽略 legacy nullable stage；按 `script-import→INGEST`、`shot-split→DIRECT`、`shot-script→SHOT_SPEC`、`shot-codegen→FABRICATE`、`shot-sfx/shot-subtitle/score→ASSEMBLE`、`shot-qa/export→FINALIZE` | shot lane 缺 lane key → `missing-lane-key` |
| node identity/data | global logical key=`global:<type>`；shot logical key=`shot:<laneKey>:<type>`；坐标转数值列；data 包为 `{schemaVersion:1,payload,migration:{legacyStage}}`；`revision=0` | 非法坐标/JSON → `invalid-node-data` |
| edge | project/source/target 均先 UUIDv5 映射，再验证同 workspace/project endpoint | `missing-source|missing-target|cross-project-endpoint` |
| setting credential | `stepfun_api_key|gemini_api_key` 加密进入共享 `provider_credentials`；legacy 没有 provider 验证证据，故 `verified_at=null`，API 显示 configured 但 unverified | 空值/加密失败 → 整体 export/import fail closed |
| AI route settings | `project-plan←shot-split`、`shot-spec←shot-script`、`fabricate←shot-codegen`、`vision-qa←shot-qa`；provider/model 只取 export manifest 的 `resolvedRoutesV1` | 不能唯一贡献 route → `unused-route-setting` |
| media route settings | `stepfun_tts_model→tts`、`stepfun_asr_model→asr`，provider 固定 `stepfun` | 非法/空值 → `invalid-setting-value` |
| 其他 setting | 不重建通用 KV 表，不保存原值 | `unsupported-setting` |

所有 disposition 都只记录 source table、legacy PK、canonical row hash 与 reason，
不记录 setting value、credential、绝对路径或原始 payload。`workflow_version` 的
manifest 冻结值固定由
`serializeWorkflowVersion(ACTIVE_WORKFLOW_VERSION)` 产生。参与同一 route 推导的
多个 setting row 必须分别关联到 target 或 disposition，保证逐行对账。

exporter 使用以下固定默认解析 route，并把最终结果完整冻结到 manifest；importer
禁止重新读取运行时默认或 env：

```ts
export const LEGACY_ROUTE_DEFAULTS_V1 = {
  ai: {
    'project-plan': { nodeType: 'shot-split', provider: 'gemini' },
    'shot-spec': { nodeType: 'shot-script', provider: 'gemini' },
    fabricate: { nodeType: 'shot-codegen', provider: 'gemini' },
    'vision-qa': { nodeType: 'shot-qa', provider: 'gemini' },
  },
  models: {
    gemini: { text: 'gemini-3.6-flash', vision: 'gemini-3.6-flash' },
    stepfun: {
      text: 'step-3.5-flash',
      vision: 'step-3.7-flash',
      tts: 'stepaudio-2.5-tts',
      asr: 'stepaudio-2.5-asr',
    },
  },
  media: {
    tts: { provider: 'stepfun', model: 'stepaudio-2.5-tts' },
    asr: { provider: 'stepfun', model: 'stepaudio-2.5-asr' },
  },
} as const
```

`resolvedRoutesV1` 必须含 `schemaVersion:1`、四个 AI route 与两个 media route 的
最终 provider/model；先应用对应 `director_provider_*` 和 provider model setting，
再回退上述固定值。`vision-qa` 使用 vision model，其余 AI task 使用 text model。
缺 route、未知 provider 或空 model 使 export fail closed；`gemini_fast_model`、
非 canonical node route 与 base URL setting 进入 `unused-route-setting` 或
`unsupported-setting`，不能偷偷影响 v3 route。

- [ ] **Step 1: 写 deterministic export/import/reconcile 的失败测试**

测试 fixture 必须包含：

- 六表各至少两行、非 ASCII 中文标题/脚本；
- 一个有 project 的 legacy job 和一个无 project 的 legacy job；
- 一个真实 artifact 文件与一个缺失 artifact 指针；
- 同 aggregate/kind 的两条历史 artifact；
- 同一 node 上 artifact 之前有两个候选 job，以及一个没有候选 job 的 artifact；
- 一个 nullable/mismatched stage node 与一个悬空 edge；
- 一个 StepFun secret setting 与一个普通 setting；
- 第二次 import；
- 中途失败后 resume。

断言：

- 同一 legacy string ID 永远映射到同一 UUIDv5；
- JSONL 固定表顺序、行按主键排序、UTF-8 无 BOM/U+FFFD；
- secret 只以 AES-GCM envelope 进入 `provider_credentials`，export/log 无原文；
- legacy credential 导入后 configured=true、`verifiedAt=null`，不伪造 provider
  验证时间；
- `resolvedRoutesV1` 完整冻结四个 AI 与两个 media route；export 后改变 env/default
  不改变 importer 结果；
- 支持映射的 job 进入 deterministic `pipeline_runs/task_attempts`，不支持或无
  project 的 job 进入 manifest 的 `archivedDispositions`，携带 row hash；
  pending/running historical job 终态为 cancelled，不产生可被 queue claim 的活动
  run；
- 存在且 hash 可算的 artifact 进入 PG，缺失文件进入 rejected disposition；
- 历史 artifact 按 `created_at,id` 稳定赋 `version=1..N` 并串起
  `supersedes_id`，且 attempt 选择按最近不晚于 artifact 的 job 固定；无候选写
  `missing-attempt`；
- project/node/edge/settings 严格按上述 default/mapping/disposition 对账；
- 第二次 import 不新增行；失败 resume 从已提交 project 继续；
- reconcile 对六张 legacy 表分别比较 count、PK set 与 canonical row hash，
  每行都对应 PG target 或明确 archive/reject disposition。

Run:

```powershell
pnpm test -- src/lib/migration/legacy-export.test.ts src/lib/migration/legacy-id.test.ts
pnpm vitest run --config vitest.pg.config.ts src/lib/migration/legacy-import.pg.test.ts src/lib/migration/legacy-reconcile.pg.test.ts
```

Expected: 缺失实现导致 RED。

- [ ] **Step 2: 实现 versioned、脱敏、可重放 export**

`manifest.json` 固定 `schemaVersion: 1`、snapshot SHA、六表 counts/hash、
workspace UUID、`resolvedRoutesV1`、每个 JSONL 文件 SHA、artifact manifest 与
`archivedDispositions`。JSONL 文件固定为：

```text
projects.v1.jsonl
canvas-nodes.v1.jsonl
canvas-edges.v1.jsonl
jobs.v1.jsonl
artifacts.v1.jsonl
settings.v1.jsonl
```

每行是 canonical JSON；legacy string ID 用固定 namespace UUIDv5 映射，
`legacy-id.ts` 使用 Node `createHash('sha1')` 和 RFC 4122 version/variant bits
实现，并用公布的 UUIDv5 test vector 锁定字节序，不新增 UUID dependency。原 ID
仅保留在迁移 metadata，不成为 runtime 公共 ID。settings exporter 对
credential 行在内存中加密后写 envelope，绝不写原文；master key 缺失时 export
失败，不得生成半份 manifest。真实 export、import 与后续 runtime 必须使用同一个
持久 server-only master key；禁止仅为单次命令生成随后丢失的临时 key。
首次真实 export 前运行
`pnpm.cmd tsx scripts/migration/provision-master-key.ts --env .env.local`：
`.env.local` 已被 `.gitignore` 覆盖；脚本必须复用并校验已有
`CVC_CREDENTIAL_MASTER_KEY`，绝不覆盖已有值；缺失时使用
`randomBytes(32).toString('base64')` 安全生成并以同目录临时文件加原子 rename
写入，stdout/stderr 只报告 `created|reused`，不得输出 key。raw `tsx` export CLI
在读取 credential 前显式通过 `process.loadEnvFile('.env.local')` 加载同一文件；
Next runtime 继续使用其标准 server-only `.env.local` 加载。运行前后必须用
`git check-ignore -q .env.local` 与 `git status --short -- .env.local` 证明该文件
不会进入版本控制，任何 `git add` 清单均禁止 `.env*`。
`provider_credentials.verified_at` 由 N1.4 tracked migration 改为 nullable；实时设置
API 仍只在 provider 校验成功后以非空时间调用 `ProviderCredentialStore.save()`，
legacy importer 直接写 null，不把 setting 更新时间或迁移时间伪造成验证证据。
artifact manifest 只含相对 storage key、存在性、size、SHA-256；禁止绝对路径。

- [ ] **Step 3: 实现按 project transaction 的幂等 importer**

先把 `src/lib/db/schema/ai.ts` 的 `verified_at` 攟为 nullable，再运行
`pnpm.cmd db:generate` 生成 tracked `0001_*.sql` 与 Drizzle meta；逐行审阅生成 SQL，
确认它只包含本 Task 授权的
`ALTER TABLE provider_credentials ALTER COLUMN verified_at DROP NOT NULL` 语义。
随后运行 credential PG focused test；测试数据库 helper 会先删除并重建 schema，
从 `0000` 开始应用全部 tracked migration，并必须显式插入一条
`verified_at IS NULL` 的 legacy credential，断言 `describe()` 返回
`configured=true, verifiedAt=null`。这同时是 fresh migration 证明，不能只在已迁移
dev 数据库上检查列属性。

Importer 先核对 snapshot/export SHA，再创建固定 local workspace
`00000000-0000-4000-8000-000000000001`。每个 project 及其 node/edge/artifact
在一个事务中 upsert；全局 credential/route 最后单独事务提交。导入状态只记录在
本地 reconciliation 文件和已有 `command_receipts` 的
`legacy-import-v1:${snapshotSha}` receipt，不新增迁移专用业务表。

legacy job 映射规则固定：

- 仅 `director-stage|render-shot` 为支持的 kind；有 project 时创建 deterministic
  historical `pipeline_runs` 与一个 `task_attempts`，保留 legacy payload hash，
  不保留原 payload、不触发任务；
- status 固定为 `done→succeeded`、`failed→failed`、
  `pending|running→cancelled`；导入结果绝不出现 queued/running historical attempt，
  checkpoint 只记录 version、source status、kind 与 payload hash；
- 无 project、未知 kind 或非法 status：不进入活动 run，写
  `archivedDispositions`，reason 只允许
  `missing-project|unsupported-kind|invalid-status`；
- 任何 disposition 都计入 job 对账，不静默丢弃。

artifact 缺 project、node 指针悬空、缺实体或实体 hash 与 legacy hash 冲突时不
创建活动 artifact，而写
`missing-project|missing-node|missing-file|hash-mismatch|missing-attempt`
disposition。成功导入的
artifact 保留相对 `storage_key`，`content_hash` 重新按实体字节计算，并按
`(aggregate_type,aggregate_id,kind)` 分组，以 `created_at ASC,id ASC` 稳定排序后
依次赋 `version=1..N`，`supersedes_id` 指向同组前一版本；lifecycle 固定为
`draft`，schema version 固定为 `cvc.legacy-artifact/v1`。存在合法 node 时使用
node aggregate，否则使用 project aggregate；没有 legacy 审核/发布证据时禁止映射
为 `approved/released`。node artifact 的 `attempt_id` 固定选择同 project/node 且
`job.created_at <= artifact.created_at` 的 historical attempt，并按
`job.created_at DESC,job.id DESC` 取第一项；无候选时写 `missing-attempt`
disposition，禁止临时伪造 provenance attempt。project aggregate 使用该 project
按相同排序可得的最近 historical attempt；无候选同样 disposition。

- [ ] **Step 4: 跑 fixture GREEN，再对真实只读快照执行三段式迁移**

Run:

```powershell
$env:PATH='C:\Users\AIMFl\AppData\Roaming\npm;C:\Program Files\nodejs;' + $env:PATH
pnpm.cmd db:generate
$env:TEST_DATABASE_URL='postgresql://cvc:cvc_dev_only@127.0.0.1:54327/cvc_test'
pnpm.cmd vitest run --config vitest.pg.config.ts src/features/credentials/provider-credential-store.pg.test.ts
pnpm.cmd tsx scripts/migration/provision-master-key.ts --env .env.local
git check-ignore -q .env.local
git status --short -- .env.local
$env:TEST_DATABASE_URL='postgresql://cvc:cvc_dev_only@127.0.0.1:54327/cvc_test'
pnpm test -- src/lib/migration/legacy-export.test.ts src/lib/migration/legacy-id.test.ts
pnpm vitest run --config vitest.pg.config.ts src/lib/migration/legacy-import.pg.test.ts src/lib/migration/legacy-reconcile.pg.test.ts
$env:DATABASE_URL='postgresql://cvc:cvc_dev_only@127.0.0.1:54327/cvc'
pnpm tsx scripts/migration/export-sqlite.ts --snapshot .data/legacy-sqlite-archives/baseline-before-postgres/app.db --backup-report .data/legacy-sqlite-archives/baseline-before-postgres/backup-report.json --out .data/legacy-sqlite-archives/baseline-before-postgres/export
pnpm tsx scripts/migration/import-postgres.ts --manifest .data/legacy-sqlite-archives/baseline-before-postgres/export/manifest.json
pnpm tsx scripts/migration/reconcile-postgres.ts --manifest .data/legacy-sqlite-archives/baseline-before-postgres/export/manifest.json --out .data/legacy-sqlite-archives/baseline-before-postgres/reconciliation.json
```

Expected: fixture 全 GREEN；真实 export/import/reconcile 均退出 0；
reconciliation 的六张表 `sourceCount = accountedCount`、PK set/hash 无未解释差异；
disposition 数量与原因明确；中文 round-trip 无 U+FFFD；命令不打印 secret。将
snapshot/export/reconciliation hash、六表计数、disposition 分类和命令
exit code 写入 `docs/evidence/refactor-v3/n1/import-reconciliation.md`；只记录相对
路径，禁止 credential、SQL 行内容或本机绝对路径。

- [ ] **Step 5: 再跑 importer 证明幂等，保留只读源**

Run:

```powershell
pnpm tsx scripts/migration/import-postgres.ts --manifest .data/legacy-sqlite-archives/baseline-before-postgres/export/manifest.json
pnpm tsx scripts/migration/reconcile-postgres.ts --manifest .data/legacy-sqlite-archives/baseline-before-postgres/export/manifest.json --out .data/legacy-sqlite-archives/baseline-before-postgres/reconciliation-second-pass.json
Get-Item -LiteralPath '.data/app.db','.data/legacy-sqlite-archives/baseline-before-postgres/app.db' | Select-Object FullName,Length,LastWriteTimeUtc,Attributes
```

Expected: 第二次 import `inserted=0`，PG counts/hash 不变；原 DB 仍存在，backup
仍 ReadOnly。把第二次 import/reconcile 的 `inserted=0`、counts/hash 与 exit code
追加到 `docs/evidence/refactor-v3/n1/import-reconciliation.md`，作为幂等结论。

- [ ] **Step 6: Task-Light 检查并本地提交源码**

Run:

```powershell
pnpm eslint src/lib/migration scripts/migration
pnpm typecheck
git diff --check
git add -- src/lib/db/schema/ai.ts src/lib/db/migrations/pg src/features/credentials/provider-credential-store.ts src/features/credentials/provider-credential-store.pg.test.ts
git add -- src/lib/migration/legacy-export.ts src/lib/migration/legacy-export-contracts.ts src/lib/migration/legacy-export-validation.ts src/lib/migration/legacy-export-routes.ts src/lib/migration/legacy-export-artifacts.ts src/lib/migration/legacy-export.test.ts src/lib/migration/legacy-import.ts src/lib/migration/legacy-import-contracts.ts src/lib/migration/legacy-import-plan.ts src/lib/migration/legacy-import-target-verifier.ts src/lib/migration/legacy-import.pg.test.ts src/lib/migration/legacy-reconcile.ts src/lib/migration/legacy-reconcile.pg.test.ts src/lib/migration/legacy-id.ts src/lib/migration/legacy-id.test.ts scripts/migration/export-sqlite.ts scripts/migration/import-postgres.ts scripts/migration/reconcile-postgres.ts scripts/migration/provision-master-key.ts docs/evidence/refactor-v3/n1/import-reconciliation.md
git diff --cached --check
git commit -m "feat(migration): reconcile SQLite data into Postgres"
```

Expected: 源码/tests 与脱敏 evidence 提交；`.data/**`、Key、绝对本机 artifact
路径不在 commit。

**N1.4 exit gate:** 原 SQLite 与 Online Backup 均保留只读；六表每一行都以 PG
目标或显式 disposition 对账；重复 import 无新增；中文与 artifact hash 保真；
credential 原文从未进入 export、日志、commit。

<a id="task-n15"></a>

### Task N1.5: 完成 Trigger、Pi terminal Tool 与 HyperFrames CLI 三个真实 spike

**Dependencies:** N1.2；可在 N1.3/N1.4 代码完成后执行，package/lockfile 变更不得并行。

**Files:**

- Create: `trigger.config.ts`
- Create: `trigger/tasks/pipeline-run.ts`
- Create: `scripts/spikes/trigger-realtime-probe.ts`
- Create: `scripts/spikes/pi-terminal-tool-probe.ts`
- Create: `scripts/spikes/hyperframes-canary/index.html`
- Create: `scripts/spikes/hyperframes-canary/README.md`
- Create: `scripts/spikes/run-v3-spikes.ts`
- Create: `docs/evidence/refactor-v3/n1/trigger-realtime.md`
- Create (generated evidence): `docs/evidence/refactor-v3/n1-spikes.json`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`（只能由 pnpm 生成）
- Prohibited: 创建 N2 的其余六个 task ID 或正式 pipeline DAG
- Prohibited: OpenAI Agents SDK、第二 Agent runtime、删除普通 `openai`
- Prohibited: raw model delta/reasoning/Key 进入 Trigger stream 或证据

- [ ] **Step 1: 串行安装经 spike 锁定的精确依赖**

Run:

```powershell
pnpm add --save-exact '@trigger.dev/sdk@4.5.7' '@trigger.dev/react-hooks@4.5.7' 'hyperframes@0.7.70'
pnpm add --save-dev --save-exact 'trigger.dev@4.5.7' '@trigger.dev/build@4.5.7'
pnpm why '@trigger.dev/sdk'
pnpm why '@trigger.dev/react-hooks'
pnpm why hyperframes
```

Expected: 五个包版本精确；`package.json` 新增
`"dev:trigger": "trigger dev --skip-update-check"`；`.gitignore` 新增
`/.trigger/`；Pi 与普通 `openai` 仍存在。

- [ ] **Step 2: 写三个 probe 的失败测试/断言**

`scripts/spikes/run-v3-spikes.ts --verify-evidence` 必须拒绝：

- Trigger 只有 task registration、没有真实 run ID 或 typed Realtime event；
- Pi 没有成功 `submit_probe_result` Tool call、Tool result 未
  `terminate: true`、或 terminal Tool 后仍产生 trailing assistant 业务文本；
- HyperFrames 只有 CLI 注册或 `doctor` 退出码、没有
  `doctor payload.ok/check --snapshots/render/ffprobe` 与实体 SHA；
- evidence 含疑似 credential、raw provider response 或绝对本机路径。

Run: `pnpm tsx scripts/spikes/run-v3-spikes.ts --verify-evidence`

Expected: FAIL，明确列出三项 evidence 缺失。

- [ ] **Step 3: 实现最小 Trigger canary 并跑真实 Realtime**

`trigger.config.ts` 使用 `defineConfig`，`dirs: ['./trigger']`。N1 只登记
`cvc.pipeline.run`；payload 固定：

```ts
{ schemaVersion: 1, probeId: string, requestedAt: string }
```

task 写一个 typed safe progress event
`{schemaVersion:1,phase:'started'|'completed',probeId:string}`，返回同一 probeId，
不得访问 Drizzle 或执行业务流程。`trigger-realtime-probe.ts` 必须真实 trigger，
记录 Trigger run ID，使用 SDK Realtime subscription 收到 started/completed，
等待 terminal succeeded，并把事件 schema/count/hash 写入 evidence。

Run in terminal A:

```powershell
pnpm dev:trigger
```

Run in terminal B:

```powershell
pnpm tsx scripts/spikes/trigger-realtime-probe.ts
```

Expected: task 实际执行一次，B 输出脱敏的 run ID 与
`started → completed → succeeded`，不是“Successfully registered”即算完成。
将 run ID、typed event 顺序/hash 与 terminal 状态写入
`docs/evidence/refactor-v3/n1/trigger-realtime.md`；scoped token 正/负测试属于
N2.5，本 Task 明确标为 deferred，不提前实现 run API/Realtime UI。不得保存 token、
raw payload 或 Trigger credential。

- [ ] **Step 4: 实现 Pi terminal Tool 真实模型调用**

`pi-terminal-tool-probe.ts` 复用项目现有 StepFun provider/config，不打印 Key。
只挂一个 `submit_probe_result` Tool；schema 固定
`{probeId:string,answer:'terminal-tool-ok'}`；execute 成功返回：

```ts
{
  content: [{ type: 'text', text: 'probe accepted' }],
  details: { ok: true, probeId: params.probeId },
  terminate: true,
}
```

probe 必须验证 transcript 中 assistant `toolCall.arguments`、对应
`toolResult.details.ok === true`、`terminate` 导致 agent 在当前 tool batch 后结束，
并确认业务结果取自 Tool args，不取 trailing assistant text。证据只写 provider/model
标识、tool 名、call/result hash、usage 数字与 `terminatedAfterTool: true`。

Run: `pnpm tsx scripts/spikes/pi-terminal-tool-probe.ts`

Expected: 一次真实调用成功命中 terminal Tool；无第二 Agent runtime；stdout/evidence
无 Key 和 raw reasoning。

- [ ] **Step 5: 实现 HyperFrames 自包含 canary 并真实 render**

`index.html` 必须自包含且只有一个 sized composition root；root 明确
`data-composition-id="n1-hyperframes-canary"`、`data-width`、`data-height`、
`data-fps` 与 `data-duration`。唯一时间轴注册到
`window.__timelines['n1-hyperframes-canary']`，必须是 paused timeline，所有状态由
seek 决定；若 canary 含媒体，播放/seek 由 HyperFrames 媒体能力接管，禁止原生
autoplay、墙钟或 rAF。不得读取 repo 相对资源。README 记录精确命令。

Run:

```powershell
Push-Location -LiteralPath 'scripts/spikes/hyperframes-canary'
$hfDoctor = pnpm exec hyperframes doctor --json | ConvertFrom-Json
Pop-Location
if ($hfDoctor.ok -ne $true) { throw 'HyperFrames doctor payload.ok is not true' }
pnpm exec hyperframes check scripts/spikes/hyperframes-canary --snapshots --json
pnpm exec hyperframes render scripts/spikes/hyperframes-canary --output .data/spikes/hyperframes-canary.mp4 --quality draft
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames -of json .data/spikes/hyperframes-canary.mp4
Get-FileHash -Algorithm SHA256 -LiteralPath '.data/spikes/hyperframes-canary.mp4'
```

Expected: 不能以 doctor exit 0 单独判定成功；解析后的
`$hfDoctor.ok === true`；最终 `check --snapshots --json` 通过（check 已包含 lint）
并产出非空 snapshots；render 以 `--output` 和显式 `--quality draft` 生成非零 MP4；
ffprobe 尺寸/fps/帧数与 composition pins 一致；doctor/check payload、snapshot
hashes 与 MP4 SHA 写 evidence，不提交生成媒体。

- [ ] **Step 6: 聚合、验证证据并本地提交**

Run:

```powershell
pnpm tsx scripts/spikes/run-v3-spikes.ts
pnpm tsx scripts/spikes/run-v3-spikes.ts --verify-evidence
pnpm eslint trigger.config.ts trigger scripts/spikes
pnpm typecheck
git diff --check
git add -- trigger.config.ts trigger/tasks/pipeline-run.ts scripts/spikes/trigger-realtime-probe.ts scripts/spikes/pi-terminal-tool-probe.ts scripts/spikes/hyperframes-canary/index.html scripts/spikes/hyperframes-canary/README.md scripts/spikes/run-v3-spikes.ts docs/evidence/refactor-v3/n1-spikes.json docs/evidence/refactor-v3/n1/trigger-realtime.md .gitignore package.json pnpm-lock.yaml
git diff --cached --check
git commit -m "chore(spikes): prove v3 runtime integrations"
```

Expected: evidence 三项均 `passed: true` 且含命令、版本、exit code、产物 hash；
commit 不含 `.trigger/**`、MP4、Key、raw model text。

**N1.5 exit gate:** Trigger task 真实执行并被 typed Realtime 观察；Pi 唯一 Agent
以 `terminate: true` Tool 结束且 Tool args 可恢复；HyperFrames doctor payload
`ok=true`、最终 check/snapshots、render/ffprobe 全链成功。任何一项仅配置/注册或
只看 doctor 退出码都不算通过。

<a id="task-n16"></a>

### Task N1.6: 删除活动 SQLite runtime，保留只读迁移工具

**Dependencies:** N1.3、N1.4、N1.5。

**Files:**

- Create: `src/lib/db/runtime-boundary.test.ts`
- Delete: `src/lib/db/schema.ts`
- Delete: `src/lib/db/schema.test.ts`
- Delete: `src/lib/db/migrations/0000_gray_captain_cross.sql`
- Delete: `src/lib/db/migrations/0001_friendly_calypso.sql`
- Delete: `src/lib/db/migrations/0002_solid_prism.sql`
- Delete: `src/lib/db/migrations/0003_wild_black_tarantula.sql`
- Delete: `src/lib/db/migrations/meta/_journal.json`
- Delete: `src/lib/db/migrations/meta/0000_snapshot.json`
- Delete: `src/lib/db/migrations/meta/0001_snapshot.json`
- Delete: `src/lib/db/migrations/meta/0002_snapshot.json`
- Delete: `src/lib/db/migrations/meta/0003_snapshot.json`
- Delete: `src/lib/migration/legacy-sqlite-test-database.ts`
- Modify: `src/lib/config/paths.ts`
- Modify: `src/lib/storage/index.ts`
- Modify: `src/lib/db/client.ts`
- Modify: `src/lib/db/index.ts`
- Modify: `src/lib/db/migrate.ts`
- Move: `src/features/canvas/actions.pg.test.ts` → `src/lib/db/integration/canvas-actions.pg.test.ts`
- Move: `src/features/canvas/fan-out.pg.test.ts` → `src/lib/db/integration/canvas-fan-out.pg.test.ts`
- Move: `src/features/canvas/queries.pg.test.ts` → `src/lib/db/integration/canvas-queries.pg.test.ts`
- Move: `src/features/canvas/status.pg.test.ts` → `src/lib/db/integration/canvas-status.pg.test.ts`
- Modify: `scripts/setup/README.md`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`（只能由 pnpm 生成）
- Retain unchanged: `src/lib/migration/**` 中除上述 test-only helper 外的正式迁移工具
- Retain unchanged: `scripts/migration/**`
- Retain read-only local data: `.data/app.db*`
- Retain read-only local data: `.data/legacy-sqlite-archives/baseline-before-postgres/**`
- Prohibited: 删除备份/原库、把 migration CLI 编进 Next runtime、删除普通 `openai`

- [ ] **Step 1: 写 runtime boundary 的失败测试**

Create `src/lib/db/runtime-boundary.test.ts`，扫描所有 tracked
`src/**/*.ts(x)` import，断言：

- `better-sqlite3` 只允许出现在 `src/lib/migration/**`；
- `drizzle-orm/sqlite-core` 零匹配；
- runtime 不引用 `DB_PATH`、`.data/app.db` 或 legacy migration；
- app/worker 首次 import 不访问文件系统或数据库；
- ordinary `openai` 仍存在，禁止项只匹配 `@openai/agents*`。

Run: `pnpm test -- src/lib/db/runtime-boundary.test.ts`

Expected: legacy schema/migrations 或 dependency placement 令测试 RED。

- [ ] **Step 2: 把 SQLite driver 精确降为 migration-only dev dependency**

Run:

```powershell
pnpm remove better-sqlite3
pnpm add --save-dev --save-exact 'better-sqlite3@12.1.0' '@types/better-sqlite3@7.6.13'
pnpm why better-sqlite3
pnpm why openai
```

Expected: `better-sqlite3@12.1.0` 与 types 只在 devDependencies，供显式迁移
工具使用；普通 `openai` 保持；`onlyBuiltDependencies` 可保留
`better-sqlite3` 以便执行迁移测试。

- [ ] **Step 3: 删除 legacy runtime schema/migrations，收紧导出边界**

删除 Files 中列出的 SQLite schema、tests 与 migration/meta；`src/lib/db/index.ts`
只导出 Postgres schema/client/transaction；`paths.ts` 不再把 `DB_PATH` 作为 runtime
配置导出，`src/lib/storage/index.ts` 不再依赖 import-time 目录初始化。迁移脚本通过
显式 CLI 参数接收 source path，不能从 app config 导入。Next/Trigger build graph
不得包含 `src/lib/migration/**`。

将 N1.3 新增的四个 Postgres 集成测试移入 `src/lib/db/integration/**`。这些测试直接
组装真实数据库、schema 与 test database，属于 infrastructure integration suite，
不能继续放在 `src/features/canvas/**` 冒充 domain test；本步只调整测试归属与路径，
不移动 Canvas 生产 SQL，也不提高 `canvasForbiddenImports` debt cap。

- [ ] **Step 4: 跑 runtime zero-import 与迁移保留测试**

Run:

```powershell
pnpm test -- src/lib/db/runtime-boundary.test.ts src/lib/migration/sqlite-online-backup.test.ts src/lib/migration/legacy-export.test.ts
rg -n "better-sqlite3|drizzle-orm/sqlite-core|DB_PATH|app\\.db" src --glob '!src/lib/migration/**' --glob '!src/lib/db/runtime-boundary.test.ts'
rg -n "@openai/agents|from ['\\\"]@openai/agents" package.json pnpm-lock.yaml src trigger --glob '!**/*.test.ts'
pnpm typecheck
pnpm verify:v3
```

Expected: 第一组 GREEN；runtime SQLite scan 无匹配；Agents SDK scan 无匹配；
ordinary `openai` 不在禁止 pattern 中且仍可被 StepFun/Gemini client 使用；
`canvasForbiddenImports` 不高于既有 cap，禁止通过修改 baseline 掩盖 N1.3 回归。

- [ ] **Step 5: 执行 Track N1 Tier B gate**

Run:

```powershell
$env:DATABASE_URL='postgresql://cvc:cvc_dev_only@127.0.0.1:54327/cvc'
$env:TEST_DATABASE_URL='postgresql://cvc:cvc_dev_only@127.0.0.1:54327/cvc_test'
pnpm lint
pnpm typecheck
pnpm test
pnpm vitest run --config vitest.pg.config.ts
pnpm build
pnpm db:migrate
pnpm tsx scripts/migration/reconcile-postgres.ts --manifest .data/legacy-sqlite-archives/baseline-before-postgres/export/manifest.json --out .data/legacy-sqlite-archives/baseline-before-postgres/reconciliation-final.json
pnpm tsx scripts/spikes/run-v3-spikes.ts --verify-evidence
git diff --check
```

Expected: 全部退出 0；fresh/repeat PG migration 通过；reconciliation 全部
accounted；三 spikes 仍为真实通过；build 不需要 SQLite runtime。

- [ ] **Step 6: 本地提交 Track closeout**

Run:

```powershell
git add -- src/lib/db/runtime-boundary.test.ts src/lib/config/paths.ts src/lib/storage/index.ts src/lib/db/client.ts src/lib/db/index.ts src/lib/db/migrate.ts src/lib/db/schema.ts src/lib/db/schema.test.ts src/lib/db/migrations src/lib/db/integration src/features/canvas/actions.pg.test.ts src/features/canvas/fan-out.pg.test.ts src/features/canvas/queries.pg.test.ts src/features/canvas/status.pg.test.ts src/lib/migration/legacy-sqlite-test-database.ts scripts/setup/README.md package.json pnpm-lock.yaml
git diff --cached --check
git commit -m "refactor(db): remove active SQLite runtime"
git status --short --branch
```

Expected: commit 精确反映 deletes/modifies；只读 DB/backup 未 stage；工作树剩余修改
均能归属其他 Track 或用户原有工作。

**N1.6 exit gate:** 应用与 worker runtime 只连接 Postgres；SQLite driver 只存在于
显式只读迁移工具的 dev graph；原 DB/Online Backup 保留只读；ordinary `openai`
未误删；N1 Tier B 全绿。

---

## Track N1 完成门禁

- [ ] N1.1–N1.6 均各自本地 Conventional Commit，未 push。
- [ ] active WAL 的 Online Backup 通过 quick_check、六表 counts 与 SHA，未使用
  `Copy-Item`。
- [ ] fresh Postgres migration 独立建立十二表、约束与 artifact immutable trigger。
- [ ] runtime repository 全异步、workspace scoped、无 SQLite import。
- [ ] project/node/edge/job/artifact/settings 的 count、PK、canonical hash 全部进入
  PG target 或显式 disposition。
- [ ] `model_routes` 只覆盖四个 `AiTaskKind`；`media_routes` 只覆盖
  `tts|asr`；二者无 secret 且共享 `provider_credentials`。
- [ ] Trigger、Pi terminal Tool、HyperFrames CLI 均有真实运行和脱敏 evidence，
  不是 registration-only。
- [ ] `pnpm lint`、`pnpm typecheck`、`pnpm test`、PG tests、`pnpm build` 全部退出 0。
- [ ] 普通 `openai` 仍保留；没有 `@openai/agents*`、第二 Agent runtime、Key 泄露
  或 U+FFFD。
