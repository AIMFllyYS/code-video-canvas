结论先说：项目并不是卡在 N1.3。N1 的 6 个实现 Task 已经全部完成，N2.1 也已提交完成；当前真正停在 N2.2 的中间态。严格按 48 Task 账本计算是 12/48，完成 25%。Postgres 基础、真实数据迁移、Pi/HyperFrames Spike 都已经落地，但新的 v3 Trigger 全链路尚未可运行。

本次我暂停了施工，只做只读审计，没有改文件、stage 或 commit。

## 一、当前真实快照

审计时间：2026-07-25 12:22（+13:00）

- 分支：`main`
- 当前 HEAD：`fc39b4b`
- 相对 `origin/main`：ahead 56，未 push
- 暂存区：空
- 当前 N2.2：1 个 tracked 修改文件、12 个 untracked 实现/测试文件
- 用户已有 `.qoder/**`、`canvas.pen`、设计包删除/归档等改动均未纳入本项目提交，也没有被覆盖或 stage
- 当前 Goal 未完成，更没有被标记 complete

正式 Task 进度如下：

| Track | 任务进度 | 工程状态 |
|---|---:|---|
| N0 | 5/5 | 已完成并有 closeout |
| N1 | 6/6 | 实现完成，但正式 Track closeout 文档有缺口 |
| N2 | 1/6 | N2.1 完成；N2.2 正在施工 |
| N3 | 0/6 | 未开始，依赖 N2 |
| N4 | 0/6 | 未开始，依赖 N3 |
| N5 | 0/6 | 未开始，依赖 N4 |
| N6 | 0/7 | 未开始，依赖 N5 |
| N7 | 0/6 | 未开始，依赖 N6 |
| 合计 | 12/48 | 25% |

权威状态位于 [Task Breakdown](D:/projects/Dev-Tools/CodeVideoCanvas/docs/specs/2026-07-24-refactor-v3-task-breakdown.md:165)。

## 二、已经真实完成了什么

### N0：基线与止血，5/5

N0 从 05:54 到 07:49，共约 1 小时 54 分钟，完成：

- 冻结 Demo v1 基线和 workflowVersion；
- 修正 Pi terminal Tool 参数与 artifact 提取；
- 将 source/runtime 合同检查前移到 render enqueue；
- 修复 API 结果被丢弃以及 UI 假进度；
- 建立 Agents SDK、越界 import、文件长度、UTF-8/U+FFFD 等架构门禁；
- 当时完整 lint、typecheck、test、build 通过；
- N0 有独立 [closeout.md](D:/projects/Dev-Tools/CodeVideoCanvas/docs/evidence/refactor-v3/n0/closeout.md:1)。

### N1：Postgres、迁移和 Spike，6/6

N1 整个 Track 从 07:57 到 11:59，约 4 小时 02 分钟。不是 N1.3 单项用了 4 小时，而是以下六项合计：

| Task | Git 可证时间上界 | 主要工作 |
|---|---:|---|
| N1.1 | 17分14秒 | SQLite Online Backup、WAL 一致快照、quick_check、计数/hash |
| N1.2 | 1时06分44秒 | Docker PG 17.5、12 表、迁移与约束 |
| N1.3 | 51分05秒 | 全域 repository/caller 异步 Postgres 切换 |
| N1.4 | 57分24秒 | SQLite export、PG import、重复导入与严格对账 |
| N1.5 | ≤34分26秒 | Pi、Trigger、HyperFrames 三项 Spike 和 Trigger waiver |
| N1.6 | 17分16秒 | 删除 active SQLite runtime，保留只读迁移能力 |

这些区间是 Git checkpoint 之间的墙钟上界，不等于连续主动工作时间；N1.5 与 N1.6 还有部分重叠。

N1 的实际成果包括：

1. 活动 SQLite 已用 Online Backup API 备份，不是普通文件复制。

   - 六表源计数：`6/85/88/34/58/1`
   - 总源行数：272
   - `quick_check=ok`
   - SQLite/WAL 源文件前后 hash 不变
   - snapshot 只读且独立 hash 一致

2. Postgres 已经是活动结构化数据源。

   - 本地 Docker Postgres 17.5
   - 12 张业务表
   - 23 个 FK
   - 31 个 CHECK
   - 13 个 UNIQUE
   - fresh migration 和重复 migration 都通过

3. 不只是建了 PG schema，活动 repository 和调用方已经切到异步 Postgres。

   覆盖 Canvas、artifact、audio、Director、render、AI settings/routing、legacy queue、API 与页面调用方。

