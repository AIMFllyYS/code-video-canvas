# Track N7 全链路 E2E 与旧路径清退 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用锁定的 `workflowVersion` 在真实本地 Postgres、Trigger dev、Pi、video compiler、HyperFrames 与 FFmpeg compose 上证明 v3 可恢复闭环，产出像素/媒体/浏览器证据后删除全部已替代运行路径。

**Architecture:** `cvc.pipeline.run` 只编排七类 Trigger task，Shot 执行边固定为 `generate → media + render`；CVC compiler 输出 `CvcCompositionBundleV1`，其中 `renderable` 是跨项目合同 `RenderableBundleDescriptorV1`。命令使用显式 global idempotency key、receipt fingerprint 与 attempt fence；业务 terminal 状态只由 application service 在事务中提交，Trigger/Realtime 不拥有业务终态。

**Tech Stack:** Docker Postgres、Drizzle tracked migrations、Trigger.dev、Pi Agent、StepFun/Gemini provider registry、TypeScript、HyperFrames CLI、Playwright、FFmpeg/ffprobe、Vitest

---

## 权威、依赖与总边界

**Track ID:** `N7`

**Requirements:** `PROD-FOUND-001..005`、`PROD-PLAN-001..006`、
`PROD-CANVAS-001..006`、`PROD-AI-001..006`、`PROD-SHOT-001..010`、
`PROD-RENDER-001..006`、`PROD-MEDIA-001..005`、`PROD-QA-001..006`、
`PROD-RUN-001..007`、`PROD-UI-001..007`、全部 `PROD-NFR-*`、
`SCN-01..08`

**Architecture:** `ARCH-MOD-001..005`、`EXEC-DAG-001..005`、
`EXEC-STATE-001..003`、`EXEC-CMD-001..004`、`EXEC-TRIGGER-001..007`、
`CONTRACT-AI-001..007`、`CONTRACT-SOURCE-001..004`、
`CONTRACT-GATE-001..002`、`CONTRACT-COMPILER-001..003`、
`CONTRACT-HF-001..002`、`CONTRACT-RENDER-001`、`CONTRACT-STORE-001`、
`CONTRACT-ART-001..002`、`DATA-001..006`、`CONTRACT-RUN-001..003`、
`CONTRACT-MEDIA-001..003`、`SEC-001..003`、`TEST-001..007`

**Depends on:** N0–N6 全部 Task 已在唯一状态账本中完成，30 项验收 A01–A29 各自
owner Track 已附可重放证据；N7 不替前序 Track 补写虚假通过记录。

**允许修改：**

- `src/lib/version/**`、`packages/contracts/src/version.ts`、
  `packages/video-compiler/src/version.ts` 及对应测试；
- `scripts/e2e/refactor-v3/**`、`tests/integration/refactor-v3/**`、
  `scripts/verification/refactor-v3/**`；
- `docs/evidence/refactor-v3/n7/**`；
- 为修复 N7 实测暴露的 v3 regression 所需的最小生产文件；
- N7.5 明列的 legacy/transition 路径、`package.json` 与由 pnpm 命令生成的
  `pnpm-lock.yaml`；
- `README.md`、`docs/specs/README.md`、本 Issue 与唯一状态账本的完成证据。

**禁止修改：**

- 绕过 ADR 改 Product/Architecture/Harness 已接受语义；
- 新增 Trigger task；活动 task 必须仍恰好七类；
- 将执行边改回 `project.plan → shot.media`，或让 compose 忽略 media/QA readiness；
- 将 `CvcCompositionBundleV1` 与 `RenderableBundleDescriptorV1` 合并、改名或交换职责；
- 使用 SDK 默认 idempotency scope；所有 CVC pipeline/task key 必须显式 global；
- 让 Trigger/Realtime 直接写业务 terminal 状态，或独立修改
  `canvas_nodes.status`；
- 为通过测试保留双数据库、双调度器、双 Agent Runtime、双 source 主通道、双帧时钟；
- 在日志、evidence、commit 或回复中写入 Key、raw prompt、raw provider error、
  raw Tool 参数、hidden reasoning 或服务器绝对路径；
