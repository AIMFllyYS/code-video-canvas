# Track N2 Trigger Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Trigger.dev 成为唯一异步编排器，以七个稳定 task、全局幂等、PG checkpoint/attempt fence 和 Snapshot-first Realtime 构成可取消、可重试、可恢复的项目执行闭环。

**Architecture:** Trigger task 只做 payload parse、execution context、application service 调用、child Result 检查和稳定 output 映射；PG 的 `task_attempts` 是步骤 checkpoint/terminal 真源，`pipeline_runs` 是聚合真源，`canvas_nodes` 只是在 attempt/artifact 同一事务中更新的可重建投影。Trigger status/typed stream 只服务 transport/live view，绝不写业务终态。Pi 仍是唯一 Agent；N2 复用 N1 后的现有 Director/media/render application service，不引入新模型 runtime。

**Tech Stack:** Trigger.dev 4.5.7、Postgres 17/Drizzle、Next.js 16 Route Handlers、React 19、`@trigger.dev/react-hooks`、Zod、Vitest、TypeScript strict、PowerShell、pnpm 9

---

## 规范与施工边界

- 需求：`PROD-RUN-001..007`、`PROD-UI-001..004`。
- 架构：`EXEC-STATE-001..003`、`EXEC-DAG-001..005`、
  `EXEC-CMD-001..004`、`EXEC-TRIGGER-001..007`、`CONTRACT-RUN-001..003`、
  `DATA-004..005`、`TEST-001..003`。
- N2 不重写 Pi provider/model 合同、HyperFrames compiler、媒体 provider 或 Pencil
  视觉；它们分别属于 N3、N4、N5、N6。
- 每个 Task 开始前执行 Harness Git preflight；每个 Task 只 stage 自己的精确路径并
  本地 Conventional Commit，不 push。
- `.env*` 只允许服务端运行时读取，禁止 stage、回显或写入 evidence；Trigger
  token、provider Key 与 storage path 都不是 typed progress。
- 本 Issue 的 checkbox 是实施步骤；唯一状态账本仍是
  `docs/specs/2026-07-24-refactor-v3-task-breakdown.md`。

## 不可变任务图

活动 task ID 必须恰好为：

```text
cvc.pipeline.run
cvc.project.plan
cvc.shot.generate
cvc.shot.media
cvc.shot.render
cvc.shot.qa
cvc.project.compose
```

依赖图固定为：

```text
cvc.pipeline.run
  -> cvc.project.plan
       -> cvc.shot.generate
            -> cvc.shot.media ----------------\
            -> cvc.shot.render -> cvc.shot.qa +-> cvc.project.compose
```

`cvc.shot.media` 必须消费 `cvc.shot.generate` 已提交的 `ShotSpecV1` checkpoint；
generate 后 media/render 可并行；compose 必须同时等待所有可用 Shot 的 media 与
QA。禁止恢复旧六阶段 task ID、让 `cvc.project.plan` 直接喂 media、或增加第八个活动
pipeline task。

固定队列：

| Queue | Trigger name | concurrencyLimit |
|---|---|---:|
| AI | `cvc-ai` | 2 |
| Render | `cvc-render` | 1 |
| Media | `cvc-media` | 2 |
| Compose | `cvc-compose` | 1 |

状态所有权：

| 状态 | 唯一持久化写入者 |
|---|---|
| attempt checkpoint/terminal | task application service 的 PG CAS transaction |
| pipeline aggregate | pipeline application service 的 PG transaction |
| node projection | 与 attempt/artifact commit 相同的 PG transaction |
| Trigger run/live/typed progress | Trigger runtime；只读 overlay |

<a id="task-n21"></a>

### Task N2.1: 固定 Trigger config、队列、tags 与 typed stream

**Dependencies:** N1.5 Trigger canary、N1.6 Postgres-only runtime。

**Files:**

- Create: `trigger/queues.ts`
- Create: `trigger/streams.ts`
- Create: `src/features/pipeline/contracts/task-ids.ts`
- Create: `src/features/pipeline/contracts/status.ts`
- Create: `src/features/pipeline/contracts/task-payload.ts`
- Create: `src/features/pipeline/contracts/task-result.ts`
- Create: `src/features/pipeline/contracts/progress.ts`
- Create: `src/features/pipeline/contracts/failure.ts`
- Create: `src/features/pipeline/contracts/tags.ts`
- Create: `src/features/pipeline/contracts/contracts.test.ts`
- Modify: `trigger.config.ts`
- Modify: `trigger/tasks/pipeline-run.ts`
- Modify: `scripts/spikes/trigger-realtime-probe.ts`
- Prohibited: 新 queue 名、按 Shot 动态建 queue、raw model delta/reasoning stream
- Prohibited: Trigger metadata 持久化为业务事实、创建 `run_events`

- [ ] **Step 1: 写精确 task/queue/tag/progress 的失败测试**

`contracts.test.ts` 必须断言：

- `CVC_TASK_IDS` 深相等上面的七个字符串，唯一且无多余项；
- queue config 恰好四个，name/concurrency 与表格一致；
- shot task tags 恰好包含
  `workspace:`、`project:`、`pipeline:`、`shot:` 加各自经过验证的真实 UUID；
- project task tags 不含伪造 shot tag；
- safe progress 只允许
  `queued|started|checkpoint|completed|failed|cancelled` phase、0–100 整数
  progress、稳定 issue code 与最多 240 字用户消息；
- progress schema 拒绝 `rawDelta`、`reasoning`、`apiKey`、`storagePath`；
- node/run/attempt statuses 恰好为架构锁定集合。

Run: `pnpm test -- src/features/pipeline/contracts/contracts.test.ts`

Expected: FAIL，错误包含缺失的 contracts/queues/streams module。

- [ ] **Step 2: 实现稳定 contracts**

状态常量固定：

```ts
export const NODE_EXECUTION_STATUSES = [
  'idle', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'stale',
] as const
export const PIPELINE_RUN_STATUSES = [
  'triggering', 'queued', 'running', 'succeeded', 'failed', 'cancelled',
] as const
export const TASK_ATTEMPT_STATUSES = [
  'queued', 'running', 'succeeded', 'failed', 'cancelled', 'superseded',
] as const
```

所有 task payload 包含：

