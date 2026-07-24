---
doc_id: CVC-ARCH-V3
version: 3.0.0
status: active
effective_date: 2026-07-24
normative_scope: architecture-and-execution
supersedes:
  - CVC-PLATFORM-ARCH-2026-07-23
depends_on:
  - CVC-PRODUCT-V3@3.0.0
  - ADR-0001
  - ADR-0002
  - ADR-0003
  - ADR-0004
---

# CodeVideoCanvas Architecture & Execution Spec v3

## 0. 文档合同

本文是 v3 技术合同的唯一权威。出现实现与本文不一致时：

1. 若产品需求未变，建立 drift Task 修实现；
2. 若必须改变合同，先新增/修订 ADR 与本 Spec；
3. Task 执行者禁止自行选择另一套架构。

规则 ID 前缀：

- `ARCH-DEC-*`：已接受决策；
- `ARCH-MOD-*`：模块/依赖；
- `EXEC-*`：运行时执行；
- `DATA-*`：数据库；
- `CONTRACT-*`：版本化 DTO/Port；
- `SEC-*`：安全；
- `TEST-*`：架构验收。

---

## 1. 已接受决策

| ID | MUST |
|---|---|
| `ARCH-DEC-001` | Postgres 是唯一活动结构化数据源 |
| `ARCH-DEC-002` | Trigger.dev 是唯一异步编排器 |
| `ARCH-DEC-003` | Pi Agent 是 CVC 唯一 Agent Runtime |
| `ARCH-DEC-004` | 禁止引入 OpenAI Agents SDK 主链路或 fallback |
| `ARCH-DEC-005` | 模型调用只允许四种 `AiTaskKind` |
| `ARCH-DEC-006` | 标准渲染链是 source → compiler → bundle → HyperFrames |
| `ARCH-DEC-007` | Postgres 保存业务事实；Trigger 保存执行事实 |
| `ARCH-DEC-008` | PurpleInk 只共享 DTO/Port/Compiler/Render 合同 |
| `ARCH-DEC-009` | 登录、R2、计费、协作不进入 v3 |
| `ARCH-DEC-010` | 本轮保留 pnpm/Node 22 基线，版本按 Track Spike 精确锁定 |

禁止在实现中提供 SQLite、进程内 queue、Agents SDK 或 legacy renderer 的长期“保险
fallback”。迁移窗口必须有明确 Track 和退出条件。

---

## 2. 质量属性

- **Deterministic**：最终像素是版本化输入与帧的纯函数；
- **Recoverable**：已提交 checkpoint 不因进程失败丢失；
- **Auditable**：每个 artifact 可追溯输入、版本、attempt 与 hash；
- **Replaceable**：模型、artifact store、render provider 在 port 后；
- **Observable**：用户看到业务状态，开发者看到执行状态，两者可对账；
- **Simple**：只有一个数据库、编排器、Agent Runtime 和默认帧时钟；
- **Bounded**：文件、函数、依赖和 task 数量有明确上限。

---

## 3. 系统与信任边界

### 3.1 Browser

浏览器是不可信边界：

- 只能接收脱敏 DTO、scoped realtime token 和 artifact ID；
- 不得接收 provider API key、Storage key、本机绝对路径、原始 hidden reasoning；
- 浏览器 extractor 只用于预览，不能签发通过结论。

### 3.2 Next.js

Next.js 负责：

- Server Component read model；
- command API；
- scoped Realtime token；
- artifact download/preview authorization；
- UI DTO 组装。

Next route handler 不负责长任务、模型循环、逐帧渲染或 FFmpeg。

### 3.3 Trigger task runtime

Task runtime 负责调用 application service 和外部工具。开发时通过 `trigger dev` 在
本机执行；部署时必须运行在可访问 Postgres/ArtifactStore 的受控环境。

### 3.4 External providers

StepFun、Gemini、TTS/ASR 和未来媒体 API 都是不可信外部依赖。其响应必须经过应用
schema/semantic gate；其错误必须归类后再决定重试。

### 3.5 Generated source

模型生成的 HTML/CSS/JS 永远是不可信代码。只允许在 G1–G5 通过后，由 compiler
装入受控 shell，再在断网、受限 CSP 的 render workspace 执行。

---

## 4. 模块与依赖

### `ARCH-MOD-001` 薄入口

`src/app/**` 和 `trigger/tasks/**` 只做输入验证、鉴权/上下文、调用公开 service 和
映射输出。