- 把 deterministic fixture、provider smoke 或 transport success 描述为完整 live
  workflow；
- 自动重跑付费模型调用、做 reliability soak、运行未获授权的额外 provider 调用；
- push、创建 PR 或 force push。

## 真实 AI/API 预算与证据分类

本 Track 开工前必须读取 N3/N4/N5 的 provider 证据和调用计数。付费调用预算固定为：

1. 每个实际涉及 provider 的前序 Track、每个已配置 provider 最多一次成功 smoke，证据
   分类为 `track-provider-smoke`；
2. N7 恰好一次 live `FABRICATE` invocation，必须通过 Pi terminal Tool 提交
   `ShotSourcePackageV1`，证据分类为 `live-provider-fabricate`；
3. N7 的 project-plan、shot-spec、vision-qa、重试、取消、崩溃、reconciler、
   idempotency 与重复渲染测试全部使用版本化 deterministic fixture，证据分类为
   `deterministic-fixture`；
4. media 输入可以使用版本化本地 fixture，但 `shot.media` task、artifact commit、
   HyperFrames render 与 FFmpeg compose 必须运行真实本地实现；报告必须明确
   “fixture media input / real compose”；
5. live FABRICATE 不自动 retry。唯一调用失败时保留脱敏失败证据并阻塞 N7；没有新的
   用户授权不得发起第二次付费调用。

所有 evidence manifest 必须含：

```ts
type EvidenceClass =
  | 'deterministic-fixture'
  | 'track-provider-smoke'
  | 'live-provider-fabricate'
  | 'real-local-infrastructure'

interface AiBudgetEvidenceV1 {
  evidenceClass: EvidenceClass
  taskKind: 'project-plan' | 'shot-spec' | 'fabricate' | 'vision-qa' | null
  provider: string | null
  modelId: string | null
  paidInvocationCount: number
  fixtureIds: readonly string[]
}
```

---

<a id="task-n71"></a>

### Task N7.1: 锁定 workflow、contract、schema、compiler 与 runtime 版本

**Files:**

- Create/modify: `src/lib/version/workflow-version.ts`
- Create/modify: `src/lib/version/workflow-version.test.ts`
- Create/modify: `packages/contracts/src/version.ts`
- Create/modify: `packages/video-compiler/src/version.ts`
- Create: `scripts/verification/refactor-v3/verify-version-pins.ts`
- Create: `scripts/verification/refactor-v3/verify-version-pins.test.ts`
- Create: `docs/evidence/refactor-v3/n7/version-manifest.json`

- [ ] 从当前 committed source 读取真实 pin：workflow、contracts、canonicalizer、
  tracked Postgres migration head/hash、compiler、HyperFrames、render image/runtime、
  Trigger task graph、ModelPolicy revision 与 Git SHA。禁止写空字符串或动态
  `Date.now()`。
- [ ] 写 RED 测试，证明 `WorkflowVersionV1` 恰有：

```ts
export interface WorkflowVersionV1 {
  workflow: string
  contracts: string
  compiler: string
  hyperframes: string
  renderImage: string
}
```

- [ ] RED 同时证明：
  - task/input fingerprint 包含 canonicalizer、workflow、intent、task ID、
    workspace/entity、排序后的 input artifact hash 与适用的 schema/compiler/contract
    pins；
  - AI task 额外包含 model policy revision 与 resolved provider/model，media task
    额外包含 media route revision 与 resolved provider/model；
  - retry checkpoint 比较 workflow/compiler/schema pin；
  - `CvcCompositionBundleV1.manifest` 携带 workflow/compiler/HF/provenance；
  - `CvcCompositionBundleV1.renderable` 满足 `RenderableBundleDescriptorV1`；
  - DAG 固定 `shot.generate → shot.media` 与 `shot.generate → shot.render`；
  - 所有 CVC pipeline/task key 显式
    `idempotencyKeys.create(key, { scope: 'global' })`。
- [ ] 运行 RED：

```powershell
pnpm test -- src/lib/version/workflow-version.test.ts scripts/verification/refactor-v3/verify-version-pins.test.ts
```