```ts
{
  schemaVersion: 1
  workspaceId: string
  projectId: string
  pipelineRunId: string
  attemptId: string
  fingerprint: string
  workflowVersion: string
  entity: { type: 'project' | 'shot'; id: string }
}
```

shot payload 额外含 `shotId`，但不得传本机路径、provider secret 或完整 artifact
内容。`TaskResultV1` 固定包含 schemaVersion、taskId、pipelineRunId、attemptId、
outcome (`completed|checkpoint-reused`)、artifactIds、checkpointHash；失败通过稳定
typed error 抛出，由 Trigger `Result` 捕获，不用 `{ok:false}` 冒充成功 output。

- [ ] **Step 3: 实现四个静态 queue、typed stream 与显式 tags**

`trigger/queues.ts` 只创建表格中的四个 `queue()`；`trigger/streams.ts` 只定义
`cvc.pipeline.progress.v1` typed stream，写入前必须以
`SafeProgressEventV1Schema` parse。`buildTaskTags()` 对 UUID 进行 Zod parse，
project task 返回三 tag，shot task返回四 tag；禁止把 script、prompt、artifact
payload 放入 tag。

`trigger.config.ts` 保持 `dirs: ['./trigger']` 和 N1 已验证配置，只增加 N2 所需
build/runtime 配置；不得运行数据库 migration。

N1 Realtime probe 必须同步改为消费新的 `TaskPayloadV1`、`TaskResultV1` 与
`cvc.pipeline.progress.v1`，不得为了兼容 probe 保留第二个旧 stream 或旧 probe-only
payload；用户已豁免云端实跑时只要求 typecheck/static gate，不伪造运行 evidence。

- [ ] **Step 4: 运行 GREEN 与静态泄漏扫描**

Run:

```powershell
pnpm test -- src/features/pipeline/contracts/contracts.test.ts
rg -n "rawDelta|reasoning|apiKey|storagePath|run_events" trigger src/features/pipeline
pnpm typecheck
```

Expected: tests/typecheck 0；scan 只允许出现在拒绝字段的测试断言，不得出现在
stream payload、tags 或生产 contract。

- [ ] **Step 5: Task-Light 检查并本地提交**

Run:

```powershell
pnpm eslint trigger.config.ts trigger/queues.ts trigger/streams.ts src/features/pipeline/contracts
git diff --check
git add -- trigger.config.ts trigger/tasks/pipeline-run.ts trigger/queues.ts trigger/streams.ts scripts/spikes/trigger-realtime-probe.ts src/features/pipeline/contracts
git diff --cached --check
git commit -m "feat(orchestration): define Trigger execution contracts"
```

Expected: commit 只含 contracts/config；无业务编排、DB schema 或 Key。

**N2.1 exit gate:** 七个 task ID、三组状态、四队列、tag shape 与 safe typed stream
均由测试锁死；Trigger config 不自动迁移 PG；无 raw delta 或业务真源漂移。

<a id="task-n22"></a>

### Task N2.2: 实现七个薄 task shell 与 application service 边界

**Dependencies:** N2.1。

**Files:**

- Modify: `trigger/tasks/pipeline-run.ts`
- Create: `trigger/tasks/project-plan.ts`
- Create: `trigger/tasks/shot-generate.ts`
- Create: `trigger/tasks/shot-media.ts`
- Create: `trigger/tasks/shot-render.ts`
- Create: `trigger/tasks/shot-qa.ts`
- Create: `trigger/tasks/project-compose.ts`
- Create: `src/features/pipeline/contracts/task-source-boundary.test.ts`
- Create: `src/features/pipeline/execution-context.ts`
- Create: `src/features/pipeline/progress/progress-sink.ts`
- Create: `src/features/pipeline/services/pipeline-run-service.ts`
- Create: `src/features/pipeline/services/project-plan-service.ts`
- Create: `src/features/pipeline/services/shot-generate-service.ts`
- Create: `src/features/pipeline/services/shot-media-service.ts`
- Create: `src/features/pipeline/services/shot-render-service.ts`
- Create: `src/features/pipeline/services/shot-qa-service.ts`
- Create: `src/features/pipeline/services/project-compose-service.ts`
- Create: `src/features/pipeline/services/service-contract.test.ts`
- Modify: `src/features/director/stage-runner.ts`
- Modify: `src/features/audio/runtime-repository.ts`
- Modify: `src/features/render/renderer.ts`
- Modify: `src/features/render/qa-check.ts`
- Modify: `src/features/render/export-service.ts`
- Prohibited in `trigger/tasks/**`: Drizzle/schema import、prompt 文本、source parser、
  FFmpeg 参数、StorageAdapter 路径、UI DTO
- Prohibited: OpenAI Agents SDK、第二 Agent、把 TTS/ASR 交给 Pi

- [ ] **Step 1: 写薄 task source guard 与 service contract 的失败测试**

`task-source-boundary.test.ts` 读取七个 task 源文件并断言：

- `task({ id })` 的 ID set 恰好等于 `CVC_TASK_IDS`；
- task file 只能 import `@trigger.dev/sdk`、contracts、queues/streams、execution
  context 和对应 application service；
- 禁止包含 `drizzle-orm`、`@/lib/db`、`prompt`、`parse5`、`ffmpeg`、
  `StorageAdapter`、`openai`；
- 每个 task 先 parse payload，再构造 context，再调用一个 service，再 parse
  `TaskResultV1`；
- task body 不超过 50 行。

`service-contract.test.ts` 使用 fake ports 证明 signal、workspace/project/run/
attempt/shot context 完整向下传递，media service 只调用非 Agent speech/media
port。

Run:

```powershell
pnpm test -- src/features/pipeline/contracts/task-source-boundary.test.ts src/features/pipeline/services/service-contract.test.ts
```

Expected: 六个 task 文件与 services 尚不存在，测试 RED。

- [ ] **Step 2: 建 execution context 与可取消 progress sink**

`ExecutionContextV1` 固定包含 payload 中的可信 IDs、Trigger run ID、attempt ID、
workflow/fingerprint、`AbortSignal` 与 `ProgressSink`。`ProgressSink` 只接受 N2.1
safe event；service 不直接 import Trigger SDK。Task adapter 将 Trigger `signal` 与
typed stream writer 注入 context；下游 Pi、Playwright/HyperFrames、FFmpeg/media
调用必须接收同一 signal，所有 temp cleanup 留在各领域 `finally`，不能只依赖
`onCancel`。