### `ARCH-MOD-002` 领域公开入口

每个领域通过 `index.ts` 或明确的 application service 导出公开能力。跨域禁止 deep
import repository/schema/infrastructure。

### `ARCH-MOD-003` 依赖方向

```text
app / trigger
    → application
    → domain contracts
    ← infrastructure adapters
```

### `ARCH-MOD-004` 禁止依赖

- canvas → Trigger/Pi/Drizzle/HyperFrames；
- ai/domain → CanvasNodeType；
- render → director；
- compiler → Next/DB/Trigger/Pi；
- UI → server repository/provider；
- task → Drizzle table；
- API → provider client/artifact path。

### `ARCH-MOD-005` 文件职责

- 页面目标 ≤200 行，硬上限 300；
- 一般生产文件目标 ≤250 行，硬上限 350；
- schema/repository 目标按聚合拆分，硬上限 400；
- 函数 ≤50 行；
- 一个文件只能有一个主要变化原因；
- 例外必须在 Task 卡写出原因和后续拆分，不得默许。

---

## 5. Canvas DAG 与执行 DAG

### `EXEC-DAG-001` 双图分离

Canvas DAG 是用户可见业务投影；Trigger DAG 是执行实现。两者不得一一绑定。

### `EXEC-DAG-002` 七任务上限

活动 task ID 仅：

```text
cvc.pipeline.run
cvc.project.plan
cvc.shot.generate
cvc.shot.media
cvc.shot.render
cvc.shot.qa
cvc.project.compose
```

新增 task 必须通过 ADR 证明存在独立资源、重试或部署边界。

### `EXEC-DAG-003` Canvas 映射

| Trigger task | Canvas/业务投影 |
|---|---|
| `project.plan` | `script-import`、`shot-split`；事务性 fan-out |
| `shot.generate` | Shot 合同 checkpoint → `shot-script`；source checkpoint → `shot-codegen` |
| `shot.media` | 独立提交 `shot-sfx`、`shot-subtitle` 子结果 |
| `shot.render` | 更新 code 节点的 render substate 和 render artifact |
| `shot.qa` | `shot-qa` |
| `project.compose` | `score`、`export` |

一个 task 更新多个节点时，必须分 checkpoint 事务提交。后半失败不得回滚已持久化且
仍有效的前半 artifact。

### `EXEC-DAG-004` 唯一 readiness

只有 `ExecutionPolicy` 可以决定节点/run 是否 ready。`blocked` 是带理由的派生状态，
不写入执行状态列。

### `EXEC-DAG-005` Shot 依赖

`shot.media` 必须消费 `shot.generate` 已提交的 `ShotSpecV1`，因此执行边为
`shot.generate → shot.media`，不是 `project.plan → shot.media`。`shot.generate`
成功后，`shot.media` 与 `shot.render` 可并行；`project.compose` 同时等待 media
结果与 `shot.qa`。

---

## 6. 状态合同

```ts
export type NodeExecutionStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'stale'

export type PipelineRunStatus =
  | 'triggering'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type TaskAttemptStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'superseded'
```

### `EXEC-STATE-001` 合法迁移

```text
idle/stale/failed/cancelled → queued
queued → running/cancelled/failed
running → succeeded/failed/cancelled
succeeded → stale
```

非法迁移必须在 repository compare-and-swap 中失败，不能只靠 TypeScript。

### `EXEC-STATE-002` Trigger 映射

Trigger status 只用于 live execution view。业务状态由 task application service 在
开始、checkpoint、终止事务中写入；页面完成/断线后重新拉 Snapshot 对账。

### `EXEC-STATE-003` 状态所有权

- `task_attempts` 的 checkpoint/terminal 是步骤级业务真源；
- `pipeline_runs.status` 是持久化聚合状态；
- `canvas_nodes.status` 是可重建的产品投影，只能与 attempt/artifact commit 在同一
  事务更新，不接受独立状态命令；
- Trigger status 只负责 transport/live view；
- Realtime event 不得直接写入业务 terminal 状态。

---

## 7. Command、幂等与 attempt

### `EXEC-CMD-001` 两阶段启动

1. API 事务性验证命令并插入 `command_receipts`、`pipeline_runs(triggering)`；
2. 用
   `idempotencyKeys.create(key, { scope: 'global' })`
   创建稳定 key 并触发 `cvc.pipeline.run`；
