# Track N5 音画合成闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付包含真实画面、按项目配置要求存在的音频、明确字幕模式，并经过 ffprobe、完整解码、非空帧和实体 SHA-256 检查的最终 MP4。

**Architecture:** `MediaManifestV1` 只引用 workspace 范围内的不可变 artifact ID；项目媒体策略明确记录 voice/SFX/BGM 的 required/optional/disabled 状态和字幕模式。`src/features/media/**` 独占生成、识别、字幕、媒体 provider adapter、实体 probe 与 shot-media application service；`src/features/render/render-workspace.ts` 拥有 attempt-scoped 本地 workspace 基础实现，`src/features/compose/**` 只负责 timeline、mix、concat、`ComposeWorkspace` facade、终片验证与提交，不复制第二套 workspace。`shot-media` 以 TTS/ASR/provider receipt 与实际媒体 probe 作为时间事实，`project-compose` 在 attempt 工作区内物化分镜与媒体，使用 FFmpeg 做混音、字幕处理和有序拼接。最终 verifier 按项目策略检查流、尺寸、时长、字幕、像素、完整解码和实体哈希；通过 attempt fence 后才原子提交 artifact 并投影 Finalize 节点。

**Tech Stack:** TypeScript strict mode、Zod 4、ArtifactStore/RenderWorkspace、StepFun TTS/ASR、FFmpeg、ffprobe、Jimp、SHA-256、Trigger.dev、Postgres、Vitest。

---

## Track 合同与执行顺序

- 按 N5.1 → N5.2 → N5.3 → N5.4 → N5.5 → N5.6 顺序实施。
- 前置依赖：N1 workspace/attempt/artifact 事务合同、N2 `shot-media` 与 `project-compose` Trigger task、N4 `RenderReceiptV1`/`ArtifactStore`/`RenderWorkspace` 与已验证分镜 MP4。
- 本 Track 负责 `CONTRACT-MEDIA-001..003`、`PROD-MEDIA-001..005`、`PROD-QA-003..006`、A26。
- 模型不得猜测媒体时长。TTS/ASR 返回值必须再与实际媒体 probe 对账；冲突时以实体 probe 为时间事实并记录稳定 issue code。
- 用户明确禁用 voice 或 BGM 是有效配置，不是“生成成功但丢轨”。只要任一音频角色为 required，最终 ffprobe 就必须看到至少一条音频流。
- 字幕结果必须明确为 `embedded`、`external`、`burned` 或 `disabled`；不得用模糊布尔值推断。
- 业务层只持有 artifact ID。CLI 本机路径只在 attempt 工作区内部短暂存在，不进入 DB、日志、receipt 或 UI。
- N5.2 必须完成旧 `src/features/audio/**` 的迁移与删除；Track 结束时只能保留 `features/media` 和 `features/compose` 两个清晰领域，不得留下活动的第三个媒体域或兼容 facade。

<a id="task-n51"></a>

### Task N5.1: 定义版本化媒体清单与项目媒体要求

**Dependencies:** N0 composition contract；N1 项目设置 repository；N4 workspace-scoped artifact contract。

**Spec coverage:** `CONTRACT-MEDIA-001`, `PROD-MEDIA-001`, `PROD-MEDIA-003..004`, A26。

**Files**

