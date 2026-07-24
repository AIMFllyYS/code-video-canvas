# CodeVideoCanvas 重构蓝图 v3 · 第二册：目标架构

> 状态：Accepted
> 架构风格：模块化单体 + 外部执行编排 + 独立可分享 compiler package
> Agent 决策：Pi Agent 保留；业务代码禁止感知 Agent SDK 类型
> 部署目标：本地开发优先，生产云就绪

---

## 1. 十五条架构原则

1. **一个事实一个真源**：业务事实进 Postgres；执行事实由 Trigger 提供。
2. **Canvas DAG 是产品视图，不是调度器实现。**
3. **Trigger task 只按重试、并发、资源隔离边界拆分。**
4. **仅四类 `AiTaskKind` 调用 LLM。**
5. **仅一个模块可以 import Pi `Agent`。**
6. **LLM 选择只发生在 `ModelPolicy`；TTS/ASR 选择只发生在 `MediaProviderPolicy`。**
7. **模型输出永远是不可信输入。**
8. **Canonical source 是结构化 fragments，不是自由 HTML。**
9. **编译器拥有 shell、时钟、尺寸、duration、seed 和资产装配。**
10. **HyperFrames 是唯一终态帧时钟。**
11. **artifact 不可变且按 attempt/version 寻址。**
12. **远端 ArtifactStore 与本地 RenderWorkspace 分离。**
13. **UI 可见字段必须能追溯到 DTO 字段。**
14. **共享合同优先于共享 SDK 或仓库目录。**
15. **新增复杂度必须替换旧复杂度，不能长期并存。**

---

## 2. 系统上下文

```mermaid
flowchart TB
  Browser["Browser / Next.js UI"]
  Next["Next.js App Router<br/>API + Server Components"]
  PG["Postgres"]
  Trigger["Trigger.dev"]
  Worker["Trigger task runtime"]
  Models["StepFun / Gemini"]
  HF["HyperFrames CLI"]
  FF["FFmpeg / ffprobe"]
  Store["ArtifactStore"]

  Browser --> Next
  Next --> PG
  Next --> Trigger
  Trigger --> Worker
  Worker --> PG
  Worker --> Models
  Worker --> HF
  HF --> FF
  Worker --> Store
  Store --> PG
  Trigger -. Realtime .-> Browser
```

本地开发时 Next、Postgres、task 代码、HyperFrames 和 FFmpeg 在本机；Trigger Cloud
只提供调度控制面。生产部署时，Next、task runtime、Postgres 与 ArtifactStore
必须都处于彼此可访问的网络环境，不允许远端 worker 依赖开发者 `.data` 目录。

---

## 3. 目标目录