3. 回写 Trigger run ID 和业务 `queued`；
4. 中间崩溃后相同命令重试或 reconciler 必须命中 receipt/Trigger global key，
   补发/查询同一 run，再回写 handle。

同 receipt key 且同 fingerprint 返回原始或当前 result；同 key 但 fingerprint 不同
返回 `409 Conflict`。

### `EXEC-CMD-002` Fingerprint

所有 fingerprint 使用版本化 canonical JSON 后 SHA-256。输入必须包括
canonicalizer version、workflow version、用户 intent（retry/regenerate/rerender）、
实体/输入 artifact hash，以及模型任务适用的 model policy revision、已解析
provider/model。对象 key 排序，禁止把 `JSON.stringify()` 的运行时偶然顺序当公共
协议。

### `EXEC-CMD-003` Task key

```text
sha256(
  canonicalizerVersion + workflowVersion + intent + taskId +
  workspaceId + entityType + entityId + sorted(inputArtifactHashes) +
  modelPolicyRevision + resolvedProviderAndModelWhenApplicable
)
```

所有 CVC pipeline/task key 都显式创建 global scope；禁止依赖 SDK 默认 scope。

### `EXEC-CMD-004` Attempt fencing

- attempt 单调递增；
- task commit 必须携带 attempt ID；
- 非当前 attempt 的 commit 返回 `STALE_ATTEMPT`；
- retry 只能复用 input fingerprint、workflow/compiler/schema pins 相同的 checkpoint；
- 同 entity/input 的成功 artifact 命中时不得重新计费调用。

---

## 8. Trigger.dev 合同

### `EXEC-TRIGGER-001` Task 薄层

Task 文件只允许：

1. payload schema parse；
2. 创建 execution context；
3. 调用 application service；
4. 检查 child/batch Result；
5. 映射稳定 output。

不得包含 Drizzle 查询、prompt、source parser、FFmpeg 参数拼装或 UI DTO。

### `EXEC-TRIGGER-002` 队列

初始队列固定：

```ts
ai:      concurrencyLimit = 2
render:  concurrencyLimit = 1
media:   concurrencyLimit = 2
compose: concurrencyLimit = 1
```

只有实测配额或 CPU/内存数据才能修改。禁止为每个 Shot 或 task 创建 queue。

### `EXEC-TRIGGER-003` 并行

- 同类型批量使用 `batchTriggerAndWait`；
- 异类批量使用 SDK 提供的按 task batch wait；
- 禁止 `Promise.all()` 包围 `triggerAndWait()`；
- 每个 Result 必须检查 `ok`；
- 子任务必须显式传 tags。

### `EXEC-TRIGGER-004` Tags

每个 run 至少携带：

```text
workspace:<id>
project:<id>
pipeline:<id>
shot:<id>       # shot task only
```

tags 用于查询/Realtime，不存业务 payload。

### `EXEC-TRIGGER-005` 重试分类

| 错误 | 处理 |
|---|---|
| network/429/timeout/worker crash | Trigger retry ≤3 |
| credential/permission | 不重试，等待配置修复 |
| schema/semantic/gate | 同 task 内容修复 |
| stale attempt/input changed | 不重试，标 superseded |
| compiler contract bug | task 失败，禁止模型修基础设施 |

### `EXEC-TRIGGER-006` 取消与清理

取消 signal 必须转发 Pi、HyperFrames/Playwright 和 FFmpeg。所有 temp 路径包含 attempt
ID，正常/异常均在 `finally` 清理；`onCancel` 不是唯一清理保证。

### `EXEC-TRIGGER-007` Realtime

- run status 使用 Realtime run subscription；
- Agent 用户可见的 bounded progress/safe trace 使用 typed stream，禁止 raw model delta；
- token 由服务端签发并限制到所需 run/tag；
- stream/metadata 不作为业务真源。

---

## 9. Pi Agent 与模型合同

### `CONTRACT-AI-001` Task kind

```ts
export const AI_TASK_KINDS = [
  'project-plan',
  'shot-spec',
  'fabricate',
  'vision-qa',
] as const

export type AiTaskKind = (typeof AI_TASK_KINDS)[number]
```

CanvasNodeType、Trigger task ID 和 provider ID 都不得替代 `AiTaskKind`。

### `CONTRACT-AI-002` Port