- [ ] 实现单一版本读取入口和 machine-readable manifest。`workflowVersion` 不从 package
  偶然版本、当前时间或未提交 worktree hash 推导；任一影响 prompt contract、
  normalizer、gate、compiler、HF 或 render image 的 pin 变化必须使 cache key 失效。
- [ ] 运行 GREEN：

```powershell
pnpm test -- src/lib/version/workflow-version.test.ts scripts/verification/refactor-v3/verify-version-pins.test.ts
pnpm exec tsx scripts/verification/refactor-v3/verify-version-pins.ts
pnpm typecheck
git diff --check
```

- [ ] 精确 stage 并本地 commit：

```powershell
git add -- src/lib/version packages/contracts/src/version.ts packages/video-compiler/src/version.ts scripts/verification/refactor-v3/verify-version-pins.ts scripts/verification/refactor-v3/verify-version-pins.test.ts docs/evidence/refactor-v3/n7/version-manifest.json
git diff --cached --check
git commit -m "chore(release): lock refactor v3 workflow versions" -m "Task: N7.1" -m "Spec: EXEC-CMD-002..004 CONTRACT-COMPILER-002 workflowVersion"
```

**退出门：** 版本 manifest 可由脚本重建并与 source 一致；fingerprint、checkpoint、
bundle、render receipt 和 final provenance 可追溯到同一锁定版本集合。

---

<a id="task-n72"></a>

### Task N7.2: 真实本地基础设施与一次 live FABRICATE E2E

**Files:**

- Create: `scripts/e2e/refactor-v3/run-local-e2e.ts`
- Create: `scripts/e2e/refactor-v3/evidence-recorder.ts`
- Create: `scripts/e2e/refactor-v3/live-budget.ts`
- Create: `scripts/e2e/refactor-v3/fixtures/project-plan.v1.json`
- Create: `scripts/e2e/refactor-v3/fixtures/shot-spec.v1.json`
- Create: `scripts/e2e/refactor-v3/fixtures/media-manifest.v1.json`
- Create: `scripts/e2e/refactor-v3/fixtures/vision-qa.v1.json`
- Create: `tests/integration/refactor-v3/local-e2e.test.ts`
- Create: `docs/evidence/refactor-v3/n7/e2e-run-manifest.json`
- Create: `docs/evidence/refactor-v3/n7/ai-budget-report.md`

- [ ] 先写 RED integration test，要求真实依赖探测：Docker Postgres healthy、fresh tracked
  migrations、Trigger dev reachable、Next Node server、Pi runtime、pinned HyperFrames CLI、
  ffmpeg/ffprobe。仅“包存在”或 transport connected 不算通过。
- [ ] RED 要求 run graph 恰好七类 task，且一条中文稿件执行：

```text
cvc.pipeline.run
  → cvc.project.plan
  → cvc.shot.generate
      ├─→ cvc.shot.media
      └─→ cvc.shot.render
               → cvc.shot.qa
  media + qa → cvc.project.compose
```

- [ ] 运行不含付费调用的 RED：

```powershell
pnpm test -- tests/integration/refactor-v3/local-e2e.test.ts
```

  预期因 E2E runner/evidence 尚未实现而失败。
- [ ] 启动真实本地 Postgres 并验证 health/fresh migration：

```powershell
docker compose -f docker-compose.dev.yml up -d postgres
docker compose -f docker-compose.dev.yml ps
pnpm db:migrate
```

- [ ] 在独立终端启动真实 `trigger dev` 与 `pnpm dev`；记录 PID、端口、Trigger run ID
  和脱敏日志路径。不得用固定 sleep 判断 ready；轮询 health，单次等待不超过 60 秒。
- [ ] 先执行 `--mode fixture-only`，证明 PG、Trigger、Pi terminal Tool fixture、
  compiler、`CvcCompositionBundleV1`、`RenderableBundleDescriptorV1`、HF check/render、
  media artifact、FFmpeg compose 与 final verify 的真实本地链路：

