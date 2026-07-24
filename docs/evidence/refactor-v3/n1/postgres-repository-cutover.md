# N1.3 — Runtime repository 异步 Postgres cutover

- Task: `N1.3`
- implementation commit: `18a7fda`
- start checkpoint: `b746b86`
- scope clarification: `6407479`
- runtime: Node `24.15.0`、pnpm `9.15.0`
- evidence class: focused unit、真实本地 Postgres integration、静态合同检查

## 已证明的实现边界

- `getDb()` 惰性连接；模块 import 与 repository constructor 不连接、不迁移。
- Canvas、artifact、audio、Director、render、AI settings/routing 与 legacy queue
  均使用异步 Postgres repository。
- 本地兼容入口只注入固定 workspace
  `00000000-0000-4000-8000-000000000001`；project/node/artifact 查询均携带
  workspace/project 归属。
- artifact 写入携带 attempt ID；run/attempt 必须仍为 running，旧 attempt number
  返回稳定 `STALE_ATTEMPT`，artifact 与节点投影同一事务提交。
- legacy queue 只映射 `pipeline_runs/task_attempts`，不重建 `jobs` 表；锁行 claim
  显式限定 workspace，外部 workspace 的更早任务不会饿死本地队列。
- audio 上传使用 artifact ID 唯一临时 key；数据库失败只补偿本次对象，不会删除
  另一并发成功提交的同内容实体。
- provider credential 使用 AES-256-GCM、96-bit nonce、128-bit auth tag 与绑定
  workspace/provider/version 的 AAD；无明文 env fallback。纯
  `credential-envelope.ts` 可由迁移 CLI 无副作用复用，Store 仍保持 server-only。
- Settings API 只返回 `configured/verifiedAt/updatedAt`，不返回 secret、masked
  secret、`DATA_DIR` 或绝对路径。
- 跨域调用经 feature 根出口或显式纯 `canvas/contracts.ts`；生产文件均未超过
  350 行硬上限。

## 验证结果

| Gate | 结果 |
|---|---|
| `pnpm vitest run --config vitest.pg.config.ts` | PASS，14 files / 69 tests |
| `pnpm test` | PASS，81 files / 371 tests |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| CLI 直接 import `credential-envelope.ts` | PASS；无 DB/env 副作用 |
| `git diff --cached --check` | PASS |
| runtime SQLite driver/schema scan | PASS；仅 migration/frozen legacy 范围允许 |
| provider 明文 fallback / `NEXT_PUBLIC_*` / UI 路径 scan | 0 |
| U+FFFD / 新增生产 `any` / protected staged path scan | 0 |

真实 PG 负测额外证明：

1. `attempt_no + 1` 出现后，旧 attempt publish 被拒绝且 artifact 数为 0；
2. foreign workspace 更早 queued attempt 保持 queued，本地 attempt 正常完成；
3. 同 hash 并发 audio 上传一成功一失败时 key 不同，失败补偿只删除自己的 key；
4. credential ciphertext/nonce/tag round-trip、篡改、错误上下文与缺失 master key
   均 fail closed。

## 验证边界

按当前冲刺策略，N1.3 不重复执行浏览器缩略图、视觉或完整工作流 E2E。此处证明的是
repository、事务、workspace、credential 与兼容 queue 合同；真实浏览器、像素和最终
媒体证据仍由 N7 Tier C 与用户最终手测承担，不能用本证据冒充。

用户并发 `.qoder/**`、`docs/designs/canvas.pen`、
`docs/designs/purpleink-new-design-package/**` 与 `docs/designs/archive/**` 未读取、
未修改、未 stage。未 push。
