# Track N3 Pi Agent 结构化运行时 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用一个 Pi 支持的结构化运行时替换长生命周期 Director session 与生产路径上的所有模型直连，并证明系统只有四种 AI task kind、`shot-generate` 会执行两次相互隔离的 Pi invocation，且持久化/流式 trace 不含模型敏感原始内容。

**Architecture:** 共享合同定义四种 task kind 与类型化 request/result port。`ModelPolicy` 是唯一模型路由器，`ProviderRegistry` 是唯一 pi-ai model factory，`PiStructuredRunner` 是唯一允许 import Pi `Agent` 的生产模块。Trigger task 只调用 application service；`shot-generate` 用一个短生命周期 Agent 提交 `ShotSpecV1` checkpoint 后，再为 fabricate 创建全新的 Agent。terminal Tool 参数是唯一可接受结果，有界 `TraceMapper` 只输出安全 trace union。

**Tech Stack:** TypeScript strict mode、Zod 4、`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`、Track N2 的 Trigger.dev task service、Track N1 的 Postgres repository、Vitest、Next.js 16。

---

## Track 合同与执行顺序

- 按 N3.1 → N3.2 → N3.3 → N3.4 → N3.5 → N3.6 顺序实施。
- 前置依赖：Track N0 已冻结共享 v3 合同，Track N1 已提供 Postgres credential/model-route/invocation repository，Track N2 已将 `trigger/tasks/project-plan.ts`、`trigger/tasks/shot-generate.ts` 与 `trigger/tasks/shot-qa.ts` 收口为纯编排入口。
- 本 Track 负责 `CONTRACT-AI-001..007`、A12–A16 与 A10 的 AI 部分。
- `AiTaskKind` 不是 Canvas node type、Trigger task ID、provider ID 或开放字符串；完整集合只能是 `project-plan | shot-spec | fabricate | vision-qa`。
- 不得增加 `@openai/agents`。本 Track 不删除普通 `openai` package；只有独立的全仓依赖审计证明所有非 N3 feature 均不再消费它后，才能在其他任务处理。
- provider handshake 成功不是 Track 退出条件。退出必须包含结构化 terminal Tool 成功、持久化的实际 provider/model 证据、安全 trace 扫描和一次受控 StepFun 成功；仅当 Gemini credential 已配置时执行一次 Gemini 成功调用。

<a id="task-n31"></a>

### Task N3.1: 建立 `AiTaskKind`、类型化运行时合同、`ModelPolicy` 与 `ProviderRegistry`

**Dependencies:** N0 contract package scaffold；N1 `model_routes`、`provider_credentials` 与 workspace settings repository。

**Spec coverage:** `CONTRACT-AI-001..004`, `DATA-002`, `DATA-003`, A12, A16.

**Files**