```ts
export interface AiTaskRequest<TInput> {
  task: AiTaskKind
  input: TInput
  context: {
    workspaceId: string
    projectId: string
    runId: string
    attemptId: string
    shotId?: string
  }
  signal?: AbortSignal
}

export interface AiTaskContract<TInput, TOutput> {
  inputSchema: z.ZodType<TInput>
  outputSchema: z.ZodType<TOutput>
  terminalToolName:
    | 'submit_project_plan'
    | 'submit_shot_spec'
    | 'submit_shot_source'
    | 'submit_vision_report'
  systemPrompt: (input: TInput) => string
  userPrompt: (input: TInput) => string
  semanticValidate: (output: TOutput) => ContractIssueV1[]
}

export interface AiTaskResult<TOutput> {
  output: TOutput
  model: { provider: 'stepfun' | 'gemini'; modelId: string }
  usage?: { inputTokens: number; outputTokens: number }
  trace: SafeTraceEventV1[]
}

export interface AiTaskRuntime {
  run<TInput, TOutput>(
    request: AiTaskRequest<TInput>,
    contract: AiTaskContract<TInput, TOutput>
  ): Promise<AiTaskResult<TOutput>>
}
```

### `CONTRACT-AI-003` ModelPolicy

只有 `ModelPolicy.resolve(task, workspaceSettings)` 可选择 provider/model。默认路由与
用户覆盖写在同一模型中；feature/task/UI 不得构造 client 或读取模型环境变量。

### `CONTRACT-AI-004` ProviderRegistry

只有 ProviderRegistry 可创建 pi-ai provider/model。StepFun 使用受支持的
OpenAI-compatible API adapter；Gemini 使用原生 Google adapter。API key 由
`ProviderCredentialStore` 在服务端解析。

### `CONTRACT-AI-005` PiStructuredRunner

- 唯一 import Pi `Agent` 的生产文件；
- 每 attempt 新建短生命周期 Agent；
- 仅挂一个 terminal Tool；
- Tool 参数经 schema 验证；
- result details 保存已验证 output；
- 所有成功 Tool 返回 `terminate: true`；
- 无 Tool、多个 terminal Tool 或混合 Tool batch 均为 content failure；
- 内容修复最多两次，vision 最多一次；
- transport error 向上抛给 Trigger。

`cvc.shot.generate` 必须顺序执行两个独立 invocation/session：先以
`submit_shot_spec` 结束 spec Agent 并提交 `ShotSpecV1` checkpoint，再创建全新的
Agent，以 `submit_shot_source` 结束 fabricate。两个 invocation 不共享 messages、
Tool 或 repair 历史；fabricate repair 只在 fabricate invocation 边界内进行。

### `CONTRACT-AI-006` Safe trace

允许的 trace：

```ts
export type SafeJsonValue =
  | null
  | boolean
  | number
  | string
  | SafeJsonValue[]
  | { [key: string]: SafeJsonValue }

export type SafeTraceEventV1 =
  | { type: 'model_started'; provider: string; modelId: string; at: string }
  | { type: 'progress'; code: string; label: string; at: string }
  | { type: 'tool_started'; tool: string; argumentKeys: string[]; at: string }
  | { type: 'tool_completed'; tool: string; ok: boolean; resultCode: string; at: string }
  | { type: 'repair_requested'; issueCodes: string[]; at: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; at: string }
  | { type: 'completed'; at: string }
  | { type: 'failed'; code: string; userMessage: string; at: string }
```

raw assistant delta、Tool 参数值、provider 原始错误、prompt、source、credential 和
hidden thinking/reasoning MUST NOT 进入 stream、DB、artifact 或 UI。TraceMapper
必须对所有字符串、数组、深度、节点数和总字节数做边界限制与脱敏；结构化扩展只允许
`SafeJsonValue`。前端 JSON viewer 只使用 React text node，默认上限 depth 6、
node 500、copy 64 KiB，禁止 `dangerouslySetInnerHTML`。

### `CONTRACT-AI-007` 会话

业务恢复依赖 checkpoint/artifact，不依赖 Pi JSONL。若保留 JSONL：

- 仅存于 attempt workspace；
- 结束后作为诊断 artifact 上传；
- 不被业务查询；
- 不跨 Shot 共享；
- 不含未脱敏凭据。

---

## 10. Source、Patch 与 Normalizer

### `CONTRACT-SOURCE-001`

```ts
export interface ShotSourcePackageV1 {
  schemaVersion: 'cvc.shot-source/v1'
  bodyFragment: string
  css: string
  setupJs: string
  timelineJs: string
}
```