```powershell
pnpm exec tsx scripts/e2e/refactor-v3/run-local-e2e.ts --mode fixture-only --live-budget 0
```

- [ ] 核验 fixture-only 全绿后，读取已解析 ModelPolicy，在不回显 Key 的前提下只执行
  一次 live FABRICATE。project-plan、shot-spec、vision-qa 与 media 输入继续使用列出的
  versioned fixture：

```powershell
pnpm exec tsx scripts/e2e/refactor-v3/run-local-e2e.ts --mode one-live-fabricate --live-budget 1
```

- [ ] live output 必须经 Pi 单一 terminal Tool schema 验证，再走 G1–G10、compiler、
  HyperFrames render、真实 `shot.media` artifact commit、`project.compose` 与 final
  verify；不得把 assistant final text 当 source。
- [ ] `live-budget.ts` 以本次 run 的 invocation receipt 强制计数；第二个 paid
  invocation 在调用 provider 前失败。报告只写 provider/model、task kind、HTTP
  status、Tool 成功与 token usage，不写 prompt/source/Key。
- [ ] 运行 GREEN：

```powershell
pnpm test -- tests/integration/refactor-v3/local-e2e.test.ts
pnpm exec tsx scripts/verification/refactor-v3/verify-version-pins.ts
```

- [ ] 精确 stage 并本地 commit：

```powershell
git add -- scripts/e2e/refactor-v3 tests/integration/refactor-v3/local-e2e.test.ts docs/evidence/refactor-v3/n7/e2e-run-manifest.json docs/evidence/refactor-v3/n7/ai-budget-report.md
git diff --cached --check
git commit -m "test(e2e): prove one-live-fabricate local pipeline" -m "Task: N7.2" -m "Spec: TEST-007 A30"
```

**退出门：** manifest 明确分开 fixture 与 live；N7 paid invocation 计数恰好 1；真实
PG/Trigger/Pi/compiler/HF/compose 产出 final artifact，且不将 fixture-only 叙述为
live FABRICATE。

---

<a id="task-n73"></a>

### Task N7.3: retry、cancel、crash、reconciler、幂等与状态所有权

**Files:**

- Create: `tests/integration/refactor-v3/recovery-matrix.test.ts`
- Create: `tests/integration/refactor-v3/idempotency-and-fencing.test.ts`
- Create: `scripts/e2e/refactor-v3/run-recovery-matrix.ts`
- Create: `docs/evidence/refactor-v3/n7/recovery-matrix.md`

- [ ] 写 RED recovery matrix，所有模型边界使用 deterministic fixture，禁止消耗 N7
  live budget。至少覆盖：
  - transport retry 后相同 fingerprint checkpoint 被复用；
  - 用户 cancel 映射为业务 `cancelled` 并清理 attempt workspace；
  - Next 在 receipt commit 后、Trigger start 前崩溃；
  - Next 在 Trigger start 后、handle 回写前崩溃；
  - task 在 artifact upload 后、DB commit 前崩溃；
  - task 在 checkpoint 后、terminal commit 前崩溃；
  - reconciler 以同一 global key 查询/补发同一 Trigger run；
  - 同 receipt key/同 fingerprint 返回原 result；
  - 同 receipt key/不同 fingerprint 返回 `409 Conflict`；
  - stale attempt/superseded attempt 的 checkpoint、artifact publish 与 node projection
    均返回 `STALE_ATTEMPT`；
  - 同 entity/input 成功 artifact 命中不重复模型调用或 side effect。
- [ ] RED 状态断言必须证明：
  - `task_attempts` checkpoint/terminal 是步骤级业务真源；
  - `pipeline_runs.status` 是聚合状态；
  - `canvas_nodes.status` 只与 attempt/artifact 在同一事务投影；
  - Trigger/Realtime 只提供 transport/live view；
  - 刷新/断线/终态后 Snapshot 与 PG 一致。
- [ ] 运行 RED：

```powershell
pnpm test -- tests/integration/refactor-v3/recovery-matrix.test.ts tests/integration/refactor-v3/idempotency-and-fencing.test.ts
```

