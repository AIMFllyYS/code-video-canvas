# N1.4 SQLite → Postgres 迁移与逐行对账证据

日期：2026-07-25
Task：N1.4
结论：PASS

## 1. 只读源与持久密钥

- 原库 `.data/app.db` 在迁移前后均存在，长度 `151552`，SHA-256
  `655b3117ab1803b2623ee305f6aab5fc8db7a75ecbdb098bfb247ec238e560d9`，
  修改时间未变化。
- Online Backup `.data/legacy-sqlite-archives/baseline-before-postgres/app.db`
  在迁移前后均为 ReadOnly，长度 `151552`，SHA-256
  `0f7b5c7734ea01ee607f416667d0abe80886733ba055fdf7ba1d5f03d6bc8e1a`，
  修改时间未变化。
- `backup-report.json` 前后 SHA-256 均为
  `901d39ca972ad33f9af501af8321abdf607e19cf24681229ff418dc85d049918`。
- master key provision 首次返回 `created`，第二次返回 `reused`；`.env.local`
  由 Git ignore，`git status --short -- .env.local` 无输出。证据、日志与 commit
  均未记录 key。

## 2. Schema 与 focused gate

- nullable credential RED：fresh PG 拒绝 `verified_at=null`，错误为 NOT NULL
  constraint。
- `pnpm.cmd db:generate` 生成 `0001_public_shaman.sql`；逐行审阅确认仅包含
  `provider_credentials.verified_at DROP NOT NULL`。
- exporter/UUID/provisioner/strict reader：2 files / 10 tests PASS。
- 最终 combined PG（credential + importer + reconciler）：3 files / 13 tests PASS。
- `pnpm.cmd eslint src/lib/migration scripts/migration`：0 error、0 warning。
- `pnpm.cmd typecheck`：exit 0。
- Task scoped `git diff --check`、U+FFFD、BOM、secret、绝对机器路径扫描：PASS。
- 所有新增生产文件 ≤350 行，所有函数 ≤50 行。

## 3. 真实 canonical export

真实只读快照 export 退出 0。首次 final directory rename 遇到一次 Windows
`EPERM`，owned temp 已完整清理；相同命令立即重跑成功。实现随后加入仅针对
`EPERM/EBUSY` 的三次有界原子 rename 重试，并由注入式 focused test 覆盖
`EPERM → EBUSY → success`。

| Source table | Source count |
|---|---:|
| `projects` | 6 |
| `canvas_nodes` | 85 |
| `canvas_edges` | 88 |
| `jobs` | 34 |
| `artifacts` | 58 |
| `settings` | 1 |
| **总计** | **272** |

- export manifest SHA-256：
  `81460cebad303367513700f67ef27c938277174a663ce516c6c98e4d60b6d8dd`。
- artifact manifest：58 条，58 条实体存在并有 SHA-256，缺失 0。
- export-time archived dispositions：0。
- 全部 export 文件无 UTF-8 BOM、无 U+FFFD、无 credential 明文、无绝对
  artifact root。

## 4. 真实 Postgres import

首次 import 退出 0：

```text
inserted=312
replayed=false
accounted=272
```

312 个活动目标为：6 project、85 node、88 edge、34 historical run、
34 historical attempt、58 artifact、1 credential、4 AI route 与 2 media route。
另有 1 workspace 与 1 succeeded command receipt，由 receipt transaction 管理，
不计入 `inserted`。

语义检查：

- historical run/attempt 共 34，状态为 `succeeded=14`、`failed=19`、
  `cancelled=1`；`queued/running=0`。
- artifact 共 58，实体 hash 长度异常 0、安全 storage key 异常 0、
  version/supersedes 链异常 0。
- credential 共 1，`verified_at IS NULL` 共 1；使用持久 `.env.local` master key
  解密后与只读 SQLite 中对应值在内存中比较一致，stdout 仅记录
  `credentialDecryptMatches=true`。
- model route 4、media route 2。

## 5. 六表逐行 reconcile 与幂等

首次 reconciliation 退出 0，`ok=true`：

| Source table | Source | Accounted | PK hash | Row hash | Missing | Extra | Unresolved |
|---|---:|---:|---|---|---:|---:|---:|
| `projects` | 6 | 6 | match | match | 0 | 0 | 0 |
| `canvas_nodes` | 85 | 85 | match | match | 0 | 0 | 0 |
| `canvas_edges` | 88 | 88 | match | match | 0 | 0 | 0 |
| `jobs` | 34 | 34 | match | match | 0 | 0 | 0 |
| `artifacts` | 58 | 58 | match | match | 0 | 0 | 0 |
| `settings` | 1 | 1 | match | match | 0 | 0 | 0 |

- disposition counts：`{}`；真实基线 272 行均映射到 PG target。
- reconciliation SHA-256：
  `14be6c756eccc798e7199b63a5fa6d64ad20ddf56143f6d10522455dda56f5b0`。
- 第二次 import：`inserted=0`、`replayed=true`、`accounted=272`。
- 第二次 reconciliation：`ok=true`，receipt、snapshot、六表 count/PK hash/row
  hash 均与首次一致；报告 SHA-256 同为
  `14be6c756eccc798e7199b63a5fa6d64ad20ddf56143f6d10522455dda56f5b0`。
- strict target verifier 接入后又对真实 PG 执行一次 succeeded replay：
  `inserted=0`、`replayed=true`、`accounted=272`；strict reconciliation
  `ok=true`、全局 `targetMismatches=0`、六表 `contentMismatches=0`，报告 SHA-256
  `732ff246243fe0047e855a543d786afa46e7700d7ef6a2d512ddc972562490d8`。

## 6. 边界声明

- 未写入、删除、移动或改权限原 `.data/app.db*` 与 Online Backup。
- `.data/**` runtime export/reconciliation、`.env.local` 均不进入 Git。
- fixture failure、resume、fingerprint conflict、missing artifact/attempt、
  cross-project edge 与第二次 replay 由 focused tests 覆盖；本节真实基线没有
  disposition，因此未把 fixture 路径描述成真实数据异常。
