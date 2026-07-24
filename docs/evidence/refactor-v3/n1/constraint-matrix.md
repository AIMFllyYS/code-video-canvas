# N1.2 Postgres Constraint Matrix

- Task：`N1.2`
- 状态：`done`
- 日期：2026-07-25
- 分支：`main`
- 实现 commit：`513bb1d`
- evidence class：`catalog-integration + runtime-behavior`
- workflowVersion：`cvc-v3-foundation|cvc-arch-v3.0.0|legacy-html-v1|legacy-cvc-render-v1|node22-playwright1.61.1-ffmpeg-static5.3.0`
- push：`false`

## 1. Catalog matrix

| 合同 | 实库/测试结果 |
|---|---|
| 领域表 | 恰好 12 |
| primary key | 12；除 workspace 外均为 `(workspace_id,id)` |
| foreign key | 精确 23 条完整 source/target column signature |
| CHECK | 31；状态集合、revision、attempt/version/size、hash 与 envelope fence |
| UNIQUE | 13；logical key、edge、attempt、artifact version、receipt、route、provider round 等 |
| 时间 | 所有 31 个 `*_at` 列均为 `timestamp with time zone` |
| identity | 23 个 `id/workspace_id` 列均为 UUID |
| artifact trigger | approved/released 的 UPDATE 与 DELETE 均被拒绝 |
| two-phase run | 无 Trigger handle 可先建 `triggering` run；回写后重复非空 handle 被拒绝 |

## 2. 行为矩阵

PG integration 共 2 files / 10 tests：

| 行为 | 结果 |
|---|---|
| 十二表与复合 PK exact set | PASS |
| 23 条 workspace-safe FK exact set | PASS |
| required UNIQUE exact set | PASS |
| enum 与 numeric named CHECK | PASS |
| route 无任意 `key/secret/ciphertext/nonce/auth_tag`；credential 无明文列 | PASS |
| UUID、bigint revision、timestamptz inventory | PASS |
| 非法状态、stage、attempt、route revision/repair number | DB 拒绝 |
| 跨 workspace/project edge | 复合 FK 拒绝 |
| approved/released artifact 更新和删除 | trigger 拒绝 |
| initial/repair provider round 冲突 | UNIQUE 拒绝 |
| triggering run 两阶段 handle | nullable create、回写成功、重复 handle 拒绝 |

## 3. Task-Light 与回归

| 门禁 | 结果 |
|---|---|
| PG tests | exit 0；2 files / 10 tests |
| client/migrator unit | exit 0；2 files / 8 tests |
| `pnpm test` | exit 0；88 files / 422 tests |
| `pnpm typecheck` | exit 0 |
| targeted ESLint | exit 0 |
| `pnpm verify:v3` | exit 0；0 violations |
| `pnpm build` | exit 0 |
| generator drift check | 0 schema changes |
| U+FFFD / connection string / staged scope scan | 0 命中 |
| independent final review | PASS |

## 4. Exit gate

A03 通过：workspace 复合 FK、命名 CHECK、attempt/receipt/route/provider-round unique、
artifact immutable trigger 与两阶段 run handle 均由真实 Postgres catalog 和行为测试
证明；fixture 或静态 schema 没有被冒充为 live DB 证据。