- [ ] 实现 failure injection 与 reconciler harness；注入点只通过测试 adapter 暴露，
  不在生产代码保留环境变量后门或 time-based race。
- [ ] 在真实 Postgres + Trigger dev 上执行矩阵：

```powershell
pnpm exec tsx scripts/e2e/refactor-v3/run-recovery-matrix.ts
```

- [ ] 对每一行记录 command receipt、business run、Trigger run、attempt、checkpoint、
  artifact count、最终状态和 cleanup；跨表 ID 只记录本地脱敏测试 ID。
- [ ] 运行 GREEN：

```powershell
pnpm test -- tests/integration/refactor-v3/recovery-matrix.test.ts tests/integration/refactor-v3/idempotency-and-fencing.test.ts
pnpm exec tsx scripts/e2e/refactor-v3/run-recovery-matrix.ts
pnpm typecheck
```

- [ ] 精确 stage 并本地 commit：

```powershell
git add -- tests/integration/refactor-v3/recovery-matrix.test.ts tests/integration/refactor-v3/idempotency-and-fencing.test.ts scripts/e2e/refactor-v3/run-recovery-matrix.ts docs/evidence/refactor-v3/n7/recovery-matrix.md
git diff --cached --check
git commit -m "test(orchestration): prove recovery and global idempotency" -m "Task: N7.3" -m "Spec: EXEC-STATE-003 EXEC-CMD-001..004 TEST-003"
```

**退出门：** retry/cancel/crash/reconciler/idempotency/stale attempt 全部有真实
PG/Trigger 证据；无重复 run、模型调用、artifact 或业务终态漂移。

---

<a id="task-n74"></a>

### Task N7.4: 跨 workspace、attempt workspace 与 generated-source sandbox

**Files:**

- Create: `tests/integration/refactor-v3/workspace-isolation.test.ts`
- Create: `tests/integration/refactor-v3/generated-source-sandbox.test.ts`
- Create: `scripts/e2e/refactor-v3/run-security-matrix.ts`
- Create: `docs/evidence/refactor-v3/n7/security-matrix.md`

- [ ] 写 RED workspace 测试：workspace A 不可按 artifact ID 读取 workspace B；
  composite FK 拒绝跨 workspace project/run/attempt/artifact 引用；业务代码不能提交 raw
  storage key；下载 API 不返回绝对路径。
- [ ] 写 RED sandbox 测试，拒绝：
  `../`/绝对路径/`file://` bundle-root 逃逸、非 allowlisted asset、network、fetch/XHR/
  WebSocket/import、eval/Function/Worker、Node integration、storage/cookie、wall clock、
  rAF/timer/ticker、无种子 random、无限循环与超预算输出。
- [ ] RED 证明每个 attempt 有独立 temp root 与 browser context；cancel、failure、success
  后清理；非当前 attempt 无法 materialize 或 publish。
- [ ] 运行 RED：

```powershell
pnpm test -- tests/integration/refactor-v3/workspace-isolation.test.ts tests/integration/refactor-v3/generated-source-sandbox.test.ts
```

- [ ] 对失败项做最小修复；ArtifactStore 仍只接受
  `WorkspaceScope + artifactId`，仅 RenderWorkspace 给 CLI/FFmpeg attempt-root 内安全路径。
- [ ] 在真实本地 browser/renderer 上执行负向矩阵，console/error 只保留脱敏与有界条目：

```powershell
pnpm exec tsx scripts/e2e/refactor-v3/run-security-matrix.ts
```

- [ ] 运行 GREEN：

```powershell
pnpm test -- tests/integration/refactor-v3/workspace-isolation.test.ts tests/integration/refactor-v3/generated-source-sandbox.test.ts
pnpm exec tsx scripts/e2e/refactor-v3/run-security-matrix.ts
pnpm typecheck
```

- [ ] 精确 stage 并本地 commit：

```powershell
git add -- tests/integration/refactor-v3/workspace-isolation.test.ts tests/integration/refactor-v3/generated-source-sandbox.test.ts scripts/e2e/refactor-v3/run-security-matrix.ts docs/evidence/refactor-v3/n7/security-matrix.md
git diff --cached --check
git commit -m "test(security): prove workspace and render sandbox isolation" -m "Task: N7.4" -m "Spec: CONTRACT-STORE-001 SEC-002..003 A20"
```