- [ ] **Step 3: 用现有领域能力实现六个 service，保持 Pi 唯一 Agent**

职责固定：

- `project-plan-service`: 调现有 Pi Director 入口生成项目 plan/checkpoint；
- `shot-generate-service`: 调现有 Pi Director 入口生成 ShotSpec 与 shot source；
- `shot-media-service`: 调 audio/media application port，不构造 Agent；
- `shot-render-service`: 调 renderer application port；
- `shot-qa-service`: 调确定性 QA/vision QA application port；
- `project-compose-service`: 调 export/compose application port；
- `pipeline-run-service`: N2.2 仅保留 orchestration port，N2.3 实现图。

这些 service 才能组合 repository、Director、renderer、media；task shell 不得
下沉这些细节。N3/N4/N5 后续替换 service 内部 adapter，不改变 task ID/payload。
service 返回 `TaskResultV1` 所需的 artifact ID/checkpoint hash，绝不返回本机路径。

- [ ] **Step 4: 实现七个 task shell 与稳定错误映射**

每个 task 固定 queue：

- project.plan、shot.generate、shot.qa → `cvc-ai`；
- shot.media → `cvc-media`；
- shot.render → `cvc-render`；
- project.compose → `cvc-compose`；
- pipeline.run 只负责 orchestration，不占上述资源 queue。

可重试 network/429/timeout/worker crash 由 Trigger retry，最多 3 次；credential、
schema/semantic gate、stale attempt 使用稳定 error class，stale/cancel 抛
`AbortTaskRunError` 阻止自动 retry。每个 task 检查 application output schema。

- [ ] **Step 5: 运行 RED→GREEN 证明薄层与 signal 传播**

Run:

```powershell
pnpm test -- src/features/pipeline/contracts/task-source-boundary.test.ts src/features/pipeline/services/service-contract.test.ts
pnpm test -- src/features/director/stage-runner.test.ts src/features/render/renderer.test.ts src/features/render/qa-check.test.ts src/features/render/export-service.test.ts
pnpm typecheck
```

Expected: source guard、service fake-port、现有领域回归与 typecheck 全绿；七 task
无 prohibited import；取消 signal 到达所有长任务 port。

- [ ] **Step 6: Task-Light 检查并本地提交**

Run:

```powershell
pnpm eslint trigger/tasks src/features/pipeline src/features/director/stage-runner.ts src/features/audio/runtime-repository.ts src/features/render/renderer.ts src/features/render/qa-check.ts src/features/render/export-service.ts
git diff --check
git add -- trigger/tasks src/features/pipeline/execution-context.ts src/features/pipeline/progress src/features/pipeline/services src/features/director/stage-runner.ts src/features/audio/runtime-repository.ts src/features/render/renderer.ts src/features/render/qa-check.ts src/features/render/export-service.ts
git diff --cached --check
git commit -m "feat(orchestration): add seven thin Trigger tasks"
```

Expected: commit 只含七 task、application boundary 与必要 signal 改造。

**N2.2 exit gate:** 七个 task ID 一一对应七个薄 shell；所有业务逻辑留在
application service；Pi 是 plan/generate 唯一 Agent，media 零 Agent；取消 signal
贯穿领域调用。

<a id="task-n23"></a>

### Task N2.3: 实现 canonical fingerprint、全局幂等、DAG 与 attempt fence

**Dependencies:** N2.2。

**Files:**

- Create: `src/lib/canonical-json/v1.ts`
- Create: `src/lib/canonical-json/v1.test.ts`
- Create: `src/features/pipeline/idempotency/fingerprint.ts`
- Create: `src/features/pipeline/idempotency/fingerprint.test.ts`
- Create: `src/features/pipeline/idempotency/trigger-key.ts`
- Create: `src/features/pipeline/idempotency/trigger-key.test.ts`
- Create: `src/features/pipeline/repository/command-receipt-repository.ts`
- Create: `src/features/pipeline/repository/command-receipt-repository.pg.test.ts`
- Create: `src/features/pipeline/repository/pipeline-run-repository.ts`
- Create: `src/features/pipeline/repository/pipeline-run-repository.pg.test.ts`
- Create: `src/features/pipeline/repository/task-attempt-repository.ts`
- Create: `src/features/pipeline/repository/task-attempt-repository.pg.test.ts`
- Create: `src/features/pipeline/services/attempt-service.ts`
- Create: `src/features/pipeline/services/attempt-service.pg.test.ts`
- Create: `src/features/pipeline/services/orchestrator.test.ts`
- Modify: `src/features/pipeline/services/pipeline-run-service.ts`
- Modify: `trigger/tasks/pipeline-run.ts`
- Modify: `trigger/tasks/project-plan.ts`
- Modify: `trigger/tasks/shot-generate.ts`
- Modify: `trigger/tasks/shot-media.ts`
- Modify: `trigger/tasks/shot-render.ts`
- Modify: `trigger/tasks/shot-qa.ts`
- Modify: `trigger/tasks/project-compose.ts`
- Prohibited: plain `JSON.stringify(input)` 作为公共 fingerprint、默认幂等 scope
- Prohibited: `Promise.all(triggerAndWait(...))`、忽略任何 child `Result.ok`
- Prohibited: Trigger task/Realtime 独立写 node terminal 状态

- [ ] **Step 1: 写 canonical、receipt、attempt fence 与 DAG 的失败测试**

测试至少覆盖：

1. 不同对象 key 顺序与 Unicode 组合形式生成相同 canonical bytes/hash；
2. array 顺序保留，undefined/NaN/Infinity/cycle 被拒绝；
3. fingerprint 包含
   `canonicalizerVersion/workflowVersion/intent/taskId/workspace/entity/
   sortedInputArtifactHashes/compiler/schema pins`；
4. AI task 额外包含 model policy revision、resolved provider/model；media task
   额外包含 media route revision/provider/model；