四字段必须存在；`bodyFragment` 必须非空，其余无内容使用空字符串，不使用
`undefined`。`setupJs` 只能做同步、确定性的初始 DOM 设置；`timelineJs` 只能向
compiler 提供的 paused GSAP timeline 添加 tween，不得注册全局时钟、
`__CVC_RENDER__`、play/ticker/timer。

### `CONTRACT-SOURCE-002`

```ts
export interface ShotSourcePatchV1 {
  schemaVersion: 'cvc.shot-source-patch/v1'
  baseContentHash: string
  changes: Partial<Pick<
    ShotSourcePackageV1,
    'bodyFragment' | 'css' | 'setupJs' | 'timelineJs'
  >>
}
```

应用 patch 前必须确认 base hash 仍是节点当前版本。

### `CONTRACT-SOURCE-003` 匹配顺序

1. strict object；
2. 完整 JSON；
3. 单一外层 JSON fence；
4. 唯一明确四段 fence；
5. 单一完整 HTML legacy adapter；
6. 拒绝。

禁止“第一个 `{` 到最后一个 `}`”、自动补标签、静默丢额外正文或从多个 script 中
猜 timeline。

### `CONTRACT-SOURCE-004` 双端使用

`packages/contracts/source-normalizer-core` 必须 browser-safe，前端用于预览；服务端
使用同一纯核心后继续执行安全/语义门禁。只有服务端结果可提交 artifact。

---

## 11. 门禁与 compiler

### `CONTRACT-GATE-001` Gate result

```ts
export interface ContractIssueV1 {
  code: string
  severity: 'error' | 'warning'
  path?: string
  message: string
  hint?: string
}

export interface GateResultV1 {
  gate: `G${1|2|3|4|5|6|7|8|9|10}`
  status: 'passed' | 'failed' | 'skipped'
  issues: ContractIssueV1[]
  evidenceArtifactId?: string
}
```

### `CONTRACT-GATE-002` G1–G10

- G1 normalize 唯一性；
- G2 strict schema/长度；
- G3 HTML/CSS/JS syntax；
- G4 安全：无外链、fetch/XHR/WebSocket/import/eval/Function/Worker/storage/cookie；
- G5 确定性：无 wall clock、rAF、ticker、timer、无种子随机、无限循环；
- G6 compiler shell/timing/id/timeline；
- G7 HyperFrames check；
- G8 0/中/末/乱序 seek；
- G9 同帧双拍 hash + 非空样本；
- G10 ffprobe/stream/duration/size/entity hash。

### `CONTRACT-COMPILER-001` Compile input

```ts
export interface CompileShotInputV1 {
  source: ShotSourcePackageV1
  renderSpec: {
    compositionId: string
    width: number
    height: number
    fps: number
    durationSeconds: number
    seed: string
  }
  assets: readonly AssetRefV1[]
  versions: {
    workflow: string
    compiler: string
    sourceSchema: 'cvc.shot-source/v1'
  }
}
```

模型不得控制 `renderSpec` 和版本。

### `CONTRACT-COMPILER-002` Bundle

```ts
export interface RenderableBundleDescriptorV1 {
  schemaVersion: 'renderable-bundle-descriptor/v1'
  format: 'hyperframes-html/v1'
  entryPath: string
  files: readonly {
    path: string
    sha256: string
    mediaType: string
    byteSize: number
  }[]
  width: number
  height: number
  fps: number
  durationSeconds: number
  requiredHyperframesVersion: string
  bundleHash: string
  provenanceDigest: string
}

export interface CvcCompositionBundleV1 {
  schemaVersion: 'cvc.composition-bundle/v1'
  entryHtml: 'index.html'
  files: readonly {
    path: string
    sha256: string
    mediaType: string
    byteSize: number
  }[]
  manifest: {
    compositionId: string
    width: number
    height: number
    fps: number
    durationSeconds: number
    sourceHash: string
    assetHashes: readonly string[]
    workflowVersion: string
    compilerVersion: string
    requiredHyperframesVersion: string
    provenance: ArtifactProvenanceV1
  }
  renderable: RenderableBundleDescriptorV1
}
```

`bundleHash` 对不含自身 hash 的 canonical manifest core 与实体 file hash 计算。
files 按 path 排序，asset hash 排序，数字/字符串按版本化 canonicalizer 编码；输入枚举
顺序变化不得改变 hash。

### `CONTRACT-COMPILER-003` 纯度

compiler 不访问网络、DB、ArtifactStore、clock 或随机全局状态。相同 canonical input
必须输出 byte-for-byte 相同文件和 bundle hash。