**退出门：** cross-workspace、raw-key、bundle-root、stale attempt 与 sandbox 负向用例均
在真实 adapter/browser 边界被拒绝；temp workspace 无残留。

---

<a id="task-n75"></a>

### Task N7.5: golden 像素、最终媒体与真实浏览器证据

**Files:**

- Create: `scripts/e2e/refactor-v3/capture-golden-evidence.ts`
- Create: `scripts/e2e/refactor-v3/verify-final-media.ts`
- Create: `scripts/e2e/refactor-v3/capture-browser-evidence.ts`
- Create: `tests/integration/refactor-v3/golden-render.test.ts`
- Create: `tests/integration/refactor-v3/final-media.test.ts`
- Create: `docs/evidence/refactor-v3/n7/pixel-report.md`
- Create: `docs/evidence/refactor-v3/n7/media-report.md`
- Create: `docs/evidence/refactor-v3/n7/browser-report.md`
- Create: `docs/evidence/refactor-v3/n7/contact-sheet.png`

- [ ] 写 RED golden 测试，使用锁定 deterministic fixture 和 workflowVersion，验证：
  HF check 0 finding；0/中/末/乱序 seek；同一帧连续两次捕获实体 SHA-256 完全相同；
  golden frame `maxDiffPixelRatio <= 0.001`；所有样本非空。
- [ ] RED media 测试读取真实 `ffprobe -of json`：Shot MP4 与 final MP4 尺寸/fps/时长、
  required 视频/音频/字幕流、实体 SHA-256、DB content hash、provenance 一致；再用
  FFmpeg 全量 decode 到 null sink，退出码必须为 0。
- [ ] RED browser 测试覆盖 `/projects`、Canvas、RunControl、四页签 Inspector、
  Settings、Export、artifact download；刷新/Realtime reconnect 后与 Snapshot 对账；
  键盘、窄屏、亮暗、reduced motion；无固定假值或不可操作外观。
- [ ] 运行 RED：

```powershell
pnpm test -- tests/integration/refactor-v3/golden-render.test.ts tests/integration/refactor-v3/final-media.test.ts
```

- [ ] 对 deterministic fixture 与 N7 live FABRICATE run 分开采集。fixture 提供可重复
  golden/hash；live run 提供真实 source→bundle→render→compose 媒体与 contact sheet，
  不把 live 视觉变化误作 deterministic baseline。
- [ ] 生成证据：

```powershell
pnpm exec tsx scripts/e2e/refactor-v3/capture-golden-evidence.ts
pnpm exec tsx scripts/e2e/refactor-v3/verify-final-media.ts
pnpm exec tsx scripts/e2e/refactor-v3/capture-browser-evidence.ts
```

- [ ] 每份报告记录 workflowVersion、run/attempt、fixture/live 分类、命令、退出码、
  frame/time、hash、diff、ffprobe 摘要与 artifact ID；不记录绝对路径、Key 或 raw
  model source。
- [ ] 运行 GREEN：

```powershell
pnpm test -- tests/integration/refactor-v3/golden-render.test.ts tests/integration/refactor-v3/final-media.test.ts
pnpm exec tsx scripts/e2e/refactor-v3/capture-golden-evidence.ts
pnpm exec tsx scripts/e2e/refactor-v3/verify-final-media.ts
pnpm exec tsx scripts/e2e/refactor-v3/capture-browser-evidence.ts
```

- [ ] 用 `view_image`/真实像素检查 contact sheet 与关键截图，不能只依赖文件存在、
  hash 或测试架构。
- [ ] 精确 stage 并本地 commit：