5. 同 receipt key + 同 fingerprint replay；同 key + 不同 fingerprint 返回 409；
6. attempt_no 单调，旧 attempt commit 返回 `STALE_ATTEMPT` 且不写 artifact/node；
7. fingerprint/pins 相同才复用 checkpoint，成功 artifact 命中不再调用收费 port；
8. project.plan 后才 batch shot.generate；generate 成功后 media/render 异类并行；
   render 成功后 QA；compose 同时等待 media+QA；
9. 一个 Shot 失败不回滚已成功 sibling artifact，但 run 最终聚合为 failed；
10. 每个 child Result 的 `ok:false` 都进入稳定 failure，不被当成功 output。

Run:

```powershell
pnpm test -- src/lib/canonical-json/v1.test.ts src/features/pipeline/idempotency/fingerprint.test.ts src/features/pipeline/idempotency/trigger-key.test.ts src/features/pipeline/services/orchestrator.test.ts
pnpm vitest run --config vitest.pg.config.ts src/features/pipeline/repository/command-receipt-repository.pg.test.ts src/features/pipeline/repository/pipeline-run-repository.pg.test.ts src/features/pipeline/repository/task-attempt-repository.pg.test.ts src/features/pipeline/services/attempt-service.pg.test.ts
```

Expected: 缺实现导致 RED。

- [ ] **Step 2: 实现 versioned canonical JSON 与 fingerprint**

`canonicalizeV1()` 固定按 Unicode NFC、对象 key UTF-16 code unit 升序、JSON
number/string/boolean/null 规则输出 UTF-8 bytes；拒绝非 JSON 值。`sha256` 输出
lowercase 64-char hex。task key 固定由下列结构 canonicalize 后 hash：

```ts
{
  canonicalizerVersion: 'cvc-canonical-json-v1',
  workflowVersion,
  intent,
  taskId,
  workspaceId,
  entityType,
  entityId,
  inputArtifactHashes: [...hashes].sort(),
  modelPolicy: applicableModelPolicyOrNull,
  compilerPins: applicableCompilerPinsOrNull,
  schemaPins,
}
```

禁止依赖运行时对象插入顺序。所有任务调用
`idempotencyKeys.create(fingerprint, { scope: 'global' })`，并把返回 key 显式传给
Trigger call；禁止 SDK 默认 scope。

- [ ] **Step 3: 实现 attempt CAS 与状态所有权 transaction**

`AttemptService` 固定提供：

```ts
queueAttempt(input): Promise<QueuedAttemptV1>
startAttempt(attemptId, expectedRevision): Promise<RunningAttemptV1>
commitCheckpoint(inputWithAttemptIdAndRevision): Promise<CheckpointV1>
commitSuccess(inputWithAttemptIdAndRevision): Promise<TaskResultV1>
commitFailure(inputWithAttemptIdAndRevision): Promise<void>
cancelCurrentAttempts(runId): Promise<void>
```

每次 start/checkpoint/terminal 都用 `attempt_id + revision + expected status` CAS；
artifact insert、attempt checkpoint/terminal、node projection 在同一 PG transaction。
旧 attempt、被 cancel attempt 或 input changed 返回稳定 `STALE_ATTEMPT`，不写任何
业务数据。`pipeline_runs` 只由聚合 service 更新；Trigger status 不落业务 terminal。

- [ ] **Step 4: 按锁定 graph 实现 orchestration 与 Result 检查**

`pipeline-run-service.ts` 严格：

1. `projectPlanTask.triggerAndWait()`，检查 `Result.ok`；
2. 同类 Shot 生成使用 `shotGenerateTask.batchTriggerAndWait()`；
3. 对每个 generate 成功的 Shot，从已提交 ShotSpec checkpoint 构造
   shot.media/shot.render payload；
4. 异类并行使用 `batch.triggerByTaskAndWait()`，禁止 `Promise.all()`；
5. 只对 render 成功的 Shot batch QA；
6. 等待每个可合成 Shot 的 media 与 QA 成功，再触发 project.compose；
7. 检查所有 Result；保留 sibling 成功结果，记录 per-shot failure；
8. 以 PG aggregate transaction 写 run succeeded/failed/cancelled。

每个 child 触发前先 queue attempt 并创建 global key；payload 的 attemptId/
fingerprint 与 PG 一致。progress stream 可报告安全聚合进度，但不能写终态。

- [ ] **Step 5: 运行 GREEN 与禁止模式扫描**

Run:

```powershell
pnpm test -- src/lib/canonical-json/v1.test.ts src/features/pipeline/idempotency src/features/pipeline/services/orchestrator.test.ts
pnpm vitest run --config vitest.pg.config.ts src/features/pipeline/repository src/features/pipeline/services/attempt-service.pg.test.ts
rg -n "Promise\\.all\\([^\\n]*triggerAndWait|idempotencyKeys\\.create\\([^\\n]*\\)" trigger src/features/pipeline
pnpm typecheck
```

Expected: tests/typecheck 全绿；没有 `Promise.all(triggerAndWait)`；每个
`idempotencyKeys.create` 调用都可人工看到 `{ scope: 'global' }`；attempt fence
stale test 不产生 artifact/node 变化。

- [ ] **Step 6: Task-Light 检查并本地提交**

Run:

```powershell
pnpm eslint src/lib/canonical-json src/features/pipeline trigger/tasks
git diff --check
git add -- src/lib/canonical-json src/features/pipeline/idempotency src/features/pipeline/repository src/features/pipeline/services/attempt-service.ts src/features/pipeline/services/attempt-service.pg.test.ts src/features/pipeline/services/orchestrator.test.ts src/features/pipeline/services/pipeline-run-service.ts trigger/tasks
git diff --cached --check
git commit -m "feat(orchestration): add idempotent fenced pipeline DAG"
```

Expected: commit 不含 API/UI/legacy deletes；canonical、DAG、CAS tests 随源码提交。

**N2.3 exit gate:** 锁定 graph 在 Result-aware batch API 上执行；所有 root/child key
显式 global；receipt replay/conflict、checkpoint reuse、stale publish rejection 与
one-shot failure 均有测试；PG 状态所有权未漂移。

<a id="task-n24"></a>

### Task N2.4: 建 start/cancel/retry API 与 run-scoped Realtime token

**Dependencies:** N2.3。

**Files:**