```text
.
├─ trigger.config.ts
├─ trigger/
│  ├─ tasks/
│  │  ├─ pipeline-run.ts
│  │  ├─ project-plan.ts
│  │  ├─ shot-generate.ts
│  │  ├─ shot-media.ts
│  │  ├─ shot-render.ts
│  │  ├─ shot-qa.ts
│  │  └─ project-compose.ts
│  ├─ queues.ts
│  ├─ streams.ts
│  ├─ tags.ts
│  └─ task-result.ts
├─ packages/
│  ├─ contracts/
│  │  └─ src/
│  │     ├─ ai.ts
│  │     ├─ artifact.ts
│  │     ├─ composition.ts
│  │     ├─ run.ts
│  │     └─ source.ts
│  └─ video-compiler/
│     └─ src/
│        ├─ compile.ts
│        ├─ manifest.ts
│        ├─ shell.ts
│        └─ validate.ts
├─ src/
│  ├─ app/                         # 路由/API；无业务编排
│  ├─ components/                  # Pencil/Playbook 视觉原语
│  ├─ features/
│  │  ├─ ai/
│  │  │  ├─ application/
│  │  │  │  ├─ ai-task-runtime.ts
│  │  │  │  └─ run-structured.ts
│  │  │  ├─ domain/
│  │  │  │  ├─ task-kind.ts
│  │  │  │  ├─ model-policy.ts
│  │  │  │  └─ trace-event.ts
│  │  │  └─ infrastructure/
│  │  │     ├─ pi-structured-runner.ts
│  │  │     ├─ provider-registry.ts
│  │  │     └─ terminal-tools.ts
│  │  ├─ artifacts/
│  │  │  ├─ source-normalizer.ts
│  │  │  ├─ gate-runner.ts
│  │  │  ├─ artifact-service.ts
│  │  │  └─ repository.ts
│  │  ├─ canvas/
│  │  ├─ canvas-workspace/
│  │  ├─ pipeline/
│  │  │  ├─ execution-policy.ts
│  │  │  ├─ run-service.ts
│  │  │  ├─ run-snapshot.ts
│  │  │  └─ repository.ts
│  │  ├─ render/
│  │  │  ├─ provider.ts
│  │  │  ├─ hyperframes-provider.ts
│  │  │  ├─ legacy-provider.ts
│  │  │  ├─ render-workspace.ts
│  │  │  └─ verify.ts
│  │  ├─ media/
│  │  │  ├─ media-manifest.ts
│  │  │  ├─ media-provider-policy.ts
│  │  │  ├─ media-provider-registry.ts
│  │  │  ├─ speech-provider.ts
│  │  │  ├─ shot-media-service.ts
│  │  │  └─ subtitle-build.ts
│  │  ├─ compose/
│  │  │  ├─ timeline.ts
│  │  │  ├─ mix.ts
│  │  │  ├─ concat.ts
│  │  │  ├─ compose-service.ts
│  │  │  └─ verify.ts
│  │  └─ navigation/
│  ├─ lib/
│  │  ├─ db/
│  │  │  ├─ client.ts
│  │  │  ├─ schema/
│  │  │  └─ migrations/
│  │  ├─ artifact-store/
│  │  ├─ determinism/
│  │  ├─ motion/
│  │  └─ version/
│  └─ server/
├─ scripts/
│  ├─ db/
│  ├─ migration/
│  └─ verification/
└─ docs/
```

目录是目标职责图，不要求在一个 Task 内机械搬完。每次移动必须由公开接口和测试
驱动，禁止先大规模改路径再补行为。

---

## 4. 依赖方向

```text
app / trigger
    ↓
application services
    ↓
domain contracts
    ↑
infrastructure adapters
```

硬约束：

- `features/canvas` 不 import Trigger、Pi、Drizzle、HyperFrames；
- `features/canvas-workspace` 只消费公开 Canvas/Pipeline DTO，不承载仓储或执行逻辑；
- `features/ai/domain` 不 import CanvasNodeType；
- `features/render` 不 import `features/ai`/`features/pipeline` 实现；
- `features/media` 负责 TTS/ASR/SFX/subtitle 与 provider adapter，不 import Pi 或
  compose 实现；
- `features/compose` 只消费 artifact/render/media contracts，不创建 provider 或
  模型客户端；
- `packages/video-compiler` 不 import Next、DB、Trigger、Pi；
- Trigger task 只调用公开 application service，不直接写 Drizzle 查询；
- API route 不拼 artifact path，不直接创建 provider/model/client；
- UI 不 import server-only schema/repository。

---

## 5. Trigger 任务图

```mermaid
flowchart TD
  Run["cvc.pipeline.run"]
  Plan["cvc.project.plan<br/>Pi: project-plan"]
  Generate["cvc.shot.generate × N<br/>Pi: shot-spec → fabricate"]
  Media["cvc.shot.media × N<br/>TTS/ASR/subtitle"]
  Render["cvc.shot.render × N<br/>normalize → gate → compile → HF"]
  QA["cvc.shot.qa × N<br/>rules + Pi vision-qa"]
  Compose["cvc.project.compose<br/>mix → concat → verify"]

  Run --> Plan
  Plan --> Generate
  Generate --> Render
  Generate --> Media
  Render --> QA
  Media --> Compose
  QA --> Compose
```

### 5.1 为什么 `shot-spec` 和 `fabricate` 不拆成两个 Trigger task

二者共用 Trigger task、AI 并发边界和 shot 上下文，但必须是两个独立、短生命周期的
Pi invocation/session，各自只挂自己的 terminal Tool。`cvc.shot.generate` 先完成
`shot-spec` invocation 并事务性提交 `ShotSpecV1` checkpoint，再新建 Agent 执行
`fabricate` invocation。若 worker crash，重试发现同一 input hash 的 spec 已存在就
跳过第一次付费调用。