### `CONTRACT-HF-001`

compiler 输出必须满足 HyperFrames：

- 固定尺寸 root；
- app-owned duration；
- 声明式 clip timing/track；
- 同步注册 paused timeline；
- composition ID 与 timeline key 一致；
- media 由 framework 合同管理；
- render-time 无网络。

### `CONTRACT-HF-002`

首版通过 pin 的 HyperFrames CLI 执行 check/snapshot/render。禁止运行期 `npx --yes`
下载不固定版本，禁止直接绑定 experimental fast capture。

---

## 12. Render、Artifact 与 Workspace

### `CONTRACT-RENDER-001`

```ts
export interface RenderTaskV1 {
  schemaVersion: 1
  workspaceId: string
  projectId: string
  shotId: string
  runId: string
  attemptId: string
  bundleArtifactId: string
  expectedBundleHash: string
}

export interface RenderReceiptV1 {
  schemaVersion: 1
  provider: 'hyperframes' | 'legacy'
  outputArtifactId: string
  contentHash: string
  mediaProbe: MediaProbeV1
  gateResults: readonly GateResultV1[]
}
```

N4 切换后默认 provider 必须为 `hyperframes`；legacy 只允许显式 migration flag，N7
删除。

### `CONTRACT-STORE-001`

```ts
export interface WorkspaceScope {
  workspaceId: string
  projectId: string
  runId: string
  attemptId: string
}

export interface ArtifactStore {
  put(scope: WorkspaceScope, input: PutArtifactInput): Promise<StoredArtifact>
  get(scope: WorkspaceScope, artifactId: string): Promise<Uint8Array>
  head(scope: WorkspaceScope, artifactId: string): Promise<ArtifactHead | null>
}

export interface ArtifactGcStore {
  removeForGc(
    scope: Pick<WorkspaceScope, 'workspaceId'>,
    artifactId: string,
    capability: GcCapability
  ): Promise<void>
}

export interface RenderWorkspace {
  create(scope: WorkspaceScope): Promise<WorkspaceHandle>
  materialize(
    scope: WorkspaceScope,
    artifactId: string,
    workspace: WorkspaceHandle,
    relativePath: string
  ): Promise<string>
  cleanup(workspace: WorkspaceHandle): Promise<void>
}
```

ArtifactStore 自行生成 storage key；业务代码只持有 workspace-scoped artifact ID，
不能接收 raw key。删除能力仅向 GC service 暴露，失败且未 commit 的上传通过 upload
token 回收。远端 store 不实现 `localPath()`。只有 RenderWorkspace 可以给
CLI/FFmpeg 提供位于 attempt root 内的安全相对路径；绝对路径不得持久化、记录日志或
返回 UI。

### `CONTRACT-ART-001` 原子提交

1. 写临时对象；
2. 计算实体 SHA-256/size；
3. attempt fence；
4. Postgres 事务插入 immutable artifact 与业务引用；
5. 事务失败补偿删除临时对象；
6. 成功后不得原地覆盖。

### `CONTRACT-ART-002` Hash

- input fingerprint：输入寻址；
- bundle hash：编译产物寻址；
- render key：渲染缓存寻址；
- content hash：最终实体字节。

四者不得混用。

---

## 13. Postgres 数据合同

### `DATA-001` 基础约定

- SQL `snake_case`；
- UUID；
- `timestamptz`；
- `jsonb` 只承载版本化 payload/metadata；
- workspace 业务表 `(workspace_id,id)` PK；
- 复合 FK 包含 workspace；
- text + named CHECK 表示状态；
- 聚合带 `revision bigint`；
- 所有 migration 生成、审阅并提交 SQL；
- app/worker 启动时不自动 generate/push schema。

### `DATA-002` 表与职责

| 表 | 必需字段/约束 |
|---|---|
| `workspaces` | id、slug unique、name、timestamps |
| `projects` | workspace/id、title、script、status、workflow_version、revision |
| `canvas_nodes` | project FK、logical_key unique/project、type/stage/status CHECK、data |
| `canvas_edges` | project/source/target 复合 FK、唯一 edge |
| `pipeline_runs` | project、Trigger ID、status、workflow_version、fingerprint、revision |
| `task_attempts` | run/task/entity、`attempt_no`（Trigger/worker）、status/fingerprint/checkpoint/failure；组合 unique 与 attempt fence |
| `artifacts` | aggregate type/id、kind、version、lifecycle、schema、storage、size/hash、attempt、supersedes；组合唯一版本 |
| `command_receipts` | UUID id、command、idempotency key、fingerprint、status、result；`(workspace_id,idempotency_key)` unique |
| `model_routes` | `(workspace_id,ai_task_kind)` unique、provider/model、revision；不存 secret |
| `provider_credentials` | workspace/provider、ciphertext、key_version、verified_at；无明文 fallback |
| `ai_invocations` | run/attempt/task、`invocation_no`、`repair_no`、provider/model、input/output hash、usage、trace artifact |