4. 真实旧数据已经导入和对账。

   - SQLite export：272 行
   - 首次 PG import：312 个 target 实体
   - target 更多，是因为旧 jobs 被拆为历史 pipeline run + attempt
   - 第二次导入：`inserted=0, replayed=true`
   - missing、extra、unresolved、target mismatch、content mismatch 全为 0

5. active SQLite runtime 已经删除。

   - SQLite schema/migrations/runtime 入口已清退
   - 原 SQLite、WAL、安全备份和只读 migration CLI 仍保留
   - `better-sqlite3` 只作为 migration/test 的精确 dev dependency

6. N1 Spike 的真实性边界是清楚的。

   - Pi terminal Tool：真实通过
   - HyperFrames doctor/check/snapshot/render/ffprobe/decode：真实通过
   - Trigger task、typed stream、probe：实现并通过静态合同
   - Trigger.dev 云端登录、真实 run、Realtime：没有执行，明确记录为 `passed:false / waived:true`
   - 没有把静态检查冒充云端 E2E

迁移证据可见 [N1.3 cutover](D:/projects/Dev-Tools/CodeVideoCanvas/docs/evidence/refactor-v3/n1/postgres-repository-cutover.md:1) 和 [import reconciliation](D:/projects/Dev-Tools/CodeVideoCanvas/docs/evidence/refactor-v3/n1/import-reconciliation.md:1)。

### N2.1：Trigger 合同层，1/6

N2.1 从 12:02 到 12:08，只用了约 6 分 25 秒，已完成：

- 七个稳定 task ID；
- 四个静态 queue；
- 三组业务状态；
- UUID/lowercase tags；
- 唯一 safe typed progress stream；
- 严格 payload/result/failure 合同；
- 13 个合同测试；
- lint、typecheck、`verify:v3` 通过。

## 三、N1.3 为什么看起来特别久

N1.3 实际只有 51 分 05 秒，不是 4 小时。

用户感知的“4 小时”可能对应两个区间之一：

- N0 preflight 到 N1.3 完成：4 小时 20 分；
- 整个 N1 Track：4 小时 02 分。

N1.3 本身之所以仍然接近一小时，是因为它实际上是一个过大的“迷你 Track”：

- 修改 130 个文件；
- 增加 8,112 行、删除 3,923 行；
- 同步 repository 改异步后，调用链必须一直改到 pages、routes 和 services；
- 同时迁移 Canvas、artifact、audio、Director、render、AI、settings、routing、legacy queue；
- 加入 workspace 事务边界；
- 加入 stale attempt fence；
- 加入 artifact 原子提交；
- 加入 AES-256-GCM credential envelope；
- 把大量 SQLite test 替换成真实 PG test；
- 还验证了跨 workspace queue 饥饿、旧 attempt 提交、音频并发失败补偿等负路径。

验证规模为：

- 常规：81 files / 371 tests
- Postgres：14 files / 69 tests
- lint、typecheck、secret、UTF-8、import、runtime SQLite scan 全通过

所以 N1.3 慢的根因是改动面过宽和数据一致性风险，不是反复跑浏览器端测；浏览器、视觉和完整工作流已明确留给 N7/用户最终手测。

Git 无法证明额度不足、思考、等待分别用了多少时间，因此我不会把耗时凭空归因于 Codex 额度。

## 四、“M2”与“N2”的区别

当前 v3 账本没有 M2 Track。

如果你说的实际是 N2：

- N2.1 已完成；
- N2.2 是当前未提交 WIP；
- N2.3–N2.6 尚未开始。

如果你指旧审计里的 M2，即 `src/lib/config/paths.ts` import 时执行 `mkdirSync` 的问题，它已经在 N1.6 的 `bc603a7` 修复：删除了 import-time FS 副作用、`ensureDataDirs()` 和活动 `DB_PATH`。

## 五、N2.2 当前到底写到哪里

N2.2 现在处于“Step 1–3 脚手架完成，Step 4 七个 task shell 基本没写”的状态。

已经完成：

- [execution-context.ts](D:/projects/Dev-Tools/CodeVideoCanvas/src/features/pipeline/execution-context.ts:12)：可信 workspace/project/run/attempt/shot、Trigger run ID、fingerprint、workflowVersion、同一个 AbortSignal 和 progress sink；
- [progress-sink.ts](D:/projects/Dev-Tools/CodeVideoCanvas/src/features/pipeline/progress/progress-sink.ts:1)：strict safe progress event；
- [task-service.ts](D:/projects/Dev-Tools/CodeVideoCanvas/src/features/pipeline/services/task-service.ts:12)：唯一 PortResult、DomainTaskPort、TaskResult mapper；
- pipeline、plan、generate、media、render、QA、compose 七个具名 service wrapper；
- 未绑定领域 adapter 时稳定抛 `DOMAIN_ADAPTER_PENDING`，不会伪造 completed；
- media service 是普通 media port，不构造 Agent；
- service contract：10/10 通过；
- TypeScript typecheck：通过；
- ESLint：通过；
- UTF-8/U+FFFD 和禁止依赖扫描：通过。