结构化 repair 只发生在当前 invocation 内；spec 的消息、Tool 和 repair 历史不得泄漏
到 fabricate。这样既保留独立业务 artifact，又避免新增一层 parent/child wait 和
版本锁定。

### 5.2 队列

| queue | 初始并发 | 任务 |
|---|---:|---|
| `ai` | 2 | `cvc.project.plan`、`cvc.shot.generate`、`cvc.shot.qa` |
| `render` | 1 | `cvc.shot.render` |
| `media` | 2 | `cvc.shot.media` |
| `compose` | 1 | `cvc.project.compose` |

只有真实限额/资源数据证明需要时才拆分 vision queue 或增加 concurrency key。

### 5.3 幂等

Trigger task key：

```ts
sha256(canonicalJsonV1({
  canonicalizerVersion,
  workflowVersion,
  intent,
  taskId,
  workspaceId,
  entityType,
  entityId,
  inputArtifactHashes: sortedInputArtifactHashes,
  versionPins: applicableVersionPins,
  ...(aiTask
    ? { aiRoute: {
        policyRevision: modelPolicyRevision,
        provider: resolvedAiProvider,
        modelId: resolvedAiModelId,
      } }
    : {}),
  ...(mediaTask
    ? { mediaRoute: {
        routeRevision: mediaRouteRevision,
        provider: resolvedMediaProvider,
        modelId: resolvedMediaModelId,
      } }
    : {}),
}))
```

AI task 必须携带 `aiRoute`，media task 必须携带 `mediaRoute`；其他 task 省略不适用
route 字段。禁止把空字符串当作省略值。

业务命令使用 `command_receipts`，保存：

```text
(id, workspace_id, idempotency_key, command_type, request_fingerprint,
 status, result, created_at, updated_at)
```

Trigger key 必须显式用
`idempotencyKeys.create(key, { scope: 'global' })` 创建，不依赖 SDK 默认 scope。
同 receipt key 且同 fingerprint 返回原始/当前 result；同 key 但 fingerprint 不同
返回 `409 Conflict`。receipt 与 `pipeline_runs(triggering)` 在同一事务创建，随后才
dispatch Trigger；若进程在事务提交后、dispatch/回写前崩溃，重复命令或 reconciler
复用同一 global key 补发并回写 run handle。Trigger idempotency 防重复执行，receipt
防业务命令歧义；二者不追求虚假的 exactly-once。

### 5.4 重试与取消

- transport/429/timeout/worker crash：Trigger 指数退避，最多 3 次；
- schema/semantic/gate：同一次 task 内最多 2 次结构化 repair；
- 取消 signal 传入 Pi、HyperFrames/Playwright、FFmpeg；
- 所有 workspace/temp 文件以 attempt ID 命名，在 `finally` 清理；
- `onCancel` 仅作加速清理，不作为唯一清理保证；
- 启动时/定期清除超过 TTL 的孤儿 temp workspace。

---

## 6. Pi Agent 统一边界

### 6.1 公开合同

```ts
export const AI_TASK_KINDS = [
  'project-plan',
  'shot-spec',
  'fabricate',
  'vision-qa',
] as const

export type AiTaskKind = (typeof AI_TASK_KINDS)[number]

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

export interface AiTaskResult<TOutput> {
  output: TOutput
  model: {
    provider: 'stepfun' | 'gemini'
    modelId: string
  }
  usage?: {
    inputTokens: number
    outputTokens: number
  }
  trace: SafeTraceEventV1[]
}

export interface AiTaskRuntime {
  run<TInput, TOutput>(
    request: AiTaskRequest<TInput>,
    contract: AiTaskContract<TInput, TOutput>
  ): Promise<AiTaskResult<TOutput>>
}
```

### 6.2 内部层次

```text
AiTaskRuntime
  → ModelPolicy          选择 provider/model/capability
  → ProviderRegistry     创建 pi-ai Models/provider
  → PiStructuredRunner   唯一 import Agent
  → TerminalTool         验证并提交 output
  → TraceMapper          生成安全事件
```

### 6.3 Terminal Tool

每种模型任务只有一个提交 Tool，例如：

```ts
submit_project_plan
submit_shot_spec
submit_shot_source
submit_vision_report
```