```powershell
git add -- scripts/e2e/refactor-v3/capture-golden-evidence.ts scripts/e2e/refactor-v3/verify-final-media.ts scripts/e2e/refactor-v3/capture-browser-evidence.ts tests/integration/refactor-v3/golden-render.test.ts tests/integration/refactor-v3/final-media.test.ts docs/evidence/refactor-v3/n7/pixel-report.md docs/evidence/refactor-v3/n7/media-report.md docs/evidence/refactor-v3/n7/browser-report.md docs/evidence/refactor-v3/n7/contact-sheet.png
git diff --cached --check
git commit -m "test(release): capture pixel media and browser evidence" -m "Task: N7.5" -m "Spec: TEST-005..007 A22..A30"
```

**退出门：** golden、同帧 hash、live contact sheet、ffprobe、decode、实体 hash 和真实
浏览器流程全部有证据；fixture 与 live 明确分栏。

---

<a id="task-n76"></a>

### Task N7.6: 最终清退、30 项复核与交付

删除只发生在替代路径已通过对应 Track Gate 且 source graph 为零引用后。以下路径是
本 Task 的明确清退范围：

- `src/lib/queue/**`
- `src/lib/stream/**`
- `src/lib/hooks/use-stage-stream.ts`
- `src/features/director/pi-session.ts` 及旧六阶段 runtime/session/store 的生产入口
- `src/features/render/legacy-provider.ts`
- 仍属于旧 `__CVC_RENDER__` 默认路径的
  `src/features/render/renderer.ts`、`frame-capture.ts`、`frame-sequence.ts`、
  `encode.ts`、`queue-handler.ts`
- `src/instrumentation.ts` 中旧 queue/stream bootstrap；文件仍有合法 Next startup
  职责时只移除旧 import/registration
- `src/**`、`trigger/**`、`packages/**` 内运行时 SQLite import；只读 SQLite 迁移工具
  仅可位于 `scripts/migration/sqlite/**`
- node-type model routing、direct OpenAI client、raw HTML main path、
  director↔render deep import 与所有 transition adapter
- 上述 source scan 为零后，`package.json` 中仅由旧路径使用的依赖；只用
  `pnpm remove` 更新 lockfile，不手改 `pnpm-lock.yaml`

**Files:**

- Create: `scripts/verification/refactor-v3/prohibited-dependencies.ts`
- Create: `scripts/verification/refactor-v3/prohibited-dependencies.test.ts`
- Create: `scripts/verification/refactor-v3/acceptance-matrix.ts`
- Create: `docs/evidence/refactor-v3/n7/acceptance-matrix.md`
- Create: `docs/evidence/refactor-v3/n7/cleanup-manifest.json`
- Create: `docs/evidence/refactor-v3/n7/delivery-report.md`
- Modify/delete only the explicit cleanup scope above
- Modify: `README.md`
- Modify: `docs/specs/README.md`
- Modify: `docs/specs/2026-07-24-refactor-v3-task-breakdown.md`
- Modify: `docs/issues/refactor-v3/issue-n7-e2e-and-cutover.md`

- [ ] 写 RED prohibited-dependencies test，扫描 production graph 并因任一旧路径/import
  命中而失败。fixture/test/migration-only 豁免必须精确到文件，不能豁免整个目录。
- [ ] 写 RED acceptance-matrix test：A01–A30 每项必须有 owner Task、commit SHA、
  evidence path、命令、exit code 与证据分类；缺项或 evidence 文件不存在即失败。
- [ ] 运行 RED：

```powershell
pnpm test -- scripts/verification/refactor-v3/prohibited-dependencies.test.ts
pnpm exec tsx scripts/verification/refactor-v3/acceptance-matrix.ts
```

- [ ] 对每个删除目标先运行 `Resolve-Path`、`git status --short` 和 `rg` 引用图；确认
  位于仓库、属于本卡范围且不覆盖用户/其他会话修改，再删除或迁移。把最终逐文件
  allowlist 写入 `cleanup-manifest.json`；该 manifest 不允许目录、glob、`..` 或仓库外
  路径。
- [ ] source scan 必须证明：
  - runtime SQLite 为 0；
  - in-process queue、stream-bus/SSE 为 0；
  - direct OpenAI client 与旧 node-type model routing 为 0；
  - 只有 `pi-structured-runner.ts` import Pi `Agent`；
  - raw HTML 与 `__CVC_RENDER__` 不是默认主路径；
  - legacy provider、transition adapter 与 director↔render cycle 为 0；
  - 活动 Trigger task 恰好七类，依赖仍为 `generate → media + render`；
  - global idempotency 与状态所有权检查仍通过。
