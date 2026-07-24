---
doc_id: CVC-HARNESS-V3
version: 3.0.0
status: active
effective_date: 2026-07-24
normative_scope: codex-goal-execution
supersedes:
  - CVC-AI-DEVELOPMENT-HARNESS-2026-07-23
depends_on:
  - CVC-PRODUCT-V3@3.0.0
  - CVC-ARCH-V3@3.0.0
---

# CodeVideoCanvas Codex Goal Harness v3

## 0. 目的

本 Harness 把 N0–N7 从“架构愿景”变成 Codex 可持续施工的协议。它约束：

- 何时允许开工；
- 一次 Goal 的范围；
- Task 如何执行、验证和提交；
- 何种证据才能标记完成；
- 如何保护中文、密钥、用户工作树和真实像素；
- 如何避免任务账本再次漂移。

---

## 1. 读取顺序

每个 Goal 开始必须完整读取：

1. 根 `AGENTS.md`；
2. `CVC-PRODUCT-V3`；
3. `CVC-ARCH-V3`；
4. 本 Harness；
5. `CVC-TASKS-V3` 的当前 Track；
6. 对应 `docs/issues/refactor-v3/issue-n*.md`；
7. Task 明确列出的源码、测试、设计源和 ADR。

如果任意两份活动规范冲突，登记 `DOC-CONFLICT`，停止受影响施工。禁止按文件日期、
篇幅或个人偏好自行裁决。

---

## 2. 核心施工原则

### `HAR-PRINCIPLE-001` Spec first

每项代码修改必须能指向 Product requirement、Architecture rule 和 Task ID。

### `HAR-PRINCIPLE-002` Evidence first

文档勾选、agent 报告和“看起来正确”都不是证据。完成声明前运行对应命令并读取结果。

### `HAR-PRINCIPLE-003` Small boundaries

一个 Task 只交付一个可验证结果；文件按职责拆分；不进行与 Task 无关的清理。

### `HAR-PRINCIPLE-004` Replace, do not stack

新架构接管后删除旧路径。禁止为了保险长期保留双数据库、双 queue、双 Agent Runtime、
双 source 主通道或双帧时钟。

### `HAR-PRINCIPLE-005` Preserve user work

施工前检查完整 worktree；不覆盖、删除、移动不属于本 Task 的修改。发现重叠时停下并
协调。

---

## 3. Goal / Track / Task 模型

### 3.1 一次 Goal = 一个 Track

默认一次 Codex Goal 完成 N0–N7 中一个 Track 的全部 Task。Task 不是独立 Goal。

只有 Task Breakdown 预先定义的 Track Segment 才能拆成多个 Goal。执行中觉得“太大”
不能自行拆分或跳过；先修改 Task Breakdown 并取得确认。

### 3.2 Goal 不自动串联

一个 Track 完成后 Goal 结束。下一个 Track 必须重新读取规范、检查基线并启动新 Goal。

### 3.3 Track 状态

```text
blocked → ready → in_progress → done
                    └────────→ blocked
ready/in_progress → superseded
```

只有 `CVC-TASKS-V3` 可以修改状态。

### 3.4 Task 状态

```text
todo → in_progress → done
                    → blocked
todo/in_progress → superseded
```

`done` 需要验收证据和本地 commit。Issue 文件记录细节和证据链接，不独立维护另一份
状态汇总。

---

## 4. Goal 开工门禁

### `HAR-PREFLIGHT-001` 文档

- Track 为 `ready`；
- 所有依赖 Track 为 `done`；
- Product/Architecture/Harness 版本与 Task Breakdown 一致；
- 对应 Issue 无未决架构选择；
- 没有活动 `DOC-CONFLICT`。

### `HAR-PREFLIGHT-002` Git

运行：

```powershell
git status --short --branch
git log -5 --oneline
git diff --stat
git diff --cached --stat
```

记录：

- branch；
- baseline commit；
- 已存在修改的归属；
- 是否需要 feature branch/worktree。

未经用户授权不 push、不建 PR。进入代码 Track 时按仓库 Git 规范使用
`feature/refactor-n<track>-<name>`；如果用户明确要求在当前分支施工，记录该授权。

### `HAR-PREFLIGHT-003` 环境

按 Task 需要运行：

```powershell
node --version
pnpm --version
docker version
docker compose version
```

外部服务/Key 只检查变量存在性和脱敏连通结果，不输出原值。

### `HAR-PREFLIGHT-004` 基线

至少运行：

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

若 Track Issue 指定更窄的 baseline，可先运行窄检查，但开始高风险迁移前必须有一次完整
基线。基线失败时先判断是否属于当前 Task；不得越界修复无关失败。

---

## 5. Task 执行循环

每个 Task 按以下固定循环：

1. 将 Task 标为 `in_progress`；
2. 重新确认 allowed/prohibited scope；
3. 读取涉及文件和邻近测试；
4. 写一个能证明需求的失败测试；
5. 运行该测试并确认因缺少目标行为失败；
6. 写最小实现；
7. 运行定向测试；
8. 检查 diff、依赖方向、中文、密钥和 generated file；
9. 运行 Task-Light gate；
10. 更新完成证据；
11. 精确 stage 当前 Task 文件；
12. `git diff --cached --check`；
13. 本地 Conventional Commit；
14. 将 Task 标为 `done` 并记录 commit；
15. 开始下一 Task。