Tool `execute()`：

1. 使用 Zod 校验参数；
2. 进行轻量语义检查；
3. 把已验证对象写入 result details；
4. 返回 `terminate: true`；
5. 不允许模型选择 workspace/project/path。

若模型只返回文本而未调用 Tool，该 turn 是 content failure，不从文本中猜出“可能的
正确 JSON”。Compatibility parser 只服务旧 artifact/import，不是新的模型主通道。

### 6.4 安全轨迹

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

轨迹不保存 raw assistant delta、Tool 参数值、provider 原始错误、prompt、source、密钥
或隐藏 thinking/reasoning。所有字符串、数组、深度、节点数和总字节数都必须在
`TraceMapper` 中截断并脱敏；结构化扩展只能使用 `SafeJsonValue`。前端 JSON viewer
只用 React text node 渲染，默认限制 depth 6、node 500、copy 64 KiB。

### 6.5 非 Agent 媒体模型

TTS/ASR 不扩充 `AiTaskKind`，也不进入 Pi loop。它们使用
`MediaTaskKind = 'tts' | 'asr'`：

```text
shot-media service
  → MediaProviderPolicy    唯一选择 provider/model
  → MediaProviderRegistry  唯一构造具体 SpeechProvider adapter
  → provider receipt
  → entity media probe
```

feature/task/UI 不得直接构造 StepFun client 或读取媒体模型 env。Provider receipt 只
记录 provider/model/request ID/声明值 hash；真实 duration 以实体 probe 为准。

---

## 7. SourceNormalizer

### 7.1 Canonical source

```ts
export interface ShotSourcePackageV1 {
  schemaVersion: 'cvc.shot-source/v1'
  bodyFragment: string
  css: string
  setupJs: string
  timelineJs: string
}
```

`bodyFragment` 不含 `<html>/<head>/<body>`；`css` 不含 `<style>`；JS 字段不含
`<script>`。`bodyFragment` 必须非空；其余字段必须存在，静态镜头可使用空
`timelineJs`。`setupJs` 只能做同步、确定性的初始 DOM 设置；`timelineJs` 只能向
compiler 提供的 paused GSAP timeline 添加 tween，不得创建第二时钟、注册
`__CVC_RENDER__`、调用 play/ticker/timer。模型不得提供外部 URL、codec、frame
count、artifact path 或 shell。

### 7.2 支持的输入形态

按严格顺序匹配：

1. 已是对象 → strict Zod parse；
2. 完整 JSON 字符串；
3. 单一外层 `json` fence；
4. 唯一且标记明确的四段 fragments；
5. 完整 HTML legacy adapter；
6. 其他输入拒绝。

完整 HTML adapter 只提取受控 body/style/script 片段；未知 head 元素、外链脚本、
多个候选 timeline、额外正文或多个 JSON 对象均拒绝。

### 7.3 Partial patch

对既有 source 的局部修改使用：

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

创建新 source 时四字段必须全部存在，且 `bodyFragment` 非空；其余字段允许空字符串，
但不得省略。这样“只生成一部分代码”有明确含义，而不是由前端猜测缺失内容。

---

## 8. video-compiler 与十级门禁

### 8.1 编译输入

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

### 8.2 Bundle

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

`bundleHash` 基于不含自身 hash 的 canonical manifest core 和实体文件 hash 计算；
file 按 path 排序，asset hash 排序，数字/字符串按版本化 canonicalizer 编码。输入枚举
顺序不同不得改变 `bundleHash`。

### 8.3 门禁链

| Gate | 阶段 | 断言 |
|---:|---|---|
| G1 | normalize | 输入形态唯一、无猜测式截取 |
| G2 | schema | strict schema、长度和字段完整 |
| G3 | syntax | HTML/CSS/JS 可解析 |
| G4 | static security | 无网络/import/eval/worker/storage/cookie |
| G5 | determinism | 无墙钟、rAF、ticker、无种子随机、无限循环 |
| G6 | compile | shell/timing/root/id/timeline 合同成立 |
| G7 | HyperFrames lint/check | CLI 静态与运行时检查为 0 finding |
| G8 | seek smoke | 0/中/末/乱序 seek 可用 |
| G9 | pixel determinism | 同帧双拍 hash 相同，样本非空 |
| G10 | media receipt | ffprobe 尺寸/时长/流和实体 SHA-256 正确 |