- [ ] 删除仅由旧路径使用的依赖时执行 `pnpm remove <exact-package-names>`；先记录准确包
  名和反向依赖，禁止手改 lockfile。
- [ ] 运行最终 Tier B/C 与 production start smoke：

```powershell
pnpm exec tsx scripts/verification/refactor-v3/prohibited-dependencies.ts
pnpm exec tsx scripts/verification/refactor-v3/acceptance-matrix.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
rg -n --fixed-strings ([string][char]0xFFFD) AGENTS.md README.md docs src packages trigger
git diff --check
```

  `pnpm start` 使用已生成 production build，在真实 HTTP health/Projects/Canvas 请求成功
  后终止；不能只证明进程启动。
- [ ] 复读所有输出。`delivery-report.md` 必须列出：N0–N7 Task/commit、规范覆盖、
  workflowVersion、fixture/live 边界、provider paid count、PG/Trigger/Pi/compiler/HF/
  compose 证据、recovery/security/pixel/media/browser 证据、A01–A30、全量命令退出码、
  U+FFFD/secret/prohibited scan、未解决风险、worktree 与未 push 声明。
- [ ] 只在所有门禁真实通过后更新唯一状态账本：勾选 N7.1–N7.6，写 commit/evidence，
  将 N7 Track 标为 done；失败项保持未勾选并写明确 blocker。
- [ ] 精确 stage 并本地 commit：

```powershell
$cleanupManifest = Get-Content -LiteralPath docs/evidence/refactor-v3/n7/cleanup-manifest.json -Raw -Encoding utf8 | ConvertFrom-Json
foreach ($cleanupPath in $cleanupManifest.paths) { git add -u -- $cleanupPath }
git add -- scripts/verification/refactor-v3/prohibited-dependencies.ts scripts/verification/refactor-v3/prohibited-dependencies.test.ts scripts/verification/refactor-v3/acceptance-matrix.ts package.json pnpm-lock.yaml README.md docs/specs/README.md docs/specs/2026-07-24-refactor-v3-task-breakdown.md docs/issues/refactor-v3/issue-n7-e2e-and-cutover.md docs/evidence/refactor-v3/n7/acceptance-matrix.md docs/evidence/refactor-v3/n7/cleanup-manifest.json docs/evidence/refactor-v3/n7/delivery-report.md
git diff --cached --check
git diff --cached --stat
git commit -m "refactor(release): remove legacy runtime paths" -m "Task: N7.6" -m "Spec: ARCH-MOD-004 TEST-007 A01..A30"
```

**退出门：** 30 项全部有可重放 evidence；lint/typecheck/test/build/production smoke
退出 0；运行主路径不存在双数据库、双调度器、双 Agent Runtime、双 source 主通道或
双帧时钟；未 push。

---

## Track N7 完成条件

- [ ] N7.1–N7.6 均有本地 Conventional Commit、精确 evidence 与可重放命令。
- [ ] 锁定 workflowVersion 贯穿 command fingerprint、attempt、checkpoint、
  `CvcCompositionBundleV1`、`RenderableBundleDescriptorV1`、render receipt 与 final
  provenance。
- [ ] 真实本地 PG + Trigger dev + Pi + compiler + HyperFrames + media/compose 闭环
  成功；N7 付费调用恰好一次 live FABRICATE。
- [ ] retry、cancel、crash、reconciler、global idempotency、stale attempt、跨
  workspace 与 sandbox 全部通过。
- [ ] golden 像素、同帧 hash、contact sheet、ffprobe、decode、final hash 与浏览器
  证据已人工查看真实输出。
- [ ] legacy runtime 清退完成，prohibited dependency scan 为 0，A01–A30 全绿。
- [ ] 唯一状态账本与 delivery report 同步；Issue 不维护第二份状态汇总；未 push。