尚未完成：

- 缺少六个 task 文件：

  - `project-plan.ts`
  - `shot-generate.ts`
  - `shot-media.ts`
  - `shot-render.ts`
  - `shot-qa.ts`
  - `project-compose.ts`

- 现有 [pipeline-run.ts](D:/projects/Dev-Tools/CodeVideoCanvas/trigger/tasks/pipeline-run.ts:11) 仍是 N1 canary：

  - 直接 append started/completed；
  - 直接返回 completed；
  - 没有 execution context；
  - 没有调用 pipeline service；
  - 没有 retry/handleError；
  - 没有 AbortTaskRunError。

所以当前 focused gate 是：

- 2 个测试文件
- 16 个 tests
- 12 passed
- 4 failed
- 四个失败全部来自六个 shell 缺失和 pipeline-run 未接 service/context
- typecheck、ESLint 单独均为 exit 0

这意味着代码没有语法损坏或截断文件，但 N2.2 还不能 commit，更不能标 done。

此外，现有 source guard 还需要补锁：

- 固定 queue；
- `retry.maxAttempts=3`；
- `handleError`；
- cancelled → `AbortTaskRunError`；
- progress stream `{target:"root"}`；
- pipeline service 的 signal/context 传播。

N2.2 规范和延迟绑定说明见 [Issue N2.2](D:/projects/Dev-Tools/CodeVideoCanvas/docs/issues/refactor-v3/issue-n2-trigger-orchestration.md:201)。

## 六、当前为什么仍不能称为“最小 v3 可运行”

现在可以确认：

- Postgres-backed 旧应用基线能够构建；
- 当前未提交 N2.2 脚手架能够 typecheck；
- Pi 和 HyperFrames 的隔离 Spike 真实通过；
- 数据迁移路径真实通过。

但新的 v3 Trigger 工作流尚不能运行，因为：

1. 六个 task shell 不存在；
2. pipeline-run 仍是 canary 假完成；
3. N2.3 的 DAG、global idempotency、receipt、checkpoint、attempt fence 尚未实现；
4. start/cancel/retry API 尚未实现；
5. Snapshot-first Realtime 尚未实现；
6. 旧 in-process queue/SSE 尚未清退；
7. N3–N5 的真实 Pi、compiler、render、media/compose adapter 尚未绑定。

因此目前是“基础设施和迁移完成，产品新主链尚未闭环”，而不是“只差端测”。

## 七、一个真实的延迟绑定问题

N2.2 发现了一个不能靠猜测解决的模型差异：

- 新合同使用 UUID `shotId`；
- 旧 Director/render/audio 使用 `S001` laneKey；
- script/codegen/sfx/subtitle/qa 又分别有不同 node ID；
- 当前没有可信统一 resolver。

所以规范已登记 `N2-DOMAIN-ADAPTER-001`：

- N2.2 只建立薄 task 和具名 Port；
- 默认 adapter 必须失败；
- 禁止把 UUID 猜成 `S001`；
- 禁止回退旧队列后伪装新链成功；
- 真正 adapter 在 N3、N4、N5 随 canonical contracts 绑定；
- N7 前必须关闭。

同样，目前 N2.2 只能证明同一个 AbortSignal 到达 Port；Pi、Playwright、FFmpeg 的物理取消要在对应 Track 完成，不能用 `Promise.race` 冒充。

这不是当前 N2.2 的硬阻塞，但它意味着 N2.2 完成后也不会立即得到完整视频 E2E。

## 八、账本目前有几处需要修正

这是本次审计发现的正式治理问题。

### 1. 顶部 Track 表过期

[Task Breakdown 顶部表](D:/projects/Dev-Tools/CodeVideoCanvas/docs/specs/2026-07-24-refactor-v3-task-breakdown.md:87)仍写：

- N1：`in_progress`
- N2：`blocked by N1`

但下面已经是：

- N1.1–N1.6 全 done；
- N2.1 done；
- N2.2 ready。

所以真实工程已到 N2.2，但 Track 表没有同步。

### 2. N1 正式 closeout 文件不存在