- Create: `src/features/pipeline/commands/start-run.ts`
- Create: `src/features/pipeline/commands/start-run.pg.test.ts`
- Create: `src/features/pipeline/commands/cancel-run.ts`
- Create: `src/features/pipeline/commands/cancel-run.pg.test.ts`
- Create: `src/features/pipeline/commands/retry-run.ts`
- Create: `src/features/pipeline/commands/retry-run.pg.test.ts`
- Create: `src/features/pipeline/commands/create-run-token.ts`
- Create: `src/features/pipeline/commands/create-run-token.test.ts`
- Create: `src/features/workspaces/server-workspace-context.ts`
- Create: `src/app/api/runs/route.ts`
- Create: `src/app/api/runs/route.test.ts`
- Create: `src/app/api/runs/[id]/route.ts`
- Create: `src/app/api/runs/[id]/route.test.ts`
- Create: `src/app/api/runs/[id]/cancel/route.ts`
- Create: `src/app/api/runs/[id]/cancel/route.test.ts`
- Create: `src/app/api/runs/[id]/retry/route.ts`
- Create: `src/app/api/runs/[id]/retry/route.test.ts`
- Create: `src/app/api/runs/[id]/token/route.ts`
- Create: `src/app/api/runs/[id]/token/route.test.ts`
- Create: `scripts/verify/trigger-pipeline-smoke.ts`
- Prohibited: 从 request body 信任 workspaceId/triggerRunId、返回 StorageAdapter key
- Prohibited: wildcard public token、无期限 token、重写旧 attempt

- [ ] **Step 1: 写两阶段启动、replay/conflict、cancel/retry/token 的失败测试**

测试固定：

- `POST /api/runs` 缺 `Idempotency-Key` → 400；
- workspace 由 `server-workspace-context` 注入，body 中额外 workspace 字段 → 400；
- 第一事务同时插入 receipt 与 `pipeline_runs(triggering)`；
- crash 在 Trigger 调用后、回写前；同 key 重试命中同 global Trigger key 并补写
  handle，不创建第二 run；
- 同 key 同 fingerprint → 200 replay；同 key 不同 fingerprint → 409；
- Trigger trigger 失败后 receipt/run 保留可恢复 failure，不悬挂未解释状态；
- cancel 调 `runs.cancel(triggerRunId)`，再由 PG CAS 将当前 attempts/run/node
  projection 事务性 cancelled；旧 worker commit 被 fence；
- retry 新建递增 attempt，旧 attempt 保持 terminal；只在 fingerprint/workflow/
  compiler/schema pins 相等时复用 checkpoint；
- token 调
  `auth.createPublicToken({ scopes: { read: { runs: [triggerRunId] } },
  expirationTime: '15m' })`，不含 write/admin/tag wildcard。

Run:

```powershell
pnpm test -- src/app/api/runs src/features/pipeline/commands/create-run-token.test.ts
pnpm vitest run --config vitest.pg.config.ts src/features/pipeline/commands/start-run.pg.test.ts src/features/pipeline/commands/cancel-run.pg.test.ts src/features/pipeline/commands/retry-run.pg.test.ts
```

Expected: routes/commands 尚不存在，测试 RED。

- [ ] **Step 2: 实现两阶段 start 与 crash recovery**

POST body 固定：

```ts
{
  schemaVersion: 1
  projectId: string
  intent: 'run' | 'regenerate' | 'rerender'
  shotId?: string
}
```

执行顺序：

1. await server workspace context，验证 project/intent/ownership；
2. canonical fingerprint；
3. PG transaction 插入 receipt + run `triggering`；
4. `idempotencyKeys.create(receiptFingerprint, {scope:'global'})`；
5. 触发 `cvc.pipeline.run`，显式 tags/global key；
6. PG transaction 回写 Trigger run ID、run `queued`、receipt result。

reconciler path 处理第 4/5 步后 crash：相同 receipt 查同 global key/run 并补写，
禁止生成第二业务 run。相同 key + 不同 fingerprint 映射稳定
`IDEMPOTENCY_CONFLICT` 409。

- [ ] **Step 3: 实现 cancel、retry、GET 与 scoped token**

所有 `[id]` route 必须 `await params`。GET 只返回 run command DTO，不返回 Trigger
内部 payload/secret/path。Cancel 先验证 workspace ownership，调用
`runs.cancel`；成功后 PG transaction cancel 当前 attempt/run/node projection，
CAS 阻止迟到 commit。Retry 复用原 command intent/可信实体，创建新 receipt key
要求客户端新 `Idempotency-Key`，并按 N2.3 checkpoint 规则新建 attempt。

Token route 只接受拥有的、已有 `triggerRunId` 的 run，生成 15 分钟 read-only
run-scoped token；响应仅 `{accessToken,expiresAt,triggerRunId}`。

- [ ] **Step 4: 运行 GREEN 与 API 信息泄漏测试**

Run:

```powershell
pnpm test -- src/app/api/runs src/features/pipeline/commands/create-run-token.test.ts
pnpm vitest run --config vitest.pg.config.ts src/features/pipeline/commands
rg -n "storageKey|storagePath|absolutePath|apiKey|ciphertext" src/app/api/runs src/features/pipeline/commands
pnpm typecheck
```

Expected: tests/typecheck 0；泄漏 scan 只允许拒绝字段测试，不在 response builder。

- [ ] **Step 5: Task-Light 检查并本地提交**

Run:

```powershell
pnpm eslint src/app/api/runs src/features/pipeline/commands src/features/workspaces/server-workspace-context.ts scripts/verify/trigger-pipeline-smoke.ts
git diff --check
git add -- src/app/api/runs src/features/pipeline/commands src/features/workspaces/server-workspace-context.ts scripts/verify/trigger-pipeline-smoke.ts
git diff --cached --check
git commit -m "feat(api): add idempotent pipeline run commands"
```

Expected: commit 只含 run command/API/smoke harness；无旧 route 删除。

**N2.4 exit gate:** start 两阶段与 crash replay 可恢复；同 key/different payload
稳定 409；cancel/retry 尊重 attempt fence；Realtime token 只读、run-scoped、15 分钟；
API 不信任 workspace/Trigger ID 或暴露路径。

<a id="task-n25"></a>