- Create: `src/features/ai/domain/task-kind.ts`
- Create: `src/features/ai/domain/model-policy.ts`
- Create: `src/features/ai/domain/model-policy.test.ts`
- Create: `src/features/ai/application/ai-task-runtime.ts`
- Create: `src/features/ai/infrastructure/provider-credential-store.ts`
- Create: `src/features/ai/infrastructure/provider-registry.ts`
- Create: `src/features/ai/infrastructure/provider-registry.test.ts`
- Modify: `packages/contracts/src/ai.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `src/features/ai/index.ts`
- Delete: none
- Prohibited: `src/features/canvas/**`, `trigger/tasks/**`, `src/features/render/**`, `src/app/**`, `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1 — 先写失败的合同与路由测试。**

  在 `model-policy.test.ts` 中断言：

  - `AI_TASK_KINDS` 与四值 tuple 深度相等且不存在第五项；
  - 每种 task 都从同一个 `WorkspaceModelSettings` snapshot 解析；
  - workspace override 优先于默认值；
  - 不支持的 provider/model 行以稳定 domain error 失败；
  - 返回值含 provider、model ID 与 policy revision，但不含 credential；
  - `src/features/ai/domain/**` 不 import `CanvasNodeType`。

  在 `provider-registry.test.ts` 中使用 fake `ProviderCredentialStore` 与 fake pi-ai factory，证明 StepFun 使用受支持的 OpenAI-compatible pi-ai adapter、Gemini 使用原生 Google adapter、credential 只在服务端解析，且 feature 传入的 base URL/API key 无法进入 registry。

- [ ] **Step 2 — 运行 RED 并确认失败原因正确。**

  ```powershell
  pnpm test -- src/features/ai/domain/model-policy.test.ts src/features/ai/infrastructure/provider-registry.test.ts
  ```

  预期：退出码 1，原因是 domain 文件与四种 task kind 的导出合同尚不存在；解析器或测试配置错误不算正确 RED。

- [ ] **Step 3 — 定义精确的共享 AI port。**

  `packages/contracts/src/ai.ts` 必须导出以下形状，schema 使用 `z.ZodType<T>` 并复用已有共享 `ContractIssueV1`：

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

  `src/features/ai/domain/task-kind.ts` 只 re-export 该 tuple/type，不再声明第二份 enum。`src/features/ai/application/ai-task-runtime.ts` 只包含 application port wiring，不 import Pi、Trigger、Canvas 或 provider SDK。

- [ ] **Step 4 — 实现唯一的模型选择与 provider 构造边界。**

  `ModelPolicy.resolve(task, workspaceSettings)` 必须返回：

  ```ts
  interface ResolvedModelTarget {
    task: AiTaskKind
    provider: 'stepfun' | 'gemini'
    modelId: string
    policyRevision: bigint
  }
  ```

  默认值与 workspace override 只在该方法中求值。`ProviderRegistry.create(target, workspaceId)` 通过 `ProviderCredentialStore` 获取 credential、构造 pi-ai model，并返回 model 与仅 runner 可用的 key resolver；public result、错误、日志或测试均不得暴露 credential 文本。

- [ ] **Step 5 — 运行 GREEN 与边界扫描。**

  ```powershell
  pnpm test -- src/features/ai/domain/model-policy.test.ts src/features/ai/infrastructure/provider-registry.test.ts
  pnpm typecheck
  rg -n "CanvasNodeType|resolveDirectorModelTarget|process\.env" src/features/ai/domain src/features/ai/application/ai-task-runtime.ts
  rg -n "createProvider|createModels|openAICompletionsApi|googleGenerativeAIApi" src --glob "*.ts" --glob "!src/features/ai/infrastructure/provider-registry.ts" --glob "!*.test.ts"
  git diff --check
  if (rg -n ([char]0xFFFD) packages/contracts/src/ai.ts src/features/ai) { throw "U+FFFD detected" }
  ```

  预期：测试与 typecheck 退出 0；两组禁止 import 扫描无命中；U+FFFD 扫描无命中。

- [ ] **Step 6 — Task 退出门。**

  用 exhaustive test 确认 A12/A16：若增加第五种 task kind 却未同步默认值、policy mapping 与 terminal Tool mapping，编译必须失败；同时确认 model route 不含 credential 字段。

- [ ] **Step 7 — 仅提交 N3.1 文件。**

  ```powershell
  git add -- packages/contracts/src/ai.ts packages/contracts/src/index.ts src/features/ai/domain/task-kind.ts src/features/ai/domain/model-policy.ts src/features/ai/domain/model-policy.test.ts src/features/ai/application/ai-task-runtime.ts src/features/ai/infrastructure/provider-credential-store.ts src/features/ai/infrastructure/provider-registry.ts src/features/ai/infrastructure/provider-registry.test.ts src/features/ai/index.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "feat(ai): define structured runtime boundaries" -m "Task: N3.1" -m "Spec: CONTRACT-AI-001..004, DATA-002..003, A12, A16" -m "Evidence: pnpm test -- src/features/ai/domain/model-policy.test.ts src/features/ai/infrastructure/provider-registry.test.ts"
  ```

<a id="task-n32"></a>

### Task N3.2: 实现 `PiStructuredRunner`、单一 terminal Tool、有界安全 trace 与取消

**Dependencies:** N3.1。

**Spec coverage:** `CONTRACT-AI-002`, `CONTRACT-AI-005..007`, A13–A15.

**Files**

- Create: `src/features/ai/domain/trace-event.ts`
- Create: `src/features/ai/domain/trace-event.test.ts`
- Create: `src/features/ai/infrastructure/terminal-tools.ts`
- Create: `src/features/ai/infrastructure/terminal-tools.test.ts`
- Create: `src/features/ai/infrastructure/pi-structured-runner.ts`
- Create: `src/features/ai/infrastructure/pi-structured-runner.test.ts`
- Create: `src/features/ai/application/run-structured.ts`
- Modify: `packages/contracts/src/ai.ts`
- Modify: `src/features/ai/index.ts`
- Delete: none
- Prohibited: `src/features/director/pi-session.ts`, `src/features/director/session-store.ts`, `trigger/tasks/**`, `src/features/render/**`, `src/app/**`, `package.json`

- [ ] **Step 1 — 在 import Pi `Agent` 前先写 transcript 驱动的失败测试。**

  用 fake Agent factory 覆盖以下 transcript：

  1. 恰好一次匹配 terminal Tool 调用返回 schema-valid 参数；
  2. 只有 assistant text 而无 Tool 时以 `AI_TERMINAL_TOOL_MISSING` 失败；
  3. 两次 terminal Tool 调用以 `AI_TERMINAL_TOOL_MULTIPLE` 失败；
  4. 同一 batch 混入 terminal Tool 与其他 Tool 时以 `AI_TOOL_BATCH_MIXED` 失败；
  5. Tool 参数无效时内容修复最多两次，`vision-qa` 最多一次；
  6. transport/429/timeout 错误直接向上抛出，不做 content repair；
  7. 已取消与执行中取消的 `AbortSignal` 都会中止 Agent，且绝不发出 `completed`；
  8. 两次 `run()` 构造两个不同 Agent，二者 messages 为空且各自只有一个 Tool；
  9. assistant delta、Tool 参数值、provider 原始错误文本、prompt、source、credential、hidden reasoning 与任意 provider object 均不进入返回 trace。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- src/features/ai/domain/trace-event.test.ts src/features/ai/infrastructure/terminal-tools.test.ts src/features/ai/infrastructure/pi-structured-runner.test.ts
  ```

  预期：退出码 1，原因是 runner、terminal Tool 与安全 trace mapper 尚不存在。

- [ ] **Step 3 — 实现安全 trace union 与硬性上限。**

  只导出以下指定事件：

  ```ts
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

  `TraceMapper` 必须把字符串限制为 2,048 个 UTF-16 code unit、数组 50 项、深度 6、总节点 500、序列化 trace 64 KiB。`tool_started` 只存排序后的参数名；`failed` 把 provider failure 映射为稳定 code 与用户安全消息，绝不复制 provider message 或 stack。以后若增加结构化扩展值，必须先收窄为 `SafeJsonValue`。

- [ ] **Step 4 — 实现 terminal Tool 与 runner 不变量。**

  `terminal-tools.ts` 根据 `AiTaskContract.terminalToolName` 只构建一个 Tool。execute 使用 `outputSchema` 解析并运行 `semanticValidate`，把验证后的 output 存入 result details；只有两层验证都通过时才返回 `{ terminate: true }`。

  `pi-structured-runner.ts` 是唯一允许 import `Agent` 的生产文件。每次 `run()`：

  - 在创建 model 前解析 input；
  - 先解析 `ModelPolicy`，再调用 `ProviderRegistry`；
  - 构造全新 Agent，使用 `messages: []`、一个 terminal Tool，且没有 session recovery history；
  - 只接受验证后的 terminal Tool result details 作为 output；
  - 忽略 assistant prose，不把它作为结果通道；
  - repair 上限只在当前 invocation 内生效；
  - 透传 `AbortSignal`；
  - 返回已解析 provider/model 与有界 trace。

  不持久化 Pi JSONL；业务恢复使用 v3 checkpoint/artifact。

- [ ] **Step 5 — 运行 GREEN 并证明新运行时的唯一 Agent import 不变量。**

  ```powershell
  pnpm test -- src/features/ai/domain/trace-event.test.ts src/features/ai/infrastructure/terminal-tools.test.ts src/features/ai/infrastructure/pi-structured-runner.test.ts
  pnpm typecheck
  rg -n "from '@earendil-works/pi-agent-core'.*Agent|\\bAgent\\b" src/features/ai --glob "*.ts" --glob "!*.test.ts"
  rg -n "rawDelta|assistantDelta|arguments:|providerError|reasoning|thinking|prompt|credential" src/features/ai/domain/trace-event.ts src/features/ai/infrastructure/pi-structured-runner.ts
  git diff --check
  if (rg -n ([char]0xFFFD) packages/contracts/src/ai.ts src/features/ai) { throw "U+FFFD detected" }
  ```

  预期：focused test 与 typecheck 全部通过；Agent 扫描只命中 `src/features/ai/infrastructure/pi-structured-runner.ts`；敏感字段扫描不存在存储/序列化分支。

- [ ] **Step 6 — Task 退出门。**

  在测试文件中保存 fake transcript 矩阵；矩阵必须证明 Tool 参数是唯一产物，且每种失败模式都有与 transport exception 区分的稳定 content error code。

- [ ] **Step 7 — 仅提交 N3.2 文件。**

  ```powershell
  git add -- packages/contracts/src/ai.ts src/features/ai/domain/trace-event.ts src/features/ai/domain/trace-event.test.ts src/features/ai/infrastructure/terminal-tools.ts src/features/ai/infrastructure/terminal-tools.test.ts src/features/ai/infrastructure/pi-structured-runner.ts src/features/ai/infrastructure/pi-structured-runner.test.ts src/features/ai/application/run-structured.ts src/features/ai/index.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "feat(ai): add Pi structured runner" -m "Task: N3.2" -m "Spec: CONTRACT-AI-002, CONTRACT-AI-005..007, A13..A15" -m "Evidence: pnpm test -- src/features/ai/domain/trace-event.test.ts src/features/ai/infrastructure/terminal-tools.test.ts src/features/ai/infrastructure/pi-structured-runner.test.ts"
  ```

<a id="task-n33"></a>

### Task N3.3: 迁移项目规划与双 invocation 的 `shot-generate` checkpoint 流程

**Dependencies:** N3.2；N2 task graph 与 attempt fencing；N1 artifact/invocation repository。

**Spec coverage:** `CONTRACT-AI-005`, `DATA-004`, `DATA-005`, `EXEC-DAG-003`, A10, A14.

**Files**

- Create: `src/features/ai/domain/contracts/project-plan-contract.ts`
- Create: `src/features/ai/domain/contracts/shot-spec-contract.ts`
- Create: `src/features/ai/domain/contracts/fabricate-contract.ts`
- Create: `src/features/ai/domain/contracts/contracts.test.ts`
- Create: `src/features/ai/application/project-plan-service.ts`
- Create: `src/features/ai/application/project-plan-service.test.ts`
- Create: `src/features/ai/application/shot-generate-service.ts`
- Create: `src/features/ai/application/shot-generate-service.test.ts`
- Modify: `trigger/tasks/project-plan.ts`
- Modify: `trigger/tasks/shot-generate.ts`
- Modify: `src/features/pipeline/repository.ts`
- Modify: `src/features/ai/index.ts`
- Modify: `src/features/director/index.ts`
- Delete: `src/features/director/pi-session.ts`
- Delete: `src/features/director/pi-session.test.ts`
- Delete: `src/features/director/session-store.ts`
- Delete: `src/features/director/session-store.test.ts`
- Prohibited: `src/features/render/**`, `src/features/audio/**`, `src/app/**`, `src/lib/db/schema/**`, `migrations/**`

- [ ] **Step 1 — 核对删除前提并编写 RED service 测试。**

  改文件前先运行：

  ```powershell
  rg -n "createDirectorSession|DirectorSessionStore|from './pi-session'|from './session-store'" src trigger
  ```

  删除前预期：引用只存在于上列四个 Director 文件或已由 N2 退役的代码。若仍有 live Trigger task import 它们，停止 N3.3 并先完成 N2 cutover。

  新测试必须断言：

  - `project-plan` 以 `submit_project_plan` 调用一次 runtime，并事务性提交 plan + Shot fan-out；
  - `shot-generate` 先以 task `shot-spec` 调用 runtime，提交 `ShotSpecV1` 与 input fingerprint，再以 task `fabricate` 调用 runtime；
  - 两次调用使用独立 runtime invocation，fake runner 报告不同 Agent/session identity；
  - fabricate 接收已提交 `ShotSpecV1`，不接收 assistant text 或 spec trace；
  - fabricate 失败仍保留有效 spec checkpoint；
  - 相同 input fingerprint retry 时复用 spec checkpoint，新增 `shot-spec` 调用为 0，但创建新的 fabricate 调用；
  - input hash 改变会使 spec checkpoint 失效；
  - stale attempt fencing 拒绝任一 checkpoint，且不改变当前 node/artifact。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- src/features/ai/domain/contracts/contracts.test.ts src/features/ai/application/project-plan-service.test.ts src/features/ai/application/shot-generate-service.test.ts
  ```

  预期：退出码 1，原因是三个合同与两个 application service 尚不存在。

- [ ] **Step 3 — 实现三个严格 terminal 合同。**

  每个合同使用 strict Zod input/output schema、固定 terminal Tool name、类型化 prompt builder 与 semantic issue code。`fabricate` output 是 `ShotSourcePackageV1`，不接受完整 HTML 作为 canonical output。render dimensions、fps、duration、seed、workflow version 与 artifact ownership 都是 application input，不得采信 model output。

- [ ] **Step 4 — 实现顺序执行的双 invocation service。**

  `shot-generate-service.ts` 的核心流程必须遵循以下顺序：

  ```ts
  const checkpoint = await repository.findReusableShotSpec(
    scope,
    shotSpecInputFingerprint
  )

  const shotSpec = checkpoint?.output ?? (
    await runtime.run(shotSpecRequest, shotSpecContract)
  ).output

  if (!checkpoint) {
    await repository.commitShotSpecCheckpoint({
      scope,
      inputFingerprint: shotSpecInputFingerprint,
      output: shotSpec,
    })
  }

  const sourceResult = await runtime.run(
    buildFabricateRequest(scope, shotSpec),
    fabricateContract
  )

  await repository.commitShotSourceCheckpoint({
    scope,
    source: sourceResult.output,
  })
  ```

  可信 run/attempt/shot context 会分别复制到两次 runtime 调用中。每次 `PiStructuredRunner.run()` 都构造新 Agent；messages、Tool instance、safe trace array、repair counter 或 Pi session 文件都不能跨越 invocation 边界。`ai_invocations.invocation_no` 中 spec 记为 1，fabricate 记为 2。

- [ ] **Step 5 — 将 Trigger task 收口为纯编排并删除长生命周期 Director session。**

  `trigger/tasks/project-plan.ts` 与 `trigger/tasks/shot-generate.ts` 调用 public application service 并传入 `ctx.signal`；它们不 import Pi、provider factory、Drizzle、prompt module 或 Canvas node enum。只有前置扫描干净后才能删除四个旧 session 文件。

- [ ] **Step 6 — 运行 GREEN、retry/fencing 测试与 import 扫描。**

  ```powershell
  pnpm test -- src/features/ai/domain/contracts/contracts.test.ts src/features/ai/application/project-plan-service.test.ts src/features/ai/application/shot-generate-service.test.ts
  pnpm typecheck
  rg -n "createDirectorSession|DirectorSessionStore|pi-session|session-store" src trigger
  rg -n "@earendil-works/pi-agent-core|@earendil-works/pi-ai" trigger/tasks src/features/ai/application
  rg -n "CanvasNodeType" src/features/ai
  git diff --check
  if (rg -n ([char]0xFFFD) src/features/ai trigger/tasks/project-plan.ts trigger/tasks/shot-generate.ts) { throw "U+FFFD detected" }
  ```

  预期：测试/typecheck 退出 0；三组扫描均无禁止引用；retry 测试证明没有重复付费 spec 调用。

- [ ] **Step 7 — Task 退出门。**

  检查持久化测试 fixture：强制 fabricate 失败后必须存在有效 `ShotSpecV1` checkpoint，且不存在 source checkpoint。相同 fingerprint retry 必须新增 fabricate invocation row，但不得新增 spec invocation row。

- [ ] **Step 8 — 仅提交 N3.3 文件。**

  ```powershell
  git add -- src/features/ai/domain/contracts/project-plan-contract.ts src/features/ai/domain/contracts/shot-spec-contract.ts src/features/ai/domain/contracts/fabricate-contract.ts src/features/ai/domain/contracts/contracts.test.ts src/features/ai/application/project-plan-service.ts src/features/ai/application/project-plan-service.test.ts src/features/ai/application/shot-generate-service.ts src/features/ai/application/shot-generate-service.test.ts trigger/tasks/project-plan.ts trigger/tasks/shot-generate.ts src/features/pipeline/repository.ts src/features/ai/index.ts src/features/director/index.ts src/features/director/pi-session.ts src/features/director/pi-session.test.ts src/features/director/session-store.ts src/features/director/session-store.test.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "refactor(ai): migrate planning and shot generation" -m "Task: N3.3" -m "Spec: CONTRACT-AI-005, DATA-004..005, EXEC-DAG-003, A10, A14" -m "Evidence: pnpm test -- src/features/ai/domain/contracts/contracts.test.ts src/features/ai/application/project-plan-service.test.ts src/features/ai/application/shot-generate-service.test.ts"
  ```

<a id="task-n34"></a>

### Task N3.4: 将 vision QA 迁移到结构化运行时

**Dependencies:** N3.3；N2 `shot-qa` task；测试使用 artifact-ID thumbnail fixture，因此不依赖 N4。

**Spec coverage:** `CONTRACT-AI-001..006`, `PROD-QA-001..002`, A12–A15.

**Files**

- Create: `src/features/ai/domain/contracts/vision-qa-contract.ts`
- Create: `src/features/ai/domain/contracts/vision-qa-contract.test.ts`
- Create: `src/features/ai/application/vision-qa-service.ts`
- Create: `src/features/ai/application/vision-qa-service.test.ts`
- Modify: `src/features/render/vision-qa.ts`
- Modify: `src/features/render/vision-qa.test.ts`
- Modify: `trigger/tasks/shot-qa.ts`
- Modify: `src/features/ai/index.ts`
- Delete: none
- Prohibited: `src/features/render/qa-check.ts`, `src/features/render/hyperframes-provider.ts`, `src/features/audio/**`, `src/app/**`, `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1 — 为结构化 vision 输出与 rule-QA 优先级编写 RED 测试。**

  合同测试必须拒绝缺失/额外字段、重复 requirement ID，以及未引用输入 thumbnail label 的 evidence。service 测试必须证明：

  - task kind 是 `vision-qa`，terminal Tool 是 `submit_vision_report`；
  - runner 获取 artifact bytes 与可信 requirement ID，绝不获取服务器路径；
  - 持久化 invocation 的 provider/model 等于 runtime result；
  - content repair 上限为一次；
  - 即便 vision model 判定通过，失败的确定性规则仍保持失败；
  - cancellation 不写 vision report artifact。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- src/features/ai/domain/contracts/vision-qa-contract.test.ts src/features/ai/application/vision-qa-service.test.ts src/features/render/vision-qa.test.ts
  ```

  预期：退出码 1，原因是 vision 合同/service 尚不存在，且现有 render 模块仍在构造直连 client。

- [ ] **Step 3 — 实现并接入结构化 vision 合同。**

  保留已有用户可见 report 字段，但只能从验证后的 terminal Tool 参数获得。`src/features/render/vision-qa.ts` 变为注入 `AiTaskRuntime` 的确定性 thumbnail/context adapter；其中不得存在 provider URL、API key、`OpenAI` client、JSON-from-text parser 或 model routing 决策。

- [ ] **Step 4 — 让 `shot-qa` 调用 application service。**

  Trigger task 传入 workspace/project/run/attempt/shot ID 与 `ctx.signal`，再在 attempt fencing 下提交 report。Rule QA 与 vision QA 保持为不同 receipt 字段；vision output 可以增加 finding，但不能把确定性 gate failure 改成 success。

- [ ] **Step 5 — 运行 GREEN 与直连 client 扫描。**

  ```powershell
  pnpm test -- src/features/ai/domain/contracts/vision-qa-contract.test.ts src/features/ai/application/vision-qa-service.test.ts src/features/render/vision-qa.test.ts
  pnpm typecheck
  rg -n "openai|new OpenAI|chat\.completions|responses\.create" src/features/render/vision-qa.ts trigger/tasks/shot-qa.ts
  rg -n "resolveDirectorModelTarget|process\.env" src/features/render/vision-qa.ts trigger/tasks/shot-qa.ts
  git diff --check
  if (rg -n ([char]0xFFFD) src/features/ai src/features/render/vision-qa.ts trigger/tasks/shot-qa.ts) { throw "U+FFFD detected" }
  ```

  预期：测试/typecheck 退出 0，所有扫描均无命中。

- [ ] **Step 6 — Task 退出门。**

  强制 fake model 把所有 requirement 标为通过，同时让 deterministic QA 含一项失败；断言组合 report 仍失败且保留两种 evidence source。

- [ ] **Step 7 — 仅提交 N3.4 文件。**

  ```powershell
  git add -- src/features/ai/domain/contracts/vision-qa-contract.ts src/features/ai/domain/contracts/vision-qa-contract.test.ts src/features/ai/application/vision-qa-service.ts src/features/ai/application/vision-qa-service.test.ts src/features/render/vision-qa.ts src/features/render/vision-qa.test.ts trigger/tasks/shot-qa.ts src/features/ai/index.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "refactor(ai): route vision QA through Pi" -m "Task: N3.4" -m "Spec: CONTRACT-AI-001..006, PROD-QA-001..002, A12..A15" -m "Evidence: pnpm test -- src/features/ai/domain/contracts/vision-qa-contract.test.ts src/features/ai/application/vision-qa-service.test.ts src/features/render/vision-qa.test.ts"
  ```

<a id="task-n35"></a>

### Task N3.5: 让设置页只编辑 `ModelPolicy` 并证明实际 invocation route

**Dependencies:** N3.4；N1 encrypted provider credential store 与 model-route repository。

**Spec coverage:** `CONTRACT-AI-003..004`, `DATA-002..004`, `PROD-AI-001..006`, A12, A15.

**Files**

- Create: `src/features/ai/application/model-settings-service.ts`
- Create: `src/features/ai/application/model-settings-service.test.ts`
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/app/api/settings/route.test.ts`
- Modify: `src/app/(app)/settings/model-service-settings.tsx`
- Modify: `src/app/(app)/settings/settings-form.tsx`
- Modify: `src/features/ai/config.ts`
- Modify: `src/features/ai/config.test.ts`
- Modify: `src/features/ai/index.ts`
- Delete: `src/features/ai/model-routing.ts`
- Delete: `src/features/ai/model-routing.test.ts`
- Delete: `src/features/ai/stepfun-adapter.ts`
- Delete: `src/features/ai/stepfun-adapter.test.ts`
- Delete: `src/features/ai/gemini-adapter.ts`
- Delete: `src/features/ai/gemini-adapter.test.ts`
- Delete: `src/features/ai/gemini-config.ts`
- Delete: `src/features/ai/gemini-config.test.ts`
- Prohibited: `package.json`, `pnpm-lock.yaml`, `src/lib/db/schema/**`, `migrations/**`, `src/features/audio/**`, `src/features/render/**`, `src/components/**`, `src/app/playbook/**`, `docs/designs/canvas.pen`, `src/app/(app)/layout.tsx`, `src/features/navigation/**`

- [ ] **Step 1 — 编写 RED 设置页/service 测试。**

  断言 GET 返回四条以 `AiTaskKind` 为键的 route row，每条只含 configured/effective provider、model ID、revision 与 credential status。POST 必须：

  - 通过 `ModelPolicy` 验证 provider/model 兼容性；
  - 在加密保存前验证新提供的 credential；
  - 验证失败时保持旧 credential 与 route 不变；
  - 使用 optimistic concurrency 更新 route revision；
  - 绝不返回 credential/ciphertext；
  - 返回与后续 fake invocation 记录完全相同的 effective provider/model。

  component 测试必须断言 route 控件遍历 `AI_TASK_KINDS`，而不是 Canvas node type。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- src/features/ai/application/model-settings-service.test.ts src/app/api/settings/route.test.ts
  ```

  预期：退出码 1，原因是设置 route 仍暴露旧的按节点路由/配置。

- [ ] **Step 3 — 实现 application service 与真实设置 DTO。**

  credential 与 route 分开写入。页面可编辑 StepFun/Gemini credential 与四条 `ModelPolicy` row。仅媒体使用的 TTS/ASR 设置可以保留在明确分离的 media configuration 区，但不得选择四种 AI task model。

  `config.ts` 变为 media configuration 的 compatibility reader，并把 credential status 委托给 `ProviderCredentialStore`；它不得选择 text/vision model 或暴露明文 key。所有 import 迁移完成后删除旧 node router 与 direct chat adapter。

  设置页改动只能在现有视觉结构中接入真实 DTO、controlled value 与 handler；不得新增视觉原语、改布局/动效、登记 Playbook 组件，或进行任何未先更新 `docs/designs/canvas.pen` 的 UI 变更。完整视觉拆分与重构属于 Track N6。

- [ ] **Step 4 — 增加 invocation route 一致性证据。**

  在 service 测试中保存 `shot-spec → gemini/model-X` route，运行一次 fake structured invocation，再查询 invocation projection；断言 settings effective route、`AiTaskResult.model` 与 `ai_invocations.provider/model` 完全相等。

- [ ] **Step 5 — 运行 GREEN 与全仓路由/client 扫描。**

  ```powershell
  pnpm test -- src/features/ai/application/model-settings-service.test.ts src/app/api/settings/route.test.ts
  pnpm typecheck
  rg -n "DIRECTOR_NODE_TYPES|resolveDirectorModelTarget|getDirectorProvider|saveDirectorProvider" src trigger
  rg -n "openai|new OpenAI" src trigger
  rg -n "process\.env.*(STEPFUN|GEMINI)" src/features src/app trigger
  rg -n "apiKey|ciphertext|authorization" src/app/api/settings/route.ts 'src/app/(app)/settings'
  git diff --check
  if (rg -n ([char]0xFFFD) src/features/ai src/app/api/settings 'src/app/(app)/settings') { throw "U+FFFD detected" }
  ```

  预期：测试/typecheck 退出 0；旧路由、直连 client 与 feature 层模型环境变量扫描无命中；UI/API 源码不存在可泄露凭据内容的响应字段。

- [ ] **Step 6 — 有意保留普通 `openai` 依赖。**

  确认本 Task 未改动 `package.json` 与 `pnpm-lock.yaml`。记录 direct-import 扫描作为证据，但不要在这里删除 package。

- [ ] **Step 7 — Task 退出门。**

  保存一份测试 DTO，显示四条精确 task row 与 masked credential status；随后确认对应 invocation projection 含相同 provider/model，且不含携带 secret 的字段。

- [ ] **Step 8 — 仅提交 N3.5 文件。**

  ```powershell
  git add -- src/features/ai/application/model-settings-service.ts src/features/ai/application/model-settings-service.test.ts src/app/api/settings/route.ts src/app/api/settings/route.test.ts 'src/app/(app)/settings/model-service-settings.tsx' 'src/app/(app)/settings/settings-form.tsx' src/features/ai/config.ts src/features/ai/config.test.ts src/features/ai/index.ts src/features/ai/model-routing.ts src/features/ai/model-routing.test.ts src/features/ai/stepfun-adapter.ts src/features/ai/stepfun-adapter.test.ts src/features/ai/gemini-adapter.ts src/features/ai/gemini-adapter.test.ts src/features/ai/gemini-config.ts src/features/ai/gemini-config.test.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "refactor(settings): route models by AI task" -m "Task: N3.5" -m "Spec: CONTRACT-AI-003..004, DATA-002..004, PROD-AI-001..006, A12, A15" -m "Evidence: pnpm test -- src/features/ai/application/model-settings-service.test.ts src/app/api/settings/route.test.ts"
  ```

<a id="task-n36"></a>

### Task N3.6: 将 Pi 归类为生产依赖并用受控运行时证据关闭 Track

**Dependencies:** N3.5。

**Spec coverage:** `CONTRACT-AI-004..007`, `HAR-AI-001..003`, A12–A16.

**Files**

- Create: `scripts/verification/verify-pi-runtime.mts`
- Create: `scripts/verification/verify-ai-provider-smoke.mts`
- Create: `src/features/ai/infrastructure/startup-boundary.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `next.config.ts`
- Delete: none
- Prohibited: `.env`, `.env.local`, `.env.*.local`, `src/features/audio/**`, `src/features/render/**`, `src/lib/db/schema/**`, `migrations/**`

- [ ] **Step 1 — 编写 RED 生产边界测试。**

  `startup-boundary.test.ts` 必须解析 `package.json` 并断言：

  - `@earendil-works/pi-agent-core` 与 `@earendil-works/pi-ai` 位于 `dependencies`，不在 `devDependencies`；
  - 不存在 `@openai/agents`；
  - N3 未删除普通 `openai` entry；
  - 只有 `pi-structured-runner.ts` import Pi `Agent`；
  - 若 N1 spike 证明 production server external 必需，则两个 Pi package 各出现且只出现一次。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- src/features/ai/infrastructure/startup-boundary.test.ts
  ```

  预期：退出码 1，原因是两个 Pi package 当前都被归类为仅开发依赖。

- [ ] **Step 3 — 移动已有固定版本 Pi package，且不引入新的 agent framework。**

  使用 pnpm 生成 lockfile，绝不手改：

  ```powershell
  pnpm remove -D @earendil-works/pi-agent-core @earendil-works/pi-ai
  pnpm add --save-exact @earendil-works/pi-agent-core@0.81.1 @earendil-works/pi-ai@0.81.1
  ```

  保持普通 `openai` 依赖不变。只增加 `verify-pi-runtime.mts` 证明必要的 `next.config.ts` externalization；不得改变 Turbopack/webpack 配置。

- [ ] **Step 4 — 实现确定性与真实 smoke 脚本。**

  `verify-pi-runtime.mts` 在 `NODE_ENV=production` 下 import production runner，执行 fake terminal-Tool transcript，只打印 provider ID、model ID、terminal Tool name、safe event type 与 pass/fail。

  `verify-ai-provider-smoke.mts` 接受 `--provider stepfun|gemini --task project-plan`，在服务端解析 credential，执行一次最小结构化 terminal-Tool invocation，再验证持久化 invocation provider/model。脚本必须脱敏 credential、prompt、Tool 参数值、source、raw delta 与 provider error body。请求的 credential 未配置时退出 2，使 Gemini 可被报告为 skipped，而不是虚假通过。

- [ ] **Step 5 — 运行 GREEN（focused test、production build/start 与确定性 smoke）。**

  ```powershell
  pnpm test -- src/features/ai/infrastructure/startup-boundary.test.ts src/features/ai/infrastructure/pi-structured-runner.test.ts
  pnpm exec tsx scripts/verification/verify-pi-runtime.mts
  pnpm build
  $n3Server = Start-Process -FilePath "pnpm.cmd" -ArgumentList @("start","--","-p","3313") -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:3313/api/health" -UseBasicParsing
    if ($response.StatusCode -ne 200) { throw "production health smoke failed" }
  } finally {
    Stop-Process -Id $n3Server.Id -Force -ErrorAction SilentlyContinue
  }
  ```

  预期：测试、fake structured smoke、build 与生产健康请求全部成功退出；smoke 输出不含 input/output payload。

- [ ] **Step 6 — 运行有预算约束的真实 provider 证据。**

  ```powershell
  pnpm exec tsx scripts/verification/verify-ai-provider-smoke.mts --provider stepfun --task project-plan
  pnpm exec tsx scripts/verification/verify-ai-provider-smoke.mts --provider gemini --task project-plan
  ```

  预期：StepFun 以一次结构化 Tool 成功并退出 0；Gemini 已配置时退出 0，未配置时以明确安全消息 `GEMINI_CREDENTIAL_NOT_CONFIGURED` 退出 2。不得重复已经成功的付费调用；只有 transport/key 成功而未通过 terminal Tool 验证不满足本步骤。

- [ ] **Step 7 — 运行 Track N3 Tier B 与专项门禁。**

  ```powershell
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm build
  rg -n "from '@earendil-works/pi-agent-core'.*Agent|\\bAgent\\b" src --glob "*.ts" --glob "!*.test.ts"
  rg -n "AI_TASK_KINDS|AiTaskKind" packages/contracts/src/ai.ts src/features/ai
  rg -n "openai|new OpenAI|@openai/agents" src trigger
  rg -n "assistantDelta|rawDelta|toolArguments|providerRawError|reasoning|thinking" src/features/ai
  if (rg -n ([char]0xFFFD) AGENTS.md README.md docs src packages trigger scripts/verification) { throw "U+FFFD detected" }
  git diff --check
  ```

  预期：

  - Tier B 命令退出 0；
  - Agent 扫描精确命中 `src/features/ai/infrastructure/pi-structured-runner.ts`；
  - 共享 tuple 恰好含四项；
  - direct-client/Agents SDK 扫描无生产源码命中；
  - 禁止 trace 字段与 U+FFFD 扫描无命中。

- [ ] **Step 8 — Track 退出门。**

  记录：

  - N3.1–N3.6 commit SHA；
  - focused 与 Tier B 退出码/测试数量；
  - 一次 StepFun structured Tool 成功与实际持久化 provider/model；
  - Gemini structured Tool 成功或明确的未配置边界；
  - `shot-generate` 使用两个全新 Agent identity，且 fabricate 失败后保留 spec checkpoint 的证明；
  - safe trace 不含 raw delta、Tool 参数值、provider 原始错误、prompt、source、credential 或 hidden reasoning 的证明；
  - 最终 worktree 状态与未 push 确认。

- [ ] **Step 9 — 仅提交 N3.6 文件。**

  ```powershell
  git add -- scripts/verification/verify-pi-runtime.mts scripts/verification/verify-ai-provider-smoke.mts src/features/ai/infrastructure/startup-boundary.test.ts package.json pnpm-lock.yaml next.config.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "chore(ai): verify Pi production runtime" -m "Task: N3.6" -m "Spec: CONTRACT-AI-004..007, HAR-AI-001..003, A12..A16" -m "Evidence: pnpm test -- src/features/ai/infrastructure/startup-boundary.test.ts && pnpm exec tsx scripts/verification/verify-pi-runtime.mts && pnpm build"
  ```