文档账本与代码应处于同一 Task commit，或紧随其后的同 Track docs commit；不得积压到
Track 末尾一次性补勾。

---

## 6. TDD 规则

### `HAR-TDD-001`

新功能、Bug、状态迁移、schema constraint、normalizer/gate、compiler 和 repository
必须先有失败测试。

### `HAR-TDD-002`

测试必须验证行为，不允许只断言 mock 被调用。关键合同使用：

- success case；
- boundary case；
- explicit failure case；
- stale/cancel/retry case（适用时）。

### `HAR-TDD-003`

外部真实 API 不作为普通单元测试。使用 contract fake/recorded transcript；每 Track
按预算运行真实 smoke。

### `HAR-TDD-004`

像素/媒体功能的单元测试不能替代真实 snapshot/render/ffprobe。

---

## 7. 验收分层

### Tier 0：Spec/Scope Gate

每个 Task 开始：

- Requirement/Architecture/Task ID 存在；
- allowed/prohibited 明确；
- 无架构 open decision；
- 依赖满足。

### Tier A：Task-Light

每个 Task 完成：

- 定向 test；
- 相关 typecheck/lint；
- source/contract scan；
- `git diff --check`；
- U+FFFD scan；
- secret scan（涉及配置/日志时）。

### Tier B：Track Integration

Track 结束：

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

再运行 Track 专项：

- N0：旧闭环 + transcript；
- N1：fresh PG/migration/import；
- N2：Trigger dev/retry/cancel/realtime；
- N3：Pi/provider/model/terminal Tool；
- N4：HF check/seek/pixel/hash；
- N5：ffprobe/三轨/decode；
- N6：Pencil/Playbook/browser/field-source；
- N7：真实全链路与 30 项矩阵。

### Tier C：Release/User-facing

只有 N7 或用户明确要求 release 时执行：

- 真实浏览器流程；
- 真实模型调用；
- 真实 render；
- 最终 MP4；
- ffprobe/ffmpeg decode；
- golden frame/contact sheet；
- migration/restore；
- delivery report。

---

## 8. 真实 AI/API 预算

### `HAR-AI-001`

默认每个涉及模型的 Track 最多：

- StepFun 1 次真实成功 smoke；
- Gemini 1 次真实成功 smoke（有配置时）；
- 额外调用必须由失败定位确有必要。

禁止“100 次调用”成为默认 Task gate。可靠性 soak 是单独、有预算的测试，不混入普通
重构。

### `HAR-AI-002`

报告必须区分：

- transport/key 配置成功；
- structured Tool 成功；
- 完整业务 workflow 成功；
- deterministic fixture 成功。

不得把前一层证据描述成后一层。

### `HAR-AI-003`

日志和回复只允许写变量名、provider/model、HTTP 状态和脱敏错误。Key 原文不得进入
文件、commit、终端摘要或对话。

---

## 9. v3 专项门禁

### N1 Postgres

- Docker health；
- tracked migration；
- constraints；
- async repository；
- SQLite backup/import reconciliation；
- runtime SQLite import 为 0。

### N2 Trigger

- 七 task ID；
- Result `ok` 检查；
- idempotency/fingerprint；
- attempt fence；
- cancel/cleanup；
- Realtime token；
- 旧 queue/stream import 为 0。

### N3 Pi

- 仅 runner import `Agent`；
- 四 `AiTaskKind`；
- terminal Tool single-call；
- safe trace 不含 reasoning；
- direct OpenAI client 为 0；
- model setting 与 invocation 一致。

### N4 Compiler/HyperFrames

- normalizer matrix；
- security/determinism negative cases；
- byte deterministic bundle；
- HF check；
- random seek；
- same-frame hash；
- ffprobe/entity hash。

### N5 Compose

- voice/SFX/BGM/subtitle manifests；
- missing required track 失败；
- final duration/size/streams；
- decode；
- temp cleanup。

### N6 UI

- Pencil MCP 读取真源；
- reusable components；
- Playbook demos；
- browser fields；
- no fake values；
- line/import governance。

### N7 Cutover

- workflowVersion；
- full E2E；
- migration/restore；
- cancel/retry/crash；
- prohibited dependencies；
- legacy removal；
- acceptance matrix。

---

## 10. 多代理与并行

### `HAR-PAR-001`

只有无共享可变状态、文件范围不重叠的 Task 可以并行。

### `HAR-PAR-002` 必须串行的资源

- `package.json` / lockfile；
- Drizzle schema/migrations；
- `trigger.config.ts` / queues/task IDs；
- contracts public types；
- `canvas.pen`；
- Playbook registry；
- Product/Architecture/Harness/Task Breakdown；
- Git stage/commit。

### `HAR-PAR-003`

根代理是唯一 ledger 更新者和 commit owner。子代理默认只读分析；允许写时必须分配精确
路径，并在完成后由根代理读取 diff、运行验证。