### Task N2.5: 实现 ProjectRunSnapshotV1 与 Snapshot-first Realtime

**Dependencies:** N2.4。

**Files:**

- Create: `src/features/pipeline/snapshot/project-run-snapshot.ts`
- Create: `src/features/pipeline/snapshot/project-run-snapshot.pg.test.ts`
- Create: `src/features/pipeline/snapshot/types.ts`
- Create: `src/features/pipeline/snapshot/field-source-matrix.md`
- Create: `src/app/api/projects/[id]/run-snapshot/route.ts`
- Create: `src/app/api/projects/[id]/run-snapshot/route.test.ts`
- Create: `src/features/pipeline/realtime/project-run-controller.ts`
- Create: `src/features/pipeline/realtime/project-run-controller.test.ts`
- Create: `src/features/pipeline/realtime/use-project-run.ts`
- Create: `src/features/pipeline/realtime/reconcile-live-view.ts`
- Create: `src/features/pipeline/realtime/reconcile-live-view.test.ts`
- Modify: `src/app/(app)/canvas/canvas-view.tsx`
- Modify: `src/app/(app)/canvas/canvas-inspector.tsx`
- Modify: `src/app/(app)/canvas/canvas-action-api.ts`
- Modify: `src/app/(app)/canvas/canvas-action-api.test.ts`
- Modify: `src/app/(app)/canvas/streaming-log-card.tsx`
- Modify: `src/app/(app)/canvas/streaming-log-card.test.ts`
- Prohibited: Realtime event 写 PG、把 live overlay 当 terminal snapshot
- Prohibited: 页面首次 render 只等 Trigger、固定假进度/假命中缓存/假完成状态
- Prohibited: 新增视觉原语、改页面布局、复制 Sidebar/TopNav 或偏离
  `docs/designs/canvas.pen`；完整视觉改造只属于 N6

- [ ] **Step 1: 写 snapshot source 与 reconnect/terminal 对账的失败测试**

PG snapshot test 必须证明每个字段来自：

- run：`pipeline_runs`；
- node：`canvas_nodes` + 当前 `task_attempts`；
- shot：node logical key + attempt checkpoint/artifact refs；
- artifact：`artifacts` DTO（只含 ID/kind/lifecycle/hash/size/URL capability）；
- readiness：缺失/失败的真实 attempt/artifact 聚合。

controller/reconcile test 使用 fake fetch + fake Realtime ports，断言：

1. 首先成功 fetch Snapshot，才建立 Realtime subscription；
2. live queued/running/progress 可覆盖 presentation，不 mutate snapshot cache；
3. browser refresh 从 PG Snapshot 恢复，不依赖旧事件；
4. disconnect/reconnect 后立即 refetch；
5. Realtime terminal 后立即 refetch，最终显示 PG terminal；
6. Trigger terminal 与 PG 尚未提交时显示“正在对账”，不能伪造 succeeded；
7. token 过期重新取 scoped token；
8. 连接状态与业务 run 状态是两个独立字段。

Run:

```powershell
pnpm vitest run --config vitest.pg.config.ts src/features/pipeline/snapshot/project-run-snapshot.pg.test.ts
pnpm test -- src/features/pipeline/realtime/reconcile-live-view.test.ts src/features/pipeline/realtime/project-run-controller.test.ts "src/app/api/projects/[id]/run-snapshot/route.test.ts"
```

Expected: 缺实现导致 RED。

- [ ] **Step 2: 实现完整 `ProjectRunSnapshotV1` PG query**

类型固定：

```ts
export interface ProjectRunSnapshotV1 {
  schemaVersion: 1
  workspaceId: string
  projectId: string
  workflowVersion: string
  run: {
    id: string
    status: PipelineRunStatus
    triggerRunId?: string
    startedAt?: string
    finishedAt?: string
    failure?: FailureSummaryV1
  } | null
  nodes: readonly NodeRunViewV1[]
  shots: readonly ShotRunViewV1[]
  artifacts: readonly ArtifactViewV1[]
  readiness: RunReadinessV1
}
```

query 使用一个 repeatable-read transaction 读取 project/latest run/attempt/node/
artifact，避免半个快照；按 stable logical key/ID 排序。Artifact DTO 只返回 API
artifact ID，不返回 storage key/绝对路径。route 的 `params` 必须 await，workspace
由 server context 注入。

- [ ] **Step 3: 实现 Snapshot-first hook 与 typed Realtime overlay**

`project-run-controller.ts` 实现可独立测试的 fetch/token/subscription/reconcile
状态机；`use-project-run.ts` 只把 React 与 `@trigger.dev/react-hooks` adapters
接到该 controller，不复制状态规则。公开状态固定分成：

```ts
{
  snapshot: ProjectRunSnapshotV1 | null
  live: SafeLiveRunOverlayV1 | null
  connection: 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error'
  reconciliation: 'settled' | 'pending'
}
```

hook 先 fetch snapshot；有 triggerRunId 后取 N2.4 token，再调用
`useRealtimeRun` 与 typed stream hook。refresh、reconnect、terminal 都重新 fetch
Snapshot；Realtime 只进 `live`，不写 snapshot terminal。AbortController 取消旧
project fetch/subscription。

- [ ] **Step 4: Canvas 只消费真实 run DTO**

`canvas-action-api.ts` 改调 N2.4 run API，保存 run ID/command replay result；
`canvas-view.tsx` 使用 hook 的 snapshot + overlay。N6 才做完整视觉重构，N2 只移除
固定进度、固定 cache count 与基于旧 job 的状态；缺数据明确显示“未开始/正在对账/
无法连接”，不得填演示数字。所有改动只能在现有视觉结构内做真实数据绑定与
controlled state；不得新增组件视觉原语、改变网格/侧栏/Inspector 布局或修改
`canvas.pen`。`canvas-inspector.tsx` 与 `streaming-log-card.tsx` 保留现有视觉结构，
但改为读取 snapshot/safe progress，删除对 node SSE/raw token hook 的依赖。

`field-source-matrix.md` 对本 Task 改动的每个可见字段逐一列出 Snapshot path、
Realtime path 或 local optimistic command state；不存在第四种来源。

- [ ] **Step 5: 运行 GREEN、刷新/断线/终态测试**

Run:

```powershell
pnpm vitest run --config vitest.pg.config.ts src/features/pipeline/snapshot/project-run-snapshot.pg.test.ts
pnpm test -- src/features/pipeline/realtime "src/app/api/projects/[id]/run-snapshot/route.test.ts" "src/app/(app)/canvas/canvas-action-api.test.ts"
pnpm typecheck
```

Expected: tests/typecheck 0；顺序断言证明 Snapshot 先于 Realtime；terminal 后 UI
最终以 PG Snapshot 为准。

- [ ] **Step 6: Task-Light 检查并本地提交**

Run:

```powershell
pnpm eslint src/features/pipeline/snapshot src/features/pipeline/realtime "src/app/api/projects/[id]/run-snapshot" "src/app/(app)/canvas/canvas-view.tsx" "src/app/(app)/canvas/canvas-action-api.ts"
git diff --check
git add -- src/features/pipeline/snapshot src/features/pipeline/realtime ':(literal)src/app/api/projects/[id]/run-snapshot' "src/app/(app)/canvas/canvas-view.tsx" "src/app/(app)/canvas/canvas-inspector.tsx" "src/app/(app)/canvas/canvas-action-api.ts" "src/app/(app)/canvas/canvas-action-api.test.ts" "src/app/(app)/canvas/streaming-log-card.tsx" "src/app/(app)/canvas/streaming-log-card.test.ts"
git diff --cached --check
git commit -m "feat(canvas): reconcile Postgres snapshot with Realtime"
```

Expected: commit 只含 snapshot/realtime/最低限 canvas wiring；不改 Pencil 视觉原语。

**N2.5 exit gate:** 首屏/刷新从 PG Snapshot 恢复；Realtime 只做安全 live overlay；
断线和 terminal 后重拉 PG；所有可见字段有来源矩阵；连接状态不伪装业务状态。

<a id="task-n26"></a>

### Task N2.6: 删除旧进程内 queue、SSE stream 与 instrumentation 启动

**Dependencies:** N2.4、N2.5；只能在 Trigger dev smoke 能启动后删除。

**Files:**

- Delete: `src/lib/queue/index.ts`
- Delete: `src/lib/queue/init.ts`
- Delete: `src/lib/queue/init.test.ts`
- Delete: `src/lib/queue/in-process-queue.ts`
- Delete: `src/lib/queue/query.ts`
- Delete: `src/lib/queue/types.ts`
- Delete: `src/lib/stream/stream-bus.ts`
- Delete: `src/lib/stream/stream-bus.test.ts`
- Delete: `src/lib/hooks/use-stage-stream.ts`
- Delete: `src/features/director/queue-handler.ts`
- Delete: `src/features/director/queue-handler.test.ts`
- Delete: `src/features/render/queue-handler.ts`
- Delete: `src/features/render/queue-handler.test.ts`
- Delete: `src/features/director/advance.ts`
- Delete: `src/features/director/advance.test.ts`
- Delete: `src/features/director/startup-boundary.test.ts`
- Delete: `src/app/api/director/pipeline/route.ts`
- Delete: `src/app/api/director/pipeline/route.test.ts`
- Delete: `src/app/api/director/stage/route.ts`
- Delete: `src/app/api/director/stage/route.test.ts`
- Delete: `src/app/api/director/stream/[nodeId]/route.ts`
- Delete: `src/app/api/director/stream/[nodeId]/route.test.ts`
- Delete: `src/app/api/render/route.ts`
- Delete: `src/app/api/render/route.test.ts`
- Delete: `src/app/api/jobs/[id]/route.ts`
- Delete: `src/app/api/jobs/[id]/route.test.ts`
- Delete: `src/instrumentation.ts`
- Modify: `src/features/director/pi-session.ts`
- Modify: `src/features/director/pi-session.test.ts`
- Modify: `src/features/director/stage-runner.ts`
- Modify: `src/features/director/stage-runner.test.ts`
- Modify: `src/features/director/index.ts`
- Modify: `src/features/director/fabricate.ts`
- Modify: `src/features/render/index.ts`
- Modify: `src/app/(app)/canvas/canvas-action-api.ts`
- Modify: `src/app/(app)/canvas/canvas-action-api.test.ts`
- Create (generated evidence): `docs/evidence/refactor-v3/n2-trigger-smoke.json`
- Prohibited: no-op wrapper/compat re-export 保留旧 queue/stream、轮询 `/api/jobs`
- Prohibited: 删除 artifact download/export/thumbnails APIs

- [ ] **Step 1: 先写 legacy zero-import 与 Trigger smoke 的失败断言**

Create `src/features/pipeline/legacy-boundary.test.ts`，扫描 tracked source，断言：

- 不存在 `@/lib/queue`、`@/lib/stream`、`use-stage-stream` import；
- 不存在旧 director pipeline/stage/stream、render enqueue、jobs polling URL；
- root instrumentation 不注册或启动 queue；
- 七个 Trigger task ID 仍恰好存在；
- Pi session/stage runner 只向注入的 `ProgressSink` 发 safe phase，不发 raw token；
- artifact download、render export、thumbnail route 仍存在。

Run: `pnpm test -- src/features/pipeline/legacy-boundary.test.ts`

Expected: 旧文件/import/URL 令测试 RED。

- [ ] **Step 2: 移除 streamBus，改为注入 safe progress**

`pi-session.ts` 不再 import streamBus，也不发布逐 token 文本；只通过调用者注入的
`ProgressSink` 发布 bounded `started/checkpoint/completed/failed`。业务 artifact
仍从 N0 已验证的 terminal Tool args 取得，不从 UI stream 反推。
`stage-runner.ts` 删除 markDone/markError/advancePipeline，终态由 N2
AttemptService transaction 提交；失败传播给 Trigger Result。

- [ ] **Step 3: 删除旧 queue/handlers/routes 并切换所有调用者**

删除 Files 中全部旧路径。Director/render index 移除 enqueue/handler exports；
`fabricate.ts` 改调 application service port，不再 advance。Canvas 单节点动作映射为
`POST /api/runs` 的可信 targeted intent（regenerate/rerender）并使用
Idempotency-Key；全项目启动/取消走 N2.4 API。保留 `/api/render/export`、
`/api/render/thumbnails`、`/api/artifacts/[id]`。