### `DATA-003` Secrets

- `model_routes` 不存密钥；
- credential 通过 `ProviderCredentialStore`；
- local implementation 使用应用层 authenticated encryption，master key 只来自服务端
  secret/env；
- API 只返回存在/已验证/更新时间，不返回 ciphertext；
- 生产可替换外部 secret manager，不改变业务合同；
- master key 缺失时禁止保存新 credential，不得回退明文。

### `DATA-004` 不建通用 run_events

业务快照由 run/attempt/node/artifact 查询投影。Trigger 日志/状态留在 Trigger。
`ai_invocations` 只记录明确字段；safe trace 作为 versioned artifact。

### `DATA-004A` Artifact 生命周期

- lifecycle 仅 `draft/approved/released/rejected`；
- 唯一版本键为
  `(workspace_id,aggregate_type,aggregate_id,kind,version)`；
- DB trigger 阻止 `approved/released` artifact 被 update/delete；
- `content_hash` 始终是实体字节 SHA-256。

### `DATA-005` 事务

- 项目 + 全局节点同一事务；
- plan + Shot fan-out 同一事务；
- task start/checkpoint/finish 各自有 CAS 事务；
- artifact commit 与业务引用同一事务；
- receipt 与 run 创建同一事务；
- 多 provider 网络调用不得持有 DB transaction。

### `DATA-006` SQLite 迁移

1. 盘点 `.data/app.db`、WAL/SHM 与持有进程；
2. 使用 SQLite Online Backup API 生成一致性快照，禁止对活动 WAL 数据库直接
   `Copy-Item`；
3. 对快照执行 `PRAGMA quick_check`、逐表计数与 SHA-256；
4. export versioned JSONL/JSON 与 `.data` artifact manifest；
5. 导入 PG；
6. 对账 project/node/edge/job/artifact/settings 的计数、主键和 hash；
7. 旧 DB 与备份保留只读；
8. 应用 runtime 删除 SQLite；
9. 迁移工具不得写原 DB。

---

## 14. Snapshot 与 UI DTO

### `CONTRACT-RUN-001`

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

### `CONTRACT-RUN-002` 字段来源

每个 UI Task 必须维护 field-source matrix，来源只能是：

- Snapshot 字段；
- Trigger Realtime run/typed stream；
- artifact DTO；
- 明确的 local optimistic command state。

静态演示值不能进入正式路由。

### `CONTRACT-RUN-003` 对账

页面首次加载/刷新/Realtime 断线/终态后重新拉 Snapshot。Realtime 更新可以暂时覆盖
live presentation，但不能修改业务快照缓存为不可能状态。

---

## 15. 媒体与合成

### `CONTRACT-MEDIA-001`

音频、字幕、SFX、BGM 使用 versioned manifest：

```ts
export interface MediaManifestV1 {
  schemaVersion: 1
  projectId: string
  shotId?: string
  entries: readonly {
    role: 'voice' | 'sfx' | 'bgm' | 'subtitle'
    artifactId: string
    startMs: number
    durationMs: number
    volume?: number
  }[]
}
```

### `CONTRACT-MEDIA-002`

模型不得猜音频时长。TTS/ASR/provider receipt 与实际媒体 probe 是时间事实。

### `CONTRACT-MEDIA-003`

最终 verify 必须按项目配置检查：

- 一条视频流；
- required 时至少一条音频流；
- 字幕为内嵌/外挂/烧录中的明确一种；
- 尺寸、时长容差；
- 非空帧；
- 可完整 decode；
- 实体 SHA-256。

---

## 16. PurpleInk 合同

### `CONTRACT-PINK-001`

允许共享：

```text
StructuredModelPort
ContractIssueV1
ArtifactProvenanceV1
RenderableBundleDescriptorV1
RenderTaskV1
RenderReceiptV1
MediaProbeV1
canonical hash fixtures
```

