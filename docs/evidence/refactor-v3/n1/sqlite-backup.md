# N1.1 SQLite Online Backup 证据

- Task：`N1.1`
- 状态：`done`
- 日期：2026-07-25
- 分支：`main`
- Task 起始 HEAD：`481e8d2`
- N1 scope 修订：`91b9161`
- push：`false`

## 1. 范围与边界

本 Task 只新增 SQLite Online Backup 模块、固定路径 CLI、测试和本证据。活动源始终为
`.data/app.db`，WAL/SHM 仅作只读 inventory；没有执行 `Copy-Item`、`copyFile`、
checkpoint、`VACUUM`、迁移、删除或覆盖源文件。

真实快照与报告是被 `.gitignore` 排除的本地运行时产物：

- `.data/legacy-sqlite-archives/baseline-before-postgres/app.db`
- `.data/legacy-sqlite-archives/baseline-before-postgres/backup-report.json`

它们不会 stage，并保留给 N1.4。报告中的绝对规范化路径未复制到本证据。

## 2. RED → GREEN

| 阶段 | 命令 | 结果 |
|---|---|---|
| RED | `pnpm test -- src/lib/migration/sqlite-online-backup.test.ts` | exit 1；`Cannot find module './sqlite-online-backup'` |
| GREEN | 同一 focused test | exit 0；1 file / 3 tests |

fixture 在 `journal_mode=WAL`、`wal_autocheckpoint=0` 下保持 writer 打开；checkpoint
后才写入 sentinel，并证明 sentinel 仅进入 WAL 视图而主 DB SHA 不变。Online Backup
后的只读快照包含 sentinel、`quick_check=ok`，六表 count 精确；源 DB/WAL SHA
前后不变。测试还覆盖已有目标字节不变、后置校验失败清理未验收目标，以及只读重开。

该 fixture 只证明 WAL 一致性、覆盖保护和清理合同，不代表真实业务库迁移成功；真实
库证据见下一节。

## 3. 真实源 inventory

CLI 执行前打印了脱敏 inventory，仅含文件名、大小和 UTC mtime：

| 文件 | 大小（bytes） | UTC mtime |
|---|---:|---|
| `app.db` | 135168 | `2026-07-23T10:51:09.145Z` |
| `app.db-wal` | 2550312 | `2026-07-24T12:00:37.014Z` |
| `app.db-shm` | 32768 | `2026-07-24T09:17:21.364Z` |

进程盘点时，既有 Node 24 开发服务由 PID 44452 监听 3000；备份、复核与 Task-Light
命令均未执行进程停止、重启或 native dependency rebuild。备份后的稍后独立健康检查
发现该 PID 与 3000 listener 已不存在；迁移路径没有执行进程控制，因此本证据不把该
外部进程退出归因于 Online Backup，也不把服务存活冒充为备份验收项。

## 4. 真实 Online Backup 结果

固定参数 CLI：

```text
pnpm tsx scripts/migration/sqlite-backup.ts --source .data/app.db --destination .data/legacy-sqlite-archives/baseline-before-postgres/app.db --report .data/legacy-sqlite-archives/baseline-before-postgres/backup-report.json
```

首次执行 exit 0。报告完成时间为 `2026-07-24T19:04:53.138Z`，独立只读复核结果：

| 检查 | 结果 |
|---|---|
| `PRAGMA quick_check` | `ok` |
| backup pages | `totalPages=37`、`remainingPages=0` |
| snapshot size | 151552 bytes |
| snapshot attributes | `ReadOnly, Archive` |
| snapshot SHA-256 | `0f7b5c7734ea01ee607f416667d0abe80886733ba055fdf7ba1d5f03d6bc8e1a` |
| report SHA 与独立 `Get-FileHash` | 一致 |
| 临时 report 文件 | 0 |

六表 count：

| 表 | count |
|---|---:|
| `projects` | 6 |
| `canvas_nodes` | 85 |
| `canvas_edges` | 88 |
| `jobs` | 34 |
| `artifacts` | 58 |
| `settings` | 1 |

没有打印或记录任何 SQL 行、setting 值或 credential。

## 5. 源文件未写入与覆盖保护

| 文件 | backup 前 SHA-256 | backup 后 SHA-256 | 结论 |
|---|---|---|---|
| `.data/app.db` | `2443a31527aba97a9f7417ebd8f55b684223d7f05da6bdaff732a4997cb929c3` | 同左 | 未变化 |
| `.data/app.db-wal` | `3fa63516f01d5770a016d6761ecb8ed14732fec1407ff7e80ef9e7f20d775fa4` | 同左 | 未变化 |

SHM inventory SHA-256 为
`e4d08de9feb996b419df3eacff9916bfc6a7f5e0f9c6be6be06f870209a73f9d`；
SHM 是共享协调文件，不将其稳定性误作验收条件。

对相同固定参数进行第二次真实调用时，CLI 以
`REPORT_ALREADY_EXISTS` 按预期退出 1；外层复核命令确认 snapshot 与 report SHA
均保持不变并以 exit 0 收口。没有覆盖或删除已验收产物。

## 6. 独立只读复核

报告解析、`Get-FileHash`、文件属性与源 hash 对比命令 exit 0。随后使用新的
`better-sqlite3` readonly connection 独立打开 snapshot，再次得到
`quick_check=ok` 和相同六表 count，命令 exit 0。

两次先行的 `node -e` 只读复核尝试因 PowerShell/native argument 引号转义在
JavaScript parse 阶段 exit 1，尚未打开数据库；改用 stdin 传入同一固定只读脚本后
通过。该命令行转义失误不是产品、备份或数据失败，也没有产生文件写入。

## 7. Task-Light 与治理门禁

| 门禁 | 结果 |
|---|---|
| focused test | exit 0；1 file / 3 tests |
| targeted ESLint | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm verify:v3` | exit 0 |
| `Copy-Item` / `copyFile` source scan | 0 匹配 |
| runtime DB write/checkpoint/`VACUUM` source scan | 0 匹配 |
| U+FFFD scan | 0 匹配 |
| `git diff --check` / staged check | exit 0 |

最终 staged scope 只允许三个源码文件与本证据；`.data/**`、`.qoder/**` 和
`docs/designs/**/*.pen` 均不得进入 commit。

## 8. Exit gate

A05 通过：活动 WAL 数据库已使用 `Database.backup()` 生成一致性只读快照；fixture
和真实 snapshot 均通过 `quick_check`、六表计数与 SHA 验证；源 DB/WAL 未被迁移
工具写入，已验收目标不可覆盖。该 snapshot 可作为 N1.4 的只读迁移输入。