账本引用了 `docs/evidence/refactor-v3/n1/closeout.md`，但该文件不存在。

同时 [N1 Issue closeout 部分](D:/projects/Dev-Tools/CodeVideoCanvas/docs/issues/refactor-v3/issue-n1-postgres-foundation-and-spikes.md:1315) 的 Tier B、closeout、Track gate checkbox 仍未勾选。

因此准确说法是：

- N1 六个实现 Task 已完成；
- N1 的代码门禁和迁移证据很完整；
- 但形式上的 Track closeout 没有完整落盘。

### 3. N2.2 应为 `in_progress`

当前有 13 个 N2.2 修改/新文件，但账本仍写 `task_state=todo`。未勾 done 是正确的，但生命周期应同步为 `in_progress`。

### 4. 五个 done Task 缺直接 evidence 路径

N0.2、N0.3、N0.4、N1.6、N2.1 只有 ledger prose/closeout 间接证据，没有完全满足字面要求的独立 evidence 路径。

这些问题主要是文档收口，不是代码返工；预计 5–15 分钟可以对账修正。但在“严格按规范”口径下必须修，不能假装不存在。

## 九、后续所有 Track 都会像 N1 一样花 4 小时吗

不会每个 Task 都花 4 小时；历史数据已经证明：

- N0 普通 Task 多数 11–38 分钟；
- N2.1 约 6 分钟；
- N1.3 约 51 分钟；
- N1.2/N1.4 这类重数据 Task 接近 1 小时。

但还剩 36 个 Task。即使平均每个只花 15–25 分钟，也有 9–15 小时实现量，且 N4/N5/N7 不是轻量 Task。

剩余风险最大的不是 N2.2，而是：

- N2.3：幂等、receipt、attempt fence 和 DAG；
- N4：normalizer、G1–G10、compiler、sandbox、HyperFrames provider；
- N5：TTS/ASR、字幕、混音、拼接、ffprobe/decode；
- N6：Pencil editor 必须真实打开；
- N7：一次 live FABRICATE、最终 MP4、像素、浏览器、恢复与交付证据。

严格执行全部 48 Task、每 Track 完整 Tier B、N7 完整 Tier C，无法负责任地承诺一定在剩余 15 小时内结束。

但是按你指定的黑客松“最小可运行”策略：

- 每 Task 只跑 focused/basic test；
- typecheck、相关 lint、UTF-8/secret gate 保留；
- 浏览器/完整 UI E2E 留给你最终手测；
- 不做 Trigger.dev 登录和云端 live run；
- 不重复消耗付费模型；
- 全量 test/build 集中在关键 Track closeout 或最终阶段；
- 优先闭合一条真实主链，次要恢复/异常矩阵后置；

那么最小可运行版本仍有机会在 15 小时内完成。

比较现实的激进时间预算是：

| 阶段 | 预计 |
|---|---:|
| 修账本 + 完成 N2.2 | 0.5–0.8h |
| N2.3–N2.6 | 1.5–2.5h |
| N3 最小 Pi 主链 | 1.5–2.5h |
| N4 compiler + HyperFrames 主链 | 2–3h |
| N5 最小 media/compose | 1.5–2.5h |
| N6 最小真实 UI | 1–1.5h |
| N7 集中 smoke/交付检查 | 1–2h |
| 风险缓冲 | 1–2h |

即大约 10–15 小时。前提是没有新的依赖安装、Pencil、FFmpeg、provider credential 或旧数据兼容阻塞。

## 十、接下来最快且不失真的推进顺序

恢复施工后应立即：

1. 用 5–15 分钟补 N1 closeout、同步顶部 Track 状态，并把 N2.2 标为 in_progress；
2. 创建六个 task shell，重写 pipeline-run；
3. 补 queue/retry/abort/root stream writer 守卫；
4. 让 16 个 focused tests 全绿；
5. 精确 stage N2.2，创建本地 Task commit；
6. 立即进入 N2.3，不再重复完整浏览器 E2E；
7. N2 收口后直接推进 N3–N5 的唯一最小主链；
8. UI 和最终人工端测集中在后段。

你补充的 IMAP/注册凭据目前没有写入仓库、没有回显或进入日志。它们属于真实邮箱注册验证资料，不是 Postgres 连接串；等后续确实需要本地自助注册或迁移目标账号时再临时使用。当前 N2 不依赖它们。

最准确的一句话总结是：**重型数据库基础和真实迁移已经完成；当前正式进度 25%，N2.2 约完成一半，但新 v3 视频工作流尚未闭环。N1.3 实际约 51 分钟，4 小时是整个 N1，不是单项卡死。**