### `HAR-PAR-004`

并行 Task 发现需要修改共享合同，立即停止相关写入，交给 integration owner 先提交
合同，再恢复消费方。

---

## 11. 文件与编码

### `HAR-FILE-001`

本地手工编辑使用 `apply_patch`；格式化/生成器可机械修改。不得用临时 shell 写法覆盖
用户文件。

### `HAR-FILE-002`

中文文件始终 UTF-8。Task/Track 结束扫描：

```powershell
rg -n --fixed-strings ([string][char]0xFFFD) AGENTS.md README.md docs src
```

`.pen` 文件只允许 Pencil MCP 访问，不用 shell Read/Grep。

### `HAR-FILE-003`

不手改 lockfile；依赖变更使用 pnpm 命令，并仅在 Task 明确授权时执行。

### `HAR-FILE-004`

删除/移动前解析绝对路径并确认 Task 授权。禁止 broad recursive delete、reset hard 和
checkout 丢弃用户改动。

---

## 12. Git 与 commit

### `HAR-GIT-001`

每个可独立验证的 Task 或明确文档阶段创建本地 commit。消息使用 Conventional Commits：

```text
feat(db): add workspace-scoped postgres schema
feat(orchestration): add trigger pipeline tasks
refactor(ai): route structured tasks through pi
docs(harness): define refactor v3 goal tracks
```

### `HAR-GIT-002`

stage 只使用精确文件：

```powershell
git add -- path/a path/b
git diff --cached --check
git diff --cached --stat
```

不使用 `git add -A` 吞入其他会话或用户产物。

### `HAR-GIT-003`

未经明确授权不 push、不创建 PR、不 force push。

### `HAR-GIT-004`

Commit body SHOULD 包含：

```text
Task: N3.2
Spec: CONTRACT-AI-002..006
Evidence: pnpm test -- <focused files>
```

---

## 13. 范围外发现

发现范围外问题时：

1. 收集最小证据；
2. 不修改范围外文件；
3. 在当前 Issue “发现但未处理”记录；
4. 新建/补充后续 Task，写清依赖与影响；
5. 若阻塞当前完成条件，将 Task 标 `blocked`；
6. 若不阻塞，继续当前 Task；
7. 禁止为了让全量检查变绿而越界修复别人的 WIP。

---

## 14. 文档变更协议

### Product change

先更新 Product Spec requirement → Architecture trace → Task Breakdown → Issue。

### Architecture change

先 ADR → Architecture Spec → Task Breakdown → Issue → AGENTS 投影。

### Harness change

先 Harness → Task template/AGENTS 投影。不得改变已完成 Task 的历史完成条件。

### Completed Task

完成后条件和证据不可重写成另一项工作。新缺陷使用新 Task，并写 `supersedes` 或
`regression_of`。

### 状态

只有 Task Breakdown 维护当前状态。蓝图、Issue Index、updates 和报告只能引用。

---

## 15. Goal 启动模板

```text
Goal: 完成 CodeVideoCanvas Refactor v3 Track <N?>

Baseline:
- Branch: <branch>
- Commit: <sha>
- Product: CVC-PRODUCT-V3@3.0.0
- Architecture: CVC-ARCH-V3@3.0.0
- Harness: CVC-HARNESS-V3@3.0.0

Read first:
1. AGENTS.md
2. docs/specs/2026-07-24-refactor-v3-product-spec.md
3. docs/specs/2026-07-24-refactor-v3-architecture-spec.md
4. docs/specs/2026-07-24-refactor-v3-codex-harness.md
5. docs/specs/2026-07-24-refactor-v3-task-breakdown.md Track <N?>
6. docs/issues/refactor-v3/issue-<n?>-<name>.md

Scope:
- Execute all Task cards in Track order.
- Follow each card's allowed/prohibited files.
- Commit each completed Task or explicit phase locally.
- Do not push.

Exit:
- All Track tasks done with commit/evidence.
- Tier B and Track-specific gate pass.
- Task Breakdown and Issue evidence synchronized.
```

实际 prompt 填入真实 branch/sha，不使用占位文本启动 Goal。

---

## 16. Track closeout 报告

必须包含：

1. Track/Task 列表与 commit SHA；
2. 规范 ID 覆盖；
3. 变更文件和公开合同；
4. focused/Tier B 命令、退出码和测试数量；
5. 真实 API/像素/媒体证据及其边界；
6. U+FFFD/secret/prohibited import 扫描；
7. 未解决风险；
8. Task Breakdown 最终状态；
9. worktree 状态；
10. 是否 push（默认否）。

---

## 17. Blocked 规则

以下情况阻塞 Task/Track：

- 需要改变已接受架构但无 ADR；
- 必需 secret/外部服务不可用且无合法 fake 能完成退出门；
- 用户工作树与 allowed scope 冲突且无法安全隔离；
- 三次连续 Goal turn 遇到同一外部阻塞，无法继续有意义工作；
- 关键验收无法产生真实证据。

“工作量大”“测试慢”“需要更多分析”不是 blocked。能推进独立 Task 时继续推进。