- Create: `src/features/media/index.ts`
- Create: `src/features/media/types.ts`
- Create: `src/features/media/media-manifest.ts`
- Create: `src/features/media/media-manifest.test.ts`
- Create: `src/features/media/media-policy.ts`
- Create: `src/features/media/media-policy.test.ts`
- Modify: `packages/contracts/src/composition.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `src/features/pipeline/repository.ts`
- Delete: none
- Prohibited: `src/features/compose/**`, `src/features/audio/**`, `src/features/render/**`, `trigger/tasks/**`, `src/app/**`, `src/lib/db/schema/**`, `migrations/**`, `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1 — 先写失败的 schema、排序和策略测试。**

  覆盖以下边界：

  - `schemaVersion` 必须严格等于数值 `1`；
  - `projectId` 必填，shot 级清单必须带 `shotId`；
  - role 仅允许 `voice | sfx | bgm | subtitle`；
  - `artifactId` 非空，`startMs >= 0`，`durationMs > 0`，`volume` 若存在则在 `[0, 1]`；
  - 条目按 role、startMs、artifactId 确定性排序；
  - 重复的同角色/同 artifact/同时间条目被拒绝；
  - voice/BGM 的 `required` 与 `disabled` 状态互斥；
  - subtitle mode 仅允许 `embedded | external | burned | disabled`；
  - required 角色缺失失败，disabled 角色意外出现失败，optional SFX 缺失允许继续；
  - 配置明确全部禁用音频时，策略结果是合法的 video-only，而不是伪造静音音轨。
  - `evaluateMediaRequirements()` 只输出 requirement evidence/issues，不输出 `ready`/`blocked`；测试中的 node/run readiness 只能由注入这些 evidence 的 N2 `ExecutionPolicy` 决定。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- src/features/media/media-manifest.test.ts src/features/media/media-policy.test.ts
  ```

  预期：退出码 1，原因是媒体清单和策略模块尚不存在；测试配置错误不算正确 RED。

- [ ] **Step 3 — 落地精确的共享媒体合同。**

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

  另定义应用控制的 `MediaRequirementPolicyV1`：

  ```ts
  export interface MediaRequirementPolicyV1 {
    schemaVersion: 1
    audio: {
      voice: 'required' | 'disabled'
      sfx: 'required' | 'optional' | 'disabled'
      bgm: 'required' | 'disabled'
    }
    subtitleMode: 'embedded' | 'external' | 'burned' | 'disabled'
    durationToleranceMs: number
  }
  ```

  `durationToleranceMs` 必须是 1–1,000 的整数。策略由项目配置读取，不能由模型输出覆盖。

- [ ] **Step 4 — 建立媒体 requirement evidence 入口。**

  `validateMediaManifest(manifest, policy)` 返回结构化 issue，不读取文件或 DB。`evaluateMediaRequirements()` 只返回逐角色的 `satisfied | missing_required | unexpected_disabled` evidence、具体 role/artifact ID 与 issue，不产生 node/run 的 `ready` 或 `blocked` 状态。只有 N2 的 `ExecutionPolicy` 可以聚合这些 evidence 后决定 node/run readiness；N5 不创建第二套状态机，也禁止用“entries 非空”替代逐角色策略。

- [ ] **Step 5 — 运行 GREEN 与合同扫描。**

  ```powershell
  pnpm test -- src/features/media/media-manifest.test.ts src/features/media/media-policy.test.ts
  pnpm typecheck
  rg -n "audioKey|trackKey|storageKey|localPath|absolutePath" packages/contracts/src/composition.ts src/features/media/media-manifest.ts src/features/media/media-policy.ts
  rg -n "Math\.random|Date\.now|performance\.now" src/features/media
  $legacyReadinessHelper = 'deriveMedia' + 'Readiness'
  if (rg -n "$legacyReadinessHelper|node.*ready|run.*ready|blocked" src/features/media/media-policy.ts) { throw "parallel readiness state machine detected" }
  git diff --check
  if (rg -n ([char]0xFFFD) packages/contracts/src/composition.ts src/features/media) { throw "U+FFFD detected" }
  ```

  预期：测试与 typecheck 退出 0；路径细节、非确定性和第二套 readiness 状态机扫描无命中；U+FFFD 无命中。

- [ ] **Step 6 — Task 退出门。**

  保存策略矩阵证据：voice/BGM 各自 required/disabled、SFX 三种状态、四种字幕模式均有成功与失败边界。明确证明 video-only 仅在所有音频要求都禁用时成立。

- [ ] **Step 7 — 仅提交 N5.1 文件。**

  ```powershell
  git add -- packages/contracts/src/composition.ts packages/contracts/src/index.ts src/features/media/index.ts src/features/media/types.ts src/features/media/media-manifest.ts src/features/media/media-manifest.test.ts src/features/media/media-policy.ts src/features/media/media-policy.test.ts src/features/pipeline/repository.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "feat(media): define versioned media manifests" -m "Task: N5.1" -m "Spec: CONTRACT-MEDIA-001, PROD-MEDIA-001, PROD-MEDIA-003..004, A26" -m "Evidence: pnpm test -- src/features/media/media-manifest.test.ts src/features/media/media-policy.test.ts"
  ```

<a id="task-n52"></a>

### Task N5.2: 通过 provider-neutral TTS/ASR 与真实 probe 构建音频对齐和字幕 artifact

**Dependencies:** N5.1；N2 `shot-media` task；N1 `media_routes`、provider credential store 与媒体调用 receipt repository；N4 ArtifactStore/RenderWorkspace。

**Spec coverage:** `CONTRACT-MEDIA-001..002`, `PROD-MEDIA-001..005`, A26。

**Files**

- Create: `src/features/media/media-probe.ts`
- Create: `src/features/media/media-probe.test.ts`
- Create: `src/features/media/speech-provider.ts`
- Create: `src/features/media/media-provider-policy.ts`
- Create: `src/features/media/media-provider-policy.test.ts`
- Create: `src/features/media/media-provider-registry.ts`
- Create: `src/features/media/media-provider-registry.test.ts`
- Create: `src/features/media/media-provider-settings-service.ts`
- Create: `src/features/media/media-provider-settings-service.test.ts`
- Create: `src/features/media/providers/stepfun-speech-client.ts`
- Create: `src/features/media/providers/stepfun-speech-client.test.ts`
- Create: `src/features/media/providers/stepfun-speech-provider.ts`
- Create: `src/features/media/providers/stepfun-speech-provider.test.ts`
- Create: `src/features/media/audio-align.ts`
- Create: `src/features/media/audio-align.test.ts`
- Create: `src/features/media/subtitle-build.ts`
- Create: `src/features/media/subtitle-build.test.ts`
- Create: `src/features/media/shot-media-service.ts`
- Create: `src/features/media/shot-media-service.test.ts`
- Create: `src/features/media/repository.ts`
- Create: `src/features/media/repository.test.ts`
- Create: `src/features/media/runtime-repository.ts`
- Create: `src/features/media/runtime-repository.test.ts`
- Create: `src/features/media/voiceover.ts`
- Create: `src/features/media/voiceover.test.ts`
- Create: `src/features/media/subtitle.ts`
- Create: `src/features/media/subtitle.test.ts`
- Create: `src/features/media/sfx.ts`
- Create: `src/features/media/sfx.test.ts`
- Create: `src/features/media/bgm.ts`
- Create: `src/features/media/bgm.test.ts`
- Modify: `src/features/media/index.ts`
- Modify: `src/features/media/types.ts`
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/app/api/settings/route.test.ts`
- Modify: `src/app/(app)/settings/model-service-settings.tsx`
- Modify: `trigger/tasks/shot-media.ts`
- Modify: `trigger/tasks/shot-media.test.ts`
- Modify: `src/features/director/stage-effects.ts`
- Modify: `src/features/director/stage-effects.test.ts`
- Modify: `src/features/pipeline/repository.ts`
- Modify: `packages/contracts/src/composition.ts`
- Modify: `packages/contracts/src/index.ts`
- Delete: `src/features/audio/index.ts`
- Delete: `src/features/audio/types.ts`
- Delete: `src/features/audio/repository.ts`
- Delete: `src/features/audio/repository.test.ts`
- Delete: `src/features/audio/runtime-repository.ts`
- Delete: `src/features/audio/runtime-repository.test.ts`
- Delete: `src/features/audio/stepfun-audio-client.ts`
- Delete: `src/features/audio/stepfun-audio-client.test.ts`
- Delete: `src/features/audio/voiceover.ts`
- Delete: `src/features/audio/voiceover.test.ts`
- Delete: `src/features/audio/subtitle.ts`
- Delete: `src/features/audio/subtitle.test.ts`
- Delete: `src/features/audio/sfx.ts`
- Delete: `src/features/audio/sfx.test.ts`
- Delete: `src/features/audio/score.ts`
- Delete: `src/features/audio/score.test.ts`
- Prohibited: `src/features/compose/**`, `src/features/render/**`, `trigger/tasks/project-compose.ts`, `src/features/director/**`（Files 中明确列出的 `stage-effects.ts` 与测试除外）, `src/app/(app)/canvas/**`, `src/app/api/render/**`, `src/components/**`, `src/app/playbook/**`, `docs/designs/canvas.pen`, `src/app/(app)/layout.tsx`, `src/features/navigation/**`, `src/lib/db/schema/**`, `migrations/**`

- [ ] **Step 1 — 先写 provider transcript、probe 和时间轴 RED 测试。**

  使用 fake TTS/ASR transcript 与真实生成的短音频 fixture，断言：

  - TTS 音频字节为空、HTTP 失败、receipt schema 错误均失败且不提交 artifact；
  - TTS 自带 caption 时间码单调、非负、结尾不超过实际 probe 时长加容差时可用；
  - TTS 未给可用 caption 时只调用一次 ASR；
  - ASR caption 重叠、倒序、越界或空文本失败；
  - provider 自报时长与 ffprobe 冲突时采用实体 probe 时长，并记录 `MEDIA_DURATION_RECEIPT_MISMATCH`；
  - `MediaTaskKind` 恰好只有 `tts | asr`，且不会进入或扩充四个 `AiTaskKind`；
  - `MediaProviderPolicy.resolve()` 是唯一媒体 provider/model 选择点，workspace `media_routes` 覆盖默认路由；
  - `MediaProviderRegistry` 是唯一创建 StepFun speech adapter 的位置，只有该 adapter 能构造底层 client；
  - `shot-media-service.ts`、Trigger task 与设置 UI 不构造 provider/client、不读取媒体模型环境变量；
  - 设置页 effective media route、`SpeechProvider` receipt 的 provider/model 与持久化调用记录完全一致；
  - voice disabled 时 TTS/ASR 调用次数均为 0；
  - subtitle disabled 时不生成字幕 artifact；
  - 取消时不提交部分媒体清单；
  - 所有清单条目只携带 artifact ID 和真实时间码。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- src/features/media/media-provider-policy.test.ts src/features/media/media-provider-registry.test.ts src/features/media/media-provider-settings-service.test.ts src/features/media/media-probe.test.ts src/features/media/audio-align.test.ts src/features/media/subtitle-build.test.ts src/features/media/shot-media-service.test.ts
  ```

  预期：退出码 1，因为 provider-neutral 媒体路由、speech port、media application service 与 probe 尚不存在。

- [ ] **Step 3 — 定义独立于 Pi 的媒体任务与 speech port。**

  共享合同必须定义：

  ```ts
  export const MEDIA_TASK_KINDS = ['tts', 'asr'] as const
  export type MediaTaskKind = (typeof MEDIA_TASK_KINDS)[number]

  export interface SpeechProvider {
    synthesize(
      request: SpeechSynthesisRequestV1,
      signal?: AbortSignal
    ): Promise<SpeechSynthesisReceiptV1>
    transcribe(
      request: SpeechTranscriptionRequestV1,
      signal?: AbortSignal
    ): Promise<SpeechTranscriptionReceiptV1>
  }
  ```

  `MediaTaskKind` 是媒体 service task 分类，不属于 `AiTaskKind`，不使用 Pi `Agent` 或 terminal Tool。`MediaProviderPolicy.resolve(task, workspaceSettings)` 是唯一媒体 provider/model 选择点；输入来自 N1 `media_routes`，输出包含 provider、modelId 与 route revision，不包含凭据。

- [ ] **Step 4 — 实现唯一的 media provider registry 与 StepFun adapter 构造边界。**

  `MediaProviderRegistry.create(resolvedRoute, workspaceId)` 通过 N1 `ProviderCredentialStore` 解析服务端凭据，再选择实现 `SpeechProvider` 的 StepFun adapter。只有 `src/features/media/providers/stepfun-speech-provider.ts` 可以 import 并构造 `stepfun-speech-client.ts`；registry 只构造 adapter，不接触底层 client。`shot-media-service.ts`、Trigger task、设置 API/UI 不得选择 provider/model、构造 client 或读取 `STEPFUN_*`/`GEMINI_*` 环境变量。

- [ ] **Step 5 — 实现受控的 ffprobe 端口。**

  `media-probe.ts` 通过注入的 `MediaProbeRunner` 执行：

  ```powershell
  ffprobe -v error -show_streams -show_format -of json <attempt-media-file>
  ```

  生产 resolver 只接受服务器配置的 `FFPROBE_PATH` 或 PATH 中的 `ffprobe`，启动时验证可执行版本；命令参数使用数组传入，不拼 shell 字符串。输出限制 64 KiB，超时 30 秒，支持 `AbortSignal`，错误信息只保留稳定 code 和脱敏摘要。

- [ ] **Step 6 — 用实体时间事实实现音频对齐。**

  TTS/ASR provider receipt 保留 provider、model、request ID、caption source 和原始时长声明的哈希，不保存凭据或完整原始响应。音频写入临时 artifact 后立即 probe；`audio-align.ts` 以 probe 时长裁剪/校验 caption，并产出单调、闭区间、毫秒整数时间轴。

- [ ] **Step 7 — 生成可追溯字幕。**

  `subtitle-build.ts` 从 source text artifact ID、source audio artifact ID、provider receipt artifact ID 和校验后的 caption 构建版本化字幕 JSON，同时确定性生成 UTF-8 WebVTT 与 SRT 字节。换行与时间码格式固定，条目按 start/end/source order 排序；不使用本机路径或当前时间。

- [ ] **Step 8 — 让设置页和 `shot-media` 只调用 application service。**

  `media-provider-settings-service.ts` 读写 `media_routes` 并返回 `tts`/`asr` 两行 configured/effective route 与 credential status；更新使用 revision CAS，不返回凭据。测试保存 `tts → stepfun/model-X` 后执行一次 fake provider 调用，断言设置 effective route、provider receipt 与持久化媒体调用记录三者完全一致。

  `model-service-settings.tsx` 只能在既有视觉结构中接入真实 `MediaProviderPolicy` DTO 与 controlled handler；不得新增视觉原语、改变布局、拆分组件或实施任何未经 `canvas.pen` 定义的视觉变更。设置页完整视觉拆分仍归 N6，本 Task 不越界代做。

  `shot-media-service.ts` 根据 `MediaRequirementPolicyV1` 决定 voice/SFX/subtitle 分支，通过 `MediaProviderPolicy` + `MediaProviderRegistry` 获取 `SpeechProvider`，逐个提交 immutable artifact，最后在 attempt fence 下提交完整 `MediaManifestV1`。Trigger task 只传 scope、可信 Shot 输入与 `ctx.signal`，不直接访问 provider、DB、本机文件或环境变量。

- [ ] **Step 9 — 迁移并删除旧 `features/audio` 域。**

  把旧 repository/runtime repository、StepFun client、voiceover、subtitle、SFX 与 score/BGM 的仍需行为迁入 `features/media`，并将 `stage-effects.ts` 等剩余调用方切到 `@/features/media` 的 public API。迁移测试必须先锁定旧行为，再在新路径通过；不得保留 re-export facade、双写 repository 或从 `features/media` 反向 import `features/audio`。完成调用方扫描后删除 Files 中列出的整个旧目录，使 N5.2 提交本身即可 typecheck，而不是把清理拖到 Track 末尾。

- [ ] **Step 10 — 运行 GREEN、真实音频 probe 与边界扫描。**

  ```powershell
  pnpm test -- src/features/media/media-provider-policy.test.ts src/features/media/media-provider-registry.test.ts src/features/media/media-provider-settings-service.test.ts src/features/media/media-probe.test.ts src/features/media/audio-align.test.ts src/features/media/subtitle-build.test.ts src/features/media/shot-media-service.test.ts src/features/media/providers/stepfun-speech-client.test.ts src/features/media/providers/stepfun-speech-provider.test.ts src/features/media/voiceover.test.ts src/features/media/subtitle.test.ts src/features/media/sfx.test.ts src/features/media/bgm.test.ts src/features/media/repository.test.ts src/features/media/runtime-repository.test.ts src/app/api/settings/route.test.ts src/features/director/stage-effects.test.ts trigger/tasks/shot-media.test.ts
  pnpm typecheck
  rg -n "durationMs\\s*[:=].*(model|response)|audioKey|trackKey|storageKey|localPath" src/features/media trigger/tasks/shot-media.ts
  rg -n "apiKey|authorization|provider.*error|rawResponse" src/features/media
  rg -n "@earendil-works/pi-agent-core|@earendil-works/pi-ai|\\bAgent\\b|AiTaskRuntime" src/features/media trigger/tasks/shot-media.ts
  rg -n "process\\.env|STEPFUN_|GEMINI_|new .*Client|createProvider|modelId\\s*=" src/features/media/shot-media-service.ts trigger/tasks/shot-media.ts src/app/api/settings/route.ts 'src/app/(app)/settings/model-service-settings.tsx'
  rg -n "stepfun-speech-client" src trigger --glob "*.ts" --glob "!*.test.ts" --glob "!src/features/media/providers/stepfun-speech-provider.ts" --glob "!src/features/media/providers/stepfun-speech-client.ts"
  rg -n "MEDIA_TASK_KINDS|AI_TASK_KINDS" packages/contracts/src src/features/media
  if (Test-Path -LiteralPath 'src/features/audio') { throw "legacy features/audio domain still exists" }
  if (rg -n "features/audio" src trigger) { throw "legacy features/audio import detected" }
  git diff --check
  if (rg -n ([char]0xFFFD) src/features/media trigger/tasks/shot-media.ts) { throw "U+FFFD detected" }
  ```

  预期：测试/typecheck 退出 0；没有把 provider 声明时长当成最终事实的分支；shot-media 路径零 Agent、零 provider/client 构造、零环境变量读取；StepFun client 仅由 adapter 构造，adapter 仅由 registry 创建；`MEDIA_TASK_KINDS` 与四个 `AI_TASK_KINDS` 相互独立；旧 `features/audio` 目录与 import 均不存在；路径和敏感字段不进入清单/日志；UTF-8 扫描干净。

- [ ] **Step 11 — Task 退出门。**

  保存一份 fake provider + 真实 ffprobe 的证据：effective `tts`/`asr` route、实际 receipt provider/model、持久化调用记录、probe 时长、caption 数量/首尾时间、生成的 VTT/SRT artifact ID、媒体清单 artifact ID，以及旧 `features/audio` 目录/import 为零的扫描结果。证据不得含凭据、音频本机路径或 provider 原始响应。

- [ ] **Step 12 — 仅提交 N5.2 文件。**

  ```powershell
  git add -- packages/contracts/src/composition.ts packages/contracts/src/index.ts src/features/media src/features/audio src/features/pipeline/repository.ts src/features/director/stage-effects.ts src/features/director/stage-effects.test.ts src/app/api/settings/route.ts src/app/api/settings/route.test.ts 'src/app/(app)/settings/model-service-settings.tsx' trigger/tasks/shot-media.ts trigger/tasks/shot-media.test.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "feat(media): align voice and subtitles" -m "Task: N5.2" -m "Spec: CONTRACT-MEDIA-001..002, PROD-MEDIA-001..005, A26" -m "Evidence: pnpm test -- src/features/media/media-probe.test.ts src/features/media/audio-align.test.ts src/features/media/subtitle-build.test.ts src/features/media/shot-media-service.test.ts"
  ```

<a id="task-n53"></a>

### Task N5.3: 实现 voice/SFX/BGM 混音、字幕模式和分镜有序拼接

**Dependencies:** N5.2；N4 已验证的 shot MP4 receipt；N2 `project-compose` task。

**Spec coverage:** `CONTRACT-MEDIA-001..003`, `PROD-MEDIA-003..005`, `PROD-QA-003..004`, A26。

**Files**

- Create: `src/features/compose/ffmpeg-runner.ts`
- Create: `src/features/compose/ffmpeg-runner.test.ts`
- Create: `src/features/compose/mix.ts`
- Create: `src/features/compose/mix.test.ts`
- Create: `src/features/compose/mix.integration.test.ts`
- Create: `src/features/compose/compose-service.ts`
- Create: `src/features/compose/compose-service.test.ts`
- Modify: `packages/contracts/src/composition.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `trigger/tasks/project-compose.ts`
- Modify: `trigger/tasks/project-compose.test.ts`
- Modify: `src/features/pipeline/repository.ts`
- Delete: none
- Prohibited: `src/features/media/**`, `src/features/audio/**`, `src/features/render/legacy-provider.ts`, `src/features/render/hyperframes-provider.ts`, `src/features/director/**`, `src/features/ai/**`, `src/app/**`, `src/lib/db/schema/**`, `migrations/**`

- [ ] **Step 1 — 先写 FFmpeg 参数、策略和真实合成 RED 测试。**

  覆盖：

  - Shot 顺序来自可信 shot plan/lane order，不按文件名或 artifact ID 猜测；
  - voice/SFX 按 `startMs` 延迟，按 `durationMs` 裁剪，按 `volume` 应用增益；
  - BGM 循环只覆盖项目总时长，并在结尾确定性淡出；
  - 多音轨使用固定输入排序和 `amix`，输出 AAC；
  - required 轨缺失时在启动 FFmpeg 前失败；
  - disabled 轨存在时失败；
  - 所有音频要求 disabled 时显式输出 video-only；
  - embedded 字幕产生 MP4 subtitle stream；
  - external 字幕保留独立 artifact 且 receipt 指明其 artifact ID；
  - burned 字幕通过受信字体与本地字幕 artifact 烧录，receipt 指明 burned；
  - 分镜编码参数不兼容时走固定应用编码配置，不静默 stream-copy；
  - 取消会中止 FFmpeg 子进程且不提交终片；
  - 真实短 fixture 合成后可由 ffprobe 看到预期流。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- src/features/compose/ffmpeg-runner.test.ts src/features/compose/mix.test.ts src/features/compose/compose-service.test.ts
  ```

  预期：退出码 1，因为 FFmpeg runner、mix 和 compose service 尚不存在。

- [ ] **Step 3 — 实现安全、可取消的 FFmpeg runner。**

  解析服务器配置的 `FFMPEG_PATH` 或 PATH 中 `ffmpeg`，参数以数组传递，设置 `-nostdin -hide_banner -loglevel error`，限制 stderr 64 KiB、总执行 10 分钟、输出 2 GiB。`AbortSignal` 触发子进程终止；错误只返回 exit code、稳定 code 与脱敏末尾摘要。

- [ ] **Step 4 — 构造确定性 filter graph。**

  `mix.ts` 将每个 voice/SFX/BGM 输入映射为固定索引，使用 `atrim`、`asetpts`、`adelay`、`volume`、`afade`、`amix` 和 `aresample`。所有毫秒值来自已验证 manifest。每个 Shot 先生成规范化 A/V 段，再按 shot plan 顺序 concat；输出固定为 H.264/yuv420p + AAC，清除可变 metadata，并使用 `+faststart`。

- [ ] **Step 5 — 实现四种字幕分支。**

  - `embedded`: 将 UTF-8 字幕转为 MP4 支持的字幕轨并 mux；
  - `external`: 不向 MP4 伪造字幕流，receipt 引用独立字幕 artifact；
  - `burned`: 使用 attempt 工作区内受信字体/字幕文件执行视频滤镜；
  - `disabled`: 不读取或生成字幕输入。

  字幕选择完全来自 `MediaRequirementPolicyV1`，不能根据“是否找到文件”反推。

- [ ] **Step 6 — 让 compose service 只消费 artifact/render contracts。**

  输入为项目 scope、ordered `RenderReceiptV1[]`、`MediaManifestV1[]`、项目媒体策略和 `AbortSignal`。服务通过 `ArtifactStore`/`RenderWorkspace` 物化输入，不 import Director、AI、Canvas 实现或旧 StorageAdapter。

- [ ] **Step 7 — 运行 GREEN 与真实 FFmpeg integration。**

  ```powershell
  pnpm test -- src/features/compose/ffmpeg-runner.test.ts src/features/compose/mix.test.ts src/features/compose/compose-service.test.ts trigger/tasks/project-compose.test.ts
  pnpm test -- src/features/compose/mix.integration.test.ts
  pnpm typecheck
  rg -n "director|features/ai|features/media|features/audio|lib/storage|localPath|storageKey" src/features/compose trigger/tasks/project-compose.ts
  rg -n "shell:\\s*true|exec\\(|execSync|cmd\\.exe|powershell" src/features/compose
  git diff --check
  if (rg -n ([char]0xFFFD) src/features/compose trigger/tasks/project-compose.ts packages/contracts/src/composition.ts) { throw "U+FFFD detected" }
  ```

  预期：unit/integration/typecheck 退出 0；依赖与 shell 拼接扫描无命中；真实 fixture 的流类型与策略一致。

- [ ] **Step 8 — Task 退出门。**

  为 video-only、required voice、required BGM、voice+SFX+BGM、三种启用字幕模式分别保存 ffprobe 投影。每份证据包含策略、输入 artifact ID、流类型和时长，不包含本机路径。

- [ ] **Step 9 — 仅提交 N5.3 文件。**

  ```powershell
  git add -- src/features/compose/ffmpeg-runner.ts src/features/compose/ffmpeg-runner.test.ts src/features/compose/mix.ts src/features/compose/mix.test.ts src/features/compose/mix.integration.test.ts src/features/compose/compose-service.ts src/features/compose/compose-service.test.ts packages/contracts/src/composition.ts packages/contracts/src/index.ts trigger/tasks/project-compose.ts trigger/tasks/project-compose.test.ts src/features/pipeline/repository.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "feat(compose): mix audio and concatenate shots" -m "Task: N5.3" -m "Spec: CONTRACT-MEDIA-001..003, PROD-MEDIA-003..005, PROD-QA-003..004, A26" -m "Evidence: pnpm test -- src/features/compose/ffmpeg-runner.test.ts src/features/compose/mix.test.ts src/features/compose/compose-service.test.ts && pnpm test -- src/features/compose/mix.integration.test.ts"
  ```

<a id="task-n54"></a>

### Task N5.4: 用 ffprobe、完整解码、非空帧和实体哈希验收终片

**Dependencies:** N5.3。

**Spec coverage:** `CONTRACT-MEDIA-003`, `PROD-QA-003..006`, A26。

**Files**

- Create: `src/features/compose/verify.ts`
- Create: `src/features/compose/verify.test.ts`
- Create: `src/features/compose/verify.integration.test.ts`
- Create: `scripts/verification/verify-final-media.mts`
- Modify: `packages/contracts/src/composition.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `src/features/compose/compose-service.ts`
- Modify: `src/features/compose/compose-service.test.ts`
- Delete: none
- Prohibited: `src/features/media/**`, `src/features/audio/**`, `src/features/render/**`, `src/features/director/**`, `src/features/ai/**`, `src/app/**`, `trigger/tasks/shot-render.ts`, `src/lib/db/schema/**`, `migrations/**`

- [ ] **Step 1 — 先写最终媒体 receipt 与验收 RED 测试。**

  对 synthetic fixture 与伪造 ffprobe JSON 覆盖：

  - 恰好一条视频流；
  - 任一音频角色 required 时至少一条音频流；
  - 全音频 disabled 时零音频流合法；
  - embedded 需要 subtitle stream；
  - external 需要可读独立字幕 artifact，MP4 subtitle stream 非必需；
  - burned 需要 receipt/provenance 明确标记且抽样帧非空；
  - disabled 不得引用字幕 artifact；
  - width/height 与项目输出配置一致；
  - 实际总时长与预期时长差不超过 `durationToleranceMs`；
  - 首帧、中帧、末帧均可解码且不是空/纯无效样本；
  - `ffmpeg -f null` 完整解码退出 0；
  - 最终实体 SHA-256 与 receipt/DB 值一致；
  - 截断、损坏、多视频流、缺 required 音频、错误字幕模式、错误尺寸/时长/hash 全部失败。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- src/features/compose/verify.test.ts
  ```

  预期：退出码 1，因为最终 verifier 和 receipt 尚不存在。

- [ ] **Step 3 — 定义版本化最终 receipt。**

  `FinalMediaReceiptV1` 至少包含：

  ```ts
  export interface FinalMediaReceiptV1 {
    schemaVersion: 1
    projectId: string
    outputArtifactId: string
    contentHash: string
    byteSize: number
    durationMs: number
    width: number
    height: number
    streams: {
      video: number
      audio: number
      subtitle: number
    }
    subtitle:
      | { mode: 'embedded' }
      | { mode: 'external'; artifactId: string }
      | { mode: 'burned'; sourceArtifactId: string }
      | { mode: 'disabled' }
    verification: readonly ContractIssueV1[]
  }
  ```

  receipt 不包含本机路径、storage 细节或命令 stderr。

- [ ] **Step 4 — 实现真实媒体检查。**

  - ffprobe：`-v error -show_streams -show_format -of json`；
  - 完整解码：`ffmpeg -v error -nostdin -i <file> -f null -`；
  - 帧抽样：首帧、总时长中点、最后一个有效帧；
  - 像素检查：Jimp 计算平均亮度/方差，拒绝空字节、全透明或全单色无效样本；
  - SHA-256：直接对最终 MP4 字节流计算；
  - 所有子进程支持 `AbortSignal`、超时和有界 stderr。

- [ ] **Step 5 — 让 compose service 在提交前强制验收。**

  compose 输出先留在 attempt 工作区；`verifyFinalMedia()` 全部通过后才允许进入 artifact commit。任一检查失败时返回稳定 issue code，禁止登记 success artifact 或 Finalize success。

- [ ] **Step 6 — 运行 GREEN、真实 integration 与证据脚本。**

  ```powershell
  pnpm test -- src/features/compose/verify.test.ts src/features/compose/compose-service.test.ts
  pnpm test -- src/features/compose/verify.integration.test.ts
  pnpm exec tsx scripts/verification/verify-final-media.mts
  pnpm typecheck
  rg -n "contentHash.*renderKey|renderKey.*contentHash|storageKey|localPath|absolutePath" src/features/compose packages/contracts/src/composition.ts
  git diff --check
  if (rg -n ([char]0xFFFD) src/features/compose scripts/verification/verify-final-media.mts packages/contracts/src/composition.ts) { throw "U+FFFD detected" }
  ```

  预期：unit/integration/脚本/typecheck 退出 0；哈希混用和路径细节扫描无命中；证据报告显示流、时长、尺寸、解码、像素与 SHA 全通过。

- [ ] **Step 7 — Task 退出门。**

  对 required-audio、video-only、embedded、external、burned 五个场景保存结构化验证结果；至少一个 required-audio 终片必须由真实 ffprobe 证明存在音频流。

- [ ] **Step 8 — 仅提交 N5.4 文件。**

  ```powershell
  git add -- src/features/compose/verify.ts src/features/compose/verify.test.ts src/features/compose/verify.integration.test.ts scripts/verification/verify-final-media.mts packages/contracts/src/composition.ts packages/contracts/src/index.ts src/features/compose/compose-service.ts src/features/compose/compose-service.test.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "feat(compose): verify final media entity" -m "Task: N5.4" -m "Spec: CONTRACT-MEDIA-003, PROD-QA-003..006, A26" -m "Evidence: pnpm test -- src/features/compose/verify.test.ts src/features/compose/compose-service.test.ts && pnpm exec tsx scripts/verification/verify-final-media.mts"
  ```

<a id="task-n55"></a>

### Task N5.5: 保证 attempt 工作区、取消、失败与孤儿清理闭环

**Dependencies:** N5.4；N4 `RenderWorkspace`。

**Spec coverage:** `CONTRACT-STORE-001`, `EXEC-CMD-004`, `DATA-005`, `PROD-RUN-002`, `PROD-NFR-REC-001..002`。

**Files**

- Create: `src/features/compose/compose-workspace.ts`
- Create: `src/features/compose/compose-workspace.test.ts`
- Create: `src/features/compose/orphan-workspace-sweeper.ts`
- Create: `src/features/compose/orphan-workspace-sweeper.test.ts`
- Create: `scripts/verification/verify-compose-cleanup.mts`
- Modify: `src/features/compose/ffmpeg-runner.ts`
- Modify: `src/features/compose/ffmpeg-runner.test.ts`
- Modify: `src/features/compose/compose-service.ts`
- Modify: `src/features/compose/compose-service.test.ts`
- Modify: `trigger/tasks/project-compose.ts`
- Modify: `trigger/tasks/project-compose.test.ts`
- Delete: none
- Prohibited: `src/features/media/**`, `src/features/audio/**`, `src/lib/storage/**`, `src/features/render/render-workspace.ts`, `src/features/director/**`, `src/app/**`, `src/lib/db/schema/**`, `migrations/**`

- [ ] **Step 1 — 先写成功、失败、取消、stale 与孤儿清理 RED 测试。**

  断言：

  - workspace root 包含可信 attempt ID，且所有相对路径通过同一 guard；
  - 成功、FFmpeg 失败、ffprobe 失败、artifact commit 失败均调用一次 cleanup；
  - 取消会先中止子进程，再进入 `finally` cleanup；
  - `onCancel` 仅加速，不是唯一清理路径；
  - stale attempt 不能提交 artifact/Finalize 状态，但仍清理 workspace；
  - 超过 24 小时且无 active attempt 的孤儿目录会被 sweeper 清理；
  - 活跃 attempt、24 小时内目录和 workspace root 之外路径绝不被触碰；
  - receipt、日志、错误和 DB fixture 不出现本机绝对路径。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- src/features/compose/compose-workspace.test.ts src/features/compose/orphan-workspace-sweeper.test.ts src/features/compose/ffmpeg-runner.test.ts src/features/compose/compose-service.test.ts
  ```

  预期：退出码 1，因为 compose workspace facade 与 sweeper 尚不存在。

- [ ] **Step 3 — 实现 RenderWorkspace 上的 compose facade。**

  `ComposeWorkspace` 只接受 `WorkspaceScope` 和经过验证的相对文件名，委托 N4 `RenderWorkspace` 创建、物化和 cleanup。输出文件分配也必须经过 attempt-root guard。业务服务不读取 workspace root，不自行拼系统临时目录。

- [ ] **Step 4 — 实现可取消进程与 finally 清理。**

  FFmpeg/ffprobe 进程接收同一 `AbortSignal`；取消时先发正常终止，2 秒后仍存活才强制结束。`compose-service.ts` 用单一 `try/finally` 包围 materialize、mix、verify、commit 全过程。cleanup 自身失败只追加 bounded operational issue，不能覆盖原始业务错误。

- [ ] **Step 5 — 实现有界孤儿 sweeper。**

  sweeper 只遍历 compose workspace 固定根，使用 repository 查询 active attempt，单次最多处理 100 个超过 24 小时的候选。任何解析失败或越界候选只记录稳定 code 并跳过，不扩大目标范围。

- [ ] **Step 6 — 运行 GREEN 与真实 cleanup 脚本。**

  ```powershell
  pnpm test -- src/features/compose/compose-workspace.test.ts src/features/compose/orphan-workspace-sweeper.test.ts src/features/compose/ffmpeg-runner.test.ts src/features/compose/compose-service.test.ts trigger/tasks/project-compose.test.ts
  pnpm exec tsx scripts/verification/verify-compose-cleanup.mts
  pnpm typecheck
  rg -n "mkdtemp|tmpdir|node:fs|lib/storage|localPath|storageKey" src/features/compose trigger/tasks/project-compose.ts
  rg -n "[A-Za-z]:\\\\|/tmp/|absolutePath" src/features/compose trigger/tasks/project-compose.ts
  git diff --check
  if (rg -n ([char]0xFFFD) src/features/compose trigger/tasks/project-compose.ts scripts/verification/verify-compose-cleanup.mts) { throw "U+FFFD detected" }
  ```

  预期：测试/脚本/typecheck 退出 0；业务模块没有直接临时目录/旧存储调用；路径泄露与 U+FFFD 扫描无命中。

- [ ] **Step 7 — Task 退出门。**

  真实运行成功、注入失败和中途取消各一次；每次结束后脚本断言 attempt 工作区不存在。再构造一个过期孤儿和一个活跃目录，证明只清理过期孤儿。

- [ ] **Step 8 — 仅提交 N5.5 文件。**

  ```powershell
  git add -- src/features/compose/compose-workspace.ts src/features/compose/compose-workspace.test.ts src/features/compose/orphan-workspace-sweeper.ts src/features/compose/orphan-workspace-sweeper.test.ts scripts/verification/verify-compose-cleanup.mts src/features/compose/ffmpeg-runner.ts src/features/compose/ffmpeg-runner.test.ts src/features/compose/compose-service.ts src/features/compose/compose-service.test.ts trigger/tasks/project-compose.ts trigger/tasks/project-compose.test.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "fix(compose): close attempt workspace cleanup" -m "Task: N5.5" -m "Spec: CONTRACT-STORE-001, EXEC-CMD-004, DATA-005, PROD-RUN-002, PROD-NFR-REC-001..002" -m "Evidence: pnpm test -- src/features/compose/compose-workspace.test.ts src/features/compose/orphan-workspace-sweeper.test.ts src/features/compose/compose-service.test.ts && pnpm exec tsx scripts/verification/verify-compose-cleanup.mts"
  ```

<a id="task-n56"></a>

### Task N5.6: 原子提交终片并投影 Finalize 节点

**Dependencies:** N5.5；N1 artifact commit/repository；N2 run/node 状态所有权与 Realtime snapshot。

**Spec coverage:** `CONTRACT-ART-001..002`, `CONTRACT-MEDIA-003`, `DATA-004..005`, `PROD-QA-003..006`, A10, A26。

**Files**

- Create: `src/features/compose/compose-commit.test.ts`
- Create: `src/features/compose/finalize-projection.test.ts`
- Modify: `src/features/compose/compose-service.ts`
- Modify: `src/features/compose/compose-service.test.ts`
- Modify: `src/features/pipeline/repository.ts`
- Modify: `src/features/pipeline/run-snapshot.ts`
- Modify: `packages/contracts/src/run.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `trigger/tasks/project-compose.ts`
- Modify: `trigger/tasks/project-compose.test.ts`
- Delete: none
- Prohibited: `src/features/media/**`, `src/features/audio/**`, `src/features/ai/**`, `src/features/director/**`, `src/features/render/**`, `src/app/**`, `src/lib/db/schema/**`, `migrations/**`, `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1 — 先写 commit/fence/projection RED 测试。**

  覆盖：

  - verify 失败时没有 immutable artifact、业务引用或 Finalize success；
  - artifact 写入后事务失败时没有业务引用，attempt 为 failed；
  - stale attempt 在提交前被 fence 拒绝；
  - retry 命中同 input fingerprint + 同实体 hash 时复用已提交 checkpoint，不重复合成；
  - 成功事务同时登记 final MP4 artifact、`FinalMediaReceiptV1`、项目 export/Finalize 节点投影和 task checkpoint；
  - DB `content_hash` 与最终 MP4 实体 SHA-256 完全相等；
  - Snapshot 只展示 artifact ID、媒体 probe、subtitle mode、gate 状态和可追溯错误；
  - `project-compose` 不产生第五种 AI task，也不调用 Pi/model。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- src/features/compose/compose-commit.test.ts src/features/compose/finalize-projection.test.ts src/features/compose/compose-service.test.ts trigger/tasks/project-compose.test.ts
  ```

  预期：退出码 1，因为原子 commit 与 Finalize projection 尚未闭合。

- [ ] **Step 3 — 实现 attempt-fenced 原子提交。**

  顺序固定为：

  1. 在 attempt workspace 生成候选终片；
  2. 完成 N5.4 全部 verify；
  3. 写入临时 artifact 内容并取得实体 SHA-256/size；
  4. 检查当前 attempt fence；
  5. 在一个 Postgres 事务中登记 immutable artifact、receipt、project reference、Finalize node projection 和 task checkpoint；
  6. 事务成功后返回 artifact ID；
  7. `finally` 清理 workspace。

  已提交终片不可原地覆盖；重试产生新版本或命中严格相同 checkpoint。

- [ ] **Step 4 — 投影真实 Finalize/Snapshot 字段。**

  `run-snapshot.ts` 的导出字段直接来自 `FinalMediaReceiptV1` 和 artifact 记录：artifact ID、content hash、byte size、duration、width/height、video/audio/subtitle stream count、subtitle mode、verification issues。禁止固定进度、固定文件名、恒真 QA 或服务器路径。

- [ ] **Step 5 — 保持 compose 为纯应用/媒体路径。**

  `project-compose` 只调用 compose application service。score/export 节点是确定性媒体状态投影，不调用 N3 runtime；全仓 `AiTaskKind` 仍只有四项。

- [ ] **Step 6 — 运行 GREEN、Tier B 与 Track 专项验收。**

  ```powershell
  pnpm test -- src/features/compose/compose-commit.test.ts src/features/compose/finalize-projection.test.ts src/features/compose/compose-service.test.ts trigger/tasks/project-compose.test.ts
  pnpm exec tsx scripts/verification/verify-final-media.mts
  pnpm exec tsx scripts/verification/verify-compose-cleanup.mts
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm build
  rg -n "@earendil-works/pi-agent-core|@earendil-works/pi-ai|AiTaskRuntime|AiTaskKind" src/features/compose trigger/tasks/project-compose.ts
  if (rg -n "features/media|features/audio" src/features/compose trigger/tasks/project-compose.ts) { throw "compose imports media implementation or legacy audio domain" }
  if (Test-Path -LiteralPath 'src/features/audio') { throw "legacy features/audio domain still exists" }
  rg -n "storageKey|localPath|absolutePath|outputKey" src/features/compose packages/contracts/src/run.ts trigger/tasks/project-compose.ts
  rg -n "checked:\\s*true|progress:\\s*[0-9]+|final\\.mp4" src/features/pipeline/run-snapshot.ts
  if (rg -n ([char]0xFFFD) AGENTS.md README.md docs src packages trigger scripts/verification) { throw "U+FFFD detected" }
  git diff --check
  ```

  预期：

  - focused、真实媒体脚本、cleanup 脚本与 Tier B 全部退出 0；
  - compose/Trigger task 没有 Pi/AI import；
  - compose 仅消费共享 media contract，不 import `features/media` 实现，旧 `features/audio` 域不存在；
  - public receipt/Snapshot 没有存储或本机路径细节；
  - Snapshot 没有恒定假值；
  - UTF-8 与 diff 检查通过。

- [ ] **Step 7 — Track 退出门。**

  记录：

  - N5.1–N5.6 commit SHA；
  - voice/SFX/BGM/subtitle 策略矩阵；
  - TTS/ASR receipt 与真实 probe 对账结果；
  - required audio 的 ffprobe 音频流证据，以及全音频 disabled 的合法 video-only 证据；
  - embedded/external/burned 三种字幕合同证据；
  - 尺寸、时长容差、非空帧、完整解码、实体 SHA-256 与 DB 一致证据；
  - 成功、失败、取消、孤儿清理后均无 temp workspace；
  - `features/media` 与 `features/compose` 职责扫描通过，且 `features/audio` 目录/import 为零；
  - focused/Tier B 命令退出码与测试数量；
  - 最终 worktree 状态和未 push 确认。

- [ ] **Step 8 — 仅提交 N5.6 文件。**

  ```powershell
  git add -- src/features/compose/compose-commit.test.ts src/features/compose/finalize-projection.test.ts src/features/compose/compose-service.ts src/features/compose/compose-service.test.ts src/features/pipeline/repository.ts src/features/pipeline/run-snapshot.ts packages/contracts/src/run.ts packages/contracts/src/index.ts trigger/tasks/project-compose.ts trigger/tasks/project-compose.test.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "feat(compose): commit verified final media" -m "Task: N5.6" -m "Spec: CONTRACT-ART-001..002, CONTRACT-MEDIA-003, DATA-004..005, PROD-QA-003..006, A10, A26" -m "Evidence: pnpm test -- src/features/compose/compose-commit.test.ts src/features/compose/finalize-projection.test.ts src/features/compose/compose-service.test.ts trigger/tasks/project-compose.test.ts && pnpm exec tsx scripts/verification/verify-final-media.mts"
  ```