G1–G5 失败可以把 `issueCodes` 反馈给 fabricate 的新短生命周期 repair invocation；
不得复用已终止的 Agent session。G6–G10 属于 compiler/render 问题，不允许继续让
模型“猜着修基础设施”。

静态 G4 不能证明运行时安全。G6–G9 的执行必须发生在独立 browser context/进程中，
配置 `default-src 'none'` 的受限 CSP、禁网、禁 Node integration、bundle-root 路径
边界、allowlisted asset materialization、时间/内存/进程/输出大小配额，并对
console/error 脱敏。`file://` 和相对路径不得逃逸 attempt workspace。

### 8.4 HyperFrames 单时钟

compiler 输出：

- 固定像素 root；
- app-owned `data-width/data-height/data-duration`；
- `.clip` timing 与 track；
- 同步创建的 paused GSAP timeline；
- `window.__timelines[compositionId]`；
- 本地/自包含资产；
- 不进行 render-time network fetch。

旧 renderer 只实现 `RenderProvider` fallback：

```ts
export interface RenderProvider {
  render(input: RenderTaskV1, signal?: AbortSignal): Promise<RenderReceiptV1>
}
```

当 HyperFrames provider 通过 golden parity 后，legacy provider 在 N7 删除。

---

## 9. ArtifactStore 与 RenderWorkspace

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

ArtifactStore 自行生成 storage key，业务代码只持有 workspace-scoped artifact ID。
删除只向 GC service 暴露，失败且尚未 commit 的上传按 upload token 回收，不能传 raw
key。远端 store 不承诺 `localPath()`；需要本地路径的 CLI/FFmpeg 必须经
`RenderWorkspace.materialize()`，且 `relativePath` 只能落在 attempt root 内。
绝对路径不得持久化、进入日志或返回 UI。业务域不得直接 import
`node:fs/promises` 管理跨域 artifact。

---

## 10. Postgres 最小 schema

### 10.1 表

| 表 | 作用 | 关键约束 |
|---|---|---|
| `workspaces` | 租户边界；当前单一本地 workspace | UUID PK |
| `projects` | 项目聚合 | `(workspace_id,id)` PK、revision、workflow_version |
| `canvas_nodes` | 产品 DAG 节点 | 复合 FK project、node status CHECK |
| `canvas_edges` | DAG 边 | source/target 复合 FK、唯一边 |
| `pipeline_runs` | 一次用户启动的业务运行 | trigger_run_id、status、input fingerprint |
| `task_attempts` | Trigger/worker attempt 与 checkpoint | `(run_id,task_kind,entity_id,attempt_no)` unique；attempt fence |
| `artifacts` | 不可变版本化聚合产物 | aggregate type/id、kind、version、lifecycle、hash、attempt、supersedes |
| `command_receipts` | API 命令幂等 | UUID id；`(workspace_id,idempotency_key)` unique；fingerprint 冲突检测 |
| `model_routes` | 非秘密模型路由配置 | `(workspace_id,ai_task_kind)` unique |
| `media_routes` | 非 Agent 媒体模型路由 | `(workspace_id,media_task_kind)` unique；`tts/asr` |
| `provider_credentials` | 加密 provider credential | ciphertext、key_version、verified_at；禁止明文 fallback |
| `ai_invocations` | Pi invocation/repair 审计 | `invocation_no`、`repair_no`、provider/model/usage；非通用 event log |

### 10.2 通用约定

- SQL 名称 `snake_case`；
- ID 使用 UUID；需要人类语义的节点另设 `logical_key`；
- 时间使用 `timestamptz`；
- 版本化 payload/metadata 使用 `jsonb`；
- 所有 workspace 业务表使用 `(workspace_id,id)` 复合主键；
- 跨 workspace 外键必须包含 `workspace_id`；
- 状态使用 text + named CHECK，避免数据库 enum 难迁移；
- 所有可更新聚合带 `revision`，使用 compare-and-swap；
- approved/released artifact version 不可更新、不可删除；
- artifact lifecycle 仅 `draft/approved/released/rejected`，唯一版本约束为
  `(workspace_id,aggregate_type,aggregate_id,kind,version)`；