### `CONTRACT-PINK-002`

禁止自动共享：

- Agent SDK/runtime/session；
- Postgres 表全集；
- Auth/workspace membership；
- Trigger project/task；
- UI；
- source compiler input；
- R2 实现；
- package manager。

### `CONTRACT-PINK-003`

CVC source compiler 输出 `CvcCompositionBundleV1`，PurpleInk plan compiler 输出
`PurpleInkCompositionBundleV1`；二者通过 adapter 导出共同的
`RenderableBundleDescriptorV1`，并用 descriptor/render conformance fixture 对齐。
两个实现各自成功生产至少一个稳定 release 前，不提取共享 package。

---

## 17. 安全与确定性

### `SEC-001` 凭据

禁止 `NEXT_PUBLIC_*` key、客户端 key、日志 key、artifact key 明文、commit key。

### `SEC-002` Generated source sandbox

- network disabled；
- CSP 默认拒绝外部连接；
- 禁 Node integration；
- 每 attempt 使用独立 browser context；风险等级要求时使用独立 browser process；
- bundle root 是唯一可见文件根，拒绝 `file://`/相对路径逃逸；
- 只 materialize allowlisted assets；
- temp workspace attempt scoped；
- 超时、内存、进程数、输出字节和 console 条目有界；
- 捕获 console/error 但脱敏。

### `SEC-003` Determinism

render source 禁：

```text
requestAnimationFrame
GSAP ticker/play
Date.now / performance.now
unseeded Math.random
setTimeout / setInterval
render-time fetch
infinite repeat
input/hover/scroll dependent state
```

应用 UI 不受 render 确定性约束，但必须遵循 motion/reduced-motion 规范。

---

## 18. 版本

```ts
export interface WorkflowVersionV1 {
  workflow: string
  contracts: string
  compiler: string
  hyperframes: string
  renderImage: string
}
```

任何影响 prompt contract、normalizer、gate、compiler、HF 版本或 render image 的变化
必须改变对应版本并使缓存 key 失效。

---

## 19. 测试层

### `TEST-001` Contract unit

- schema strictness；
- state transitions；
- canonical hash；
- canonical manifest 在输入枚举乱序时保持相同 bundle hash；
- normalizer 成功/拒绝矩阵；
- model policy exhaustive；
- safe trace redaction、depth/node/byte/copy bounds；
- compiler byte determinism。

### `TEST-002` Postgres integration

- fresh migrations；
- composite FK/CHECK/unique；
- CAS/attempt fence；
- stale attempt publish rejection；
- same receipt key/same fingerprint replay；
- same receipt key/different fingerprint `409`；
- cross-workspace artifact/raw-key rejection；
- artifact immutability；
- import reconciliation。

### `TEST-003` Trigger integration

- simple task；
- seven-task graph；
- result checking；
- retry/cancel；
- idempotency；
- Realtime token/subscription；
- checkpoint skip。

### `TEST-004` Provider contract

- Pi terminal Tool fixture/transcript；
- StepFun/Gemini mock；
- 每 Track 受预算控制的真实 smoke；
- credential/429/timeout/content error 分类。

### `TEST-005` Render

- HF check；
- snapshots；
- random seek；
- same-frame hash；
- MP4 probe/decode；
- temp cleanup。

### `TEST-006` Browser

- RunControl；
- refresh/reconnect；
- Inspector 四页签；
- field-source truth；
- keyboard/reduced motion；
- artifact download。

### `TEST-007` Release E2E

真实本地 Postgres + Trigger dev + Pi + compiler + HyperFrames + media/compose。
Fixture-only 不能宣称真实 FABRICATE；真实调用和受控 fixture 必须分别标注。

---

## 20. 迁移与清退

| 旧路径 | 替代 | 删除 Track |
|---|---|---|
| SQLite runtime | Postgres | N1 |
| in-process queue | Trigger | N2 |
| stream-bus/SSE | Trigger Realtime/Streams | N2 |
| node-type model routing | AiTaskKind ModelPolicy | N3 |
| direct OpenAI client | Pi ProviderRegistry | N3 |
| raw HTML main path | ShotSourcePackage/normalizer | N4 |
| `__CVC_RENDER__` default | HyperFrames | N4/N7 |
| director↔render cycle | contracts/application services | N4/N5 |
| fake UI fields | Snapshot/Realtime | N6 |

删除必须在替代路径通过 Track Gate 后发生；不得为了暂时绿测试保留无期限 fallback。