- [ ] **Step 4: 运行 zero-import GREEN**

Run:

```powershell
pnpm test -- src/features/pipeline/legacy-boundary.test.ts src/features/director/pi-session.test.ts src/features/director/stage-runner.test.ts "src/app/(app)/canvas/canvas-action-api.test.ts"
rg -n "@/lib/(queue|stream)|use-stage-stream|/api/director/(pipeline|stage|stream)|/api/render(['\\\"]|$)|/api/jobs" src trigger --glob '!src/features/pipeline/legacy-boundary.test.ts'
rg -n "initQueue|registerDirectorStageHandler|registerRenderShotHandler|enqueueDirectorStage|enqueueRenderShot|advancePipeline|streamBus" src trigger --glob '!src/features/pipeline/legacy-boundary.test.ts'
```

Expected: tests GREEN；两个 rg 均无匹配并退出 1；允许的
`/api/render/export` 与 `/api/render/thumbnails` 不被 pattern 误报。

- [ ] **Step 5: 执行真实 Trigger dev start/cancel/fail/retry/realtime smoke**

Run in terminal A:

```powershell
pnpm dev
```

Run in terminal B:

```powershell
pnpm dev:trigger
```

Run in terminal C:

```powershell
pnpm tsx scripts/verify/trigger-pipeline-smoke.ts --base-url http://127.0.0.1:3000 --out docs/evidence/refactor-v3/n2-trigger-smoke.json
```

Smoke 必须实际：

1. start 一次项目 run，并接收 run-scoped Realtime；
2. 观察至少一个 typed progress 与 PG running snapshot；
3. 注入稳定测试 failure，证明 sibling 结果保留、run failed；
4. retry 并验证 attempt_no 增加/checkpoint 规则；
5. 启动另一 run 后 cancel，证明 Trigger terminal cancelled、PG run/attempt/node
   对账为 cancelled、迟到 commit 被拒绝；
6. 模拟 subscription disconnect/reconnect，证明重拉 PG Snapshot；
7. 输出 run IDs、attempt numbers、safe event counts、PG snapshot hashes 和 exit
   gates，不输出 Key/raw model text/path。

Expected: 三终端均正常；evidence 每个场景 `passed: true`。只看到 Trigger
registration、没执行真实 run 不算通过。

- [ ] **Step 6: 执行 Track N2 Tier B gate**

Run:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm vitest run --config vitest.pg.config.ts
pnpm build
pnpm tsx scripts/spikes/run-v3-spikes.ts --verify-evidence
pnpm tsx scripts/verify/trigger-pipeline-smoke.ts --verify-evidence docs/evidence/refactor-v3/n2-trigger-smoke.json
git diff --check
```

Expected: 全部退出 0；build 无 instrumentation/queue/stream import；N1/N2 evidence
均可复核。

- [ ] **Step 7: 本地提交 Track closeout**

Run:

```powershell
git add -- src/lib/queue src/lib/stream src/lib/hooks/use-stage-stream.ts src/features/director/queue-handler.ts src/features/director/queue-handler.test.ts src/features/render/queue-handler.ts src/features/render/queue-handler.test.ts src/features/director/advance.ts src/features/director/advance.test.ts src/features/director/startup-boundary.test.ts src/app/api/director src/app/api/render/route.ts src/app/api/render/route.test.ts src/app/api/jobs src/instrumentation.ts src/features/director/pi-session.ts src/features/director/pi-session.test.ts src/features/director/stage-runner.ts src/features/director/stage-runner.test.ts src/features/director/index.ts src/features/director/fabricate.ts src/features/render/index.ts "src/app/(app)/canvas/canvas-action-api.ts" "src/app/(app)/canvas/canvas-action-api.test.ts" src/features/pipeline/legacy-boundary.test.ts docs/evidence/refactor-v3/n2-trigger-smoke.json
git diff --cached --check
git commit -m "refactor(orchestration): remove legacy queue and stream"
git status --short --branch
```

Expected: staged diff 精确显示旧文件删除与新调用边界；保留 export/thumbnail/
artifact APIs；commit 后无未知 generated output 被 stage。

**N2.6 exit gate:** runtime 中旧 queue/SSE/jobs poll/import 为零；Next 不再靠
instrumentation 启动 worker；Trigger dev 的 start/fail/retry/cancel/realtime 均有
真实证据；PG Snapshot 与 Trigger live 状态终态对账。

---

## Track N2 完成门禁

- [ ] N2.1–N2.6 均各自本地 Conventional Commit，未 push。
- [ ] 活动 Trigger task ID 恰好七个；依赖关系精确为
  `cvc.pipeline.run -> cvc.project.plan -> cvc.shot.generate`、
  `cvc.shot.generate -> cvc.shot.media`、
  `cvc.shot.generate -> cvc.shot.render -> cvc.shot.qa`、
  `cvc.shot.media + cvc.shot.qa -> cvc.project.compose`，
  其中 media/render 在 generate 后并行，compose 同时等待 media 与 QA。
- [ ] 四个静态 queue concurrency 为 AI 2、render 1、media 2、compose 1。
- [ ] 所有 root/child idempotency key 都显式 `{scope:'global'}`；same/same replay、
  same/different 409、crash recovery 与 stale attempt fence 均通过。
- [ ] 每个 child `Result.ok` 均检查；无
  `Promise.all(triggerAndWait())`；单 Shot 失败不抹除 sibling 成果。
- [ ] `task_attempts`、`pipeline_runs`、`canvas_nodes`、Trigger/Realtime 的状态所有权
  未混淆；Realtime 不写业务 terminal。
- [ ] refresh 首先从 PG `ProjectRunSnapshotV1` 恢复，随后才接 Realtime；断线与终态
  均重拉 Snapshot。
- [ ] run token 只读、run-scoped、15 分钟；API 不暴露 Key、storage key、绝对路径。
- [ ] legacy queue/stream/jobs polling/instrumentation startup import 为零。
- [ ] 真实 Trigger dev start/fail/retry/cancel/realtime smoke 通过并生成脱敏 evidence。
- [ ] `pnpm lint`、`pnpm typecheck`、`pnpm test`、PG tests、`pnpm build` 全部退出 0，
  中文无 U+FFFD。