- DB trigger 阻止 `approved/released` artifact 被 update/delete；
- `model_routes`/`media_routes` 不存 secret；credential 使用应用层 authenticated encryption，
  master key 仅来自 server-only env/secret manager；
- `content_hash` 是实体内容 SHA-256，不得用 input key 冒充。

### 10.3 不建 `run_events`

UI 所需业务进度来自 `pipeline_runs + task_attempts + canvas_nodes + artifacts`。
Trigger 状态和日志由 Trigger Realtime/Dashboard 提供。只有模型调用审计进入字段
明确的 `ai_invocations`，不把所有状态塞进任意 JSON event 表。

状态所有权固定为：

- `task_attempts` 的 checkpoint/terminal 是步骤级业务真源；
- `pipeline_runs.status` 是持久化聚合状态；
- `canvas_nodes.status` 是可重建产品投影，只能与 attempt/artifact commit 在同一事务
  更新，不接受独立“改节点状态”命令；
- Trigger status 只负责 transport/live view；Realtime 不能直接写业务 terminal。

---

## 11. 状态与 UI 投影

### 11.1 业务状态

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
```

`blocked/ready` 不持久化为执行状态，由唯一 `ExecutionPolicy` 根据依赖、artifact 和
当前状态派生。

### 11.2 Snapshot

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

页面首次加载读取 Snapshot；随后用 Trigger Realtime 更新运行态，完成/断线后重新
拉取 Snapshot 对账。Realtime metadata 不是业务真源。

### 11.3 Inspector 四页签

1. **数据**：版本化 JSON 的 tree/table/raw；
2. **源码**：原始输入、提取 fragments、hash 和兼容警告；
3. **门禁**：G1–G10 结果、问题定位、产物链接；
4. **执行**：安全 Agent trace、Trigger 状态、attempt、重试和费用摘要。

所有组件先在 `canvas.pen` 建 reusable symbol，再登记 `/playbook`。

---

## 12. PurpleInk 合同桥

```text
PurpleInk SkillInputV1
  → PurpleInkInputAdapter
  → StructuredModelPort
  → PurpleInk Plan DTO
  → PurpleInk compiler
  → PurpleInkCompositionBundleV1
  → RenderableBundleDescriptorV1

CVC Project/Shot Input
  → Pi AiTaskRuntime
  → ShotSourcePackageV1
  → CVC video-compiler
  → CvcCompositionBundleV1
  → RenderableBundleDescriptorV1
```

共享点是 `RenderableBundleDescriptorV1`、render task/receipt/provenance，不要求
两个 compiler 使用相同输入或相同本地 bundle schema。未来只有当双方各自提交过
真实生产 release fixture 后，才迁出公共包。

---

## 13. 文件治理

- `page.tsx` 目标 ≤200 行，硬上限 300；
- 业务组件/服务目标 ≤250 行，硬上限 350；
- repository/schema 可按聚合拆分，单文件硬上限 400；
- 单函数 ≤50 行；
- 每个文件一个主职责；
- `index.ts` 只导出公开 API，不承载逻辑；
- 禁止跨域 deep import；
- 新增例外必须写在 Track Issue 并带拆分后续，不允许默许增长。

N6 至少拆分当前 `runtime-repository.ts`、`shot-detail.tsx`、
`model-service-settings.tsx`、`render/repository.ts`、`export-workspace.tsx`、
`vision-qa.ts`、`advance.ts`、`stage-runner.ts`、`canvas-inspector.tsx`。

---

## 14. 架构完成条件

目标架构只有在以下事实同时成立时才算完成：

1. 运行时无 SQLite 与进程内 queue/stream；
2. 主链路无直接 OpenAI client 和 Agents SDK；
3. 四类模型任务全部经 Pi `AiTaskRuntime`；
4. 七类 Trigger task 是唯一调度入口；
5. source 先 normalize/gate，再 compile/render；
6. HyperFrames 是唯一默认帧时钟；
7. 最终 MP4 通过视频、音频、字幕与实体 hash 验收；
8. UI 无不可追溯字段；
9. 旧数据可备份/导入并完成计数对账；
10. N7 golden E2E 与 30 项矩阵全部有证据。
