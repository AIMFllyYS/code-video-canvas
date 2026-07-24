# Issues 11–13 and Gemini Routing Design

## Goal

按 `issue-11`、`issue-12`、`issue-13` 的完整范围依次打通自动推进、真实音频/视觉能力与产物门禁反馈重试；随后把 Gemini 作为独立 provider 接入，并允许用户按画布节点选择 StepFun 或 Gemini。StepFun TTS/ASR 保持为音频能力的唯一 provider。

## Existing contracts

- `issue-11`、`issue-12`、`issue-13` 是本次施工的上位规格；禁止改变 DAG 边定义、队列职责、确定性门禁或 `StorageAdapter` 边界。
- 所有状态推进由服务端可信 DB 数据决定，客户端只触发开始/停止和显示服务端状态。
- Director 继续使用项目原生 Pi `Agent + JsonlSessionRepo`，不引入 Skills/Extensions。
- Gemini Key 校验与 Vision 使用官方 OpenAI-compatible 通路；Director 的 Pi
  tool-calling 会话使用 `pi-ai` 已有的原生 `google-generative-ai` API，以完整
  保留 Gemini 3 函数调用要求的 thought signature，不增加运行时依赖。
- Key 只允许进入 SQLite `settings` 或被 Git 忽略的 `.env.local`，不得返回客户端、写日志或提交。

## Architecture

### 1. Project autopilot and DAG advancement

`projects.autopilot` 是项目级持久开关。`advancePipeline(projectId, completedNodeId)` 只在开关开启时读取 `canvas_edges`，对每个出边候选检查：

1. 候选仍为 `idle`；
2. 候选所有入边上游均为 `success`；
3. `shot-codegen` 交给 `enqueueRenderShot`，其余带可信 stage 的节点交给 `enqueueDirectorStage`；
4. 单个候选失败只记录自身错误，不阻断其它分支。

Director 与 render handler 都在节点成功落库后调用该服务。`POST /api/director/pipeline` 开启 autopilot 并扫描当前可执行前沿；`DELETE` 只关闭后续推进，不杀死已经入队的作业。

### 2. Real StepFun audio

`features/audio` 新增独立客户端与 repository：

- TTS：`POST {stepfunBaseUrl}/audio/speech`，使用 `getStepfunConfig().ttsModel`、`return_url=true`、`timestamp=true`。下载返回的音频字节，经 `StorageAdapter.put()` 落盘，登记 `voiceover-audio`；原生字幕时间戳以 `voiceover-metadata` JSON 产物登记。
- ASR：`POST {stepfunBaseUrl}/audio/asr/sse`，使用 `getStepfunConfig().asrModel`，发送本地音频的 Base64，解析 `transcript.text.done`，登记真实转写。
- 字幕：时间轴只采用 TTS 原生 `start_time/end_time`；ASR 文本用于核验与报告。若没有原生时间戳，阶段显式失败，不按字符数伪造时间。

Director 的 `shot-sfx` 成功提交阶段文本后生成配音；下游 `shot-subtitle` 读取同 lane 的真实配音和 metadata，执行 ASR 并登记 `subtitle-track`。副作用通过单独的 stage-effect 端口注入 runner，不把音频逻辑塞进 prompt builder 或 DB repository。

### 3. Vision QA enhancement

规则 QA 保持原样。新的 Vision QA：

- 复用 `captureThumbnails` 的 25%/60%/95% 缩略图；
- 把图片 data URL、shot contract、`mustShow/mustAvoid` 发送给配置的视觉 provider；
- 模型只返回 Zod 可解析的结构化报告；
- 报告经 `StorageAdapter` 落盘并登记 `qa-vision-report`；
- `shot-qa` 的最终可见状态同时保留规则结果和模型报告，任一硬门禁失败即不通过。

在 Gemini 路由落地前，issue-12 使用 StepFun `visionModel`；路由落地后，`shot-qa` 默认使用 Gemini，但仍可在设置页改回 StepFun。

### 4. In-session artifact gate retry

runner 把“run → prepare → write”抽成有界循环。仅捕获 `ArtifactValidationError`：

- 初次失败后用同一个 `DirectorSession` 追加一次类型化反馈 prompt；
- 最多两次反馈（总共最多三次写入尝试）；
- 反馈逐条包含门禁错误，不包含 Key 或本机路径；
- 成功后只提交最后一版；
- 耗尽时抛出带“自动重试 2 次”和最后违规明细的新错误；
- 网络、schema、存储等其它错误立即失败，不进入循环。

FABRICATE 使用 `buildFabricateRetryPrompt()`；SHOT_SPEC 使用同构 `buildShotSpecRetryPrompt()`。

### 5. Gemini provider and node routes

新增通用 provider 配置层：

- Gemini 配置：Key、base URL、primary model、fast model，按 `settings > env > default` 解析。
- 官方默认：
  - base URL：`https://generativelanguage.googleapis.com/v1beta/openai/`
  - primary：`gemini-3.6-flash`
  - fast：`gemini-3.1-flash-lite`
- 节点 route 保存为 settings JSON，结构为 `{ nodeType: { provider, model } }`，经 Zod 严格校验。
- 无显式 route 时：若 Gemini Key 可用，则轻量节点使用 fast、复杂代码/镜头/视觉节点使用 primary；否则回退现有 StepFun chat model，避免破坏仅配置 StepFun 的用户。
- Pi session 按服务端可信 `nodeType` 构造对应 provider/model；Key 由 runtime 闭包提供，不写入 model 对象或 session JSONL。
- Google 新模型不发送 `temperature/top_p/top_k`；Pi 的 Gemini model 使用原生
  `google-generative-ai` API 并标记 `reasoning: true`，让工具调用往返保留
  thought signature。StepFun 继续使用 OpenAI Completions API。

音频边界不随 route 改变：TTS/ASR 始终读取 StepFun 配置；`shot-sfx`/`shot-subtitle` 的 Director 文本规划仍可选 Gemini，但实体音频调用保持 StepFun。

### 6. Settings UI

设置页分为：

- StepFun：Key、端点、Chat/TTS/ASR/Vision 模型；
- Gemini：Key、官方端点、Primary/Fast 模型；
- 节点模型路由：每个 `CanvasNodeType` 使用已登记的 `SegmentedControl` 选择 provider，使用 `TextField` 编辑模型名；
- 明确说明 TTS/ASR 固定走 StepFun，节点 route 控制 Director/视觉推理；
- 每项展示真实生效值和来源，不用静态“已配置”假状态。

## Error handling

- Pipeline API：400 输入错误、404 项目/入口不存在、409 状态冲突；响应返回真实 `autopilot` 和入队数量。
- TTS/ASR/Vision：响应先检查 HTTP，再经 Zod 解析；错误只记录 provider、状态码、模型名，不记录 Key 或完整音频。
- 音频/报告文件若 artifact 索引失败，删除已写 storage key。
- stage effect 失败沿用 runner 的 `running → failed + recordStageError`；下游自动推进自然停止。
- autopilot 推进单节点入队失败按节点记录错误，其余已满足依赖的分支继续。

## Verification

- 每个新行为先写失败测试并确认 RED，再实现到 GREEN。
- issue 阶段退出门禁：聚焦测试 + `lint` + `tsc` + 全量 `test` + `build`，然后只提交该 issue 范围。
- Gemini 退出门禁：配置优先级、Key 校验、node route、Pi runtime、设置 API/UI 测试。
- 真实端测：官方模型 retrieve、Gemini primary/fast 最小调用、StepFun TTS/ASR、创建项目后一键启动、失败门禁反馈、浏览器设置页和画布状态。
- 最终额外扫描 U+FFFD、Key 字面量、未跟踪 `.env*`、`process.env` 散点读取和提交范围。

## Official API decisions

- Gemini OpenAI compatibility:
  <https://ai.google.dev/gemini-api/docs/openai>
- Gemini 3.6 Flash / 3.1 Flash-Lite model status:
  <https://ai.google.dev/gemini-api/docs/models>
- StepFun TTS speech + native timestamps:
  <https://platform.stepfun.com/docs/zh/api-reference/audio/create-audio>
- StepFun ASR HTTP/SSE:
  <https://platform.stepfun.com/docs/zh/api-reference/audio/asr-sse>

## Self-review

- 无 TBD/TODO；所有 provider、模型、数据源、失败语义与持久化位置均已确定。
- 不改变用户要求的 StepFun TTS；Gemini 是新增 provider，不是覆盖 StepFun。
- issue-12 文档原先把 ASR描述为词级时间轴来源，但当前官方 `stepaudio-2.5-asr` SSE 只返回真实转写。设计使用 TTS 原生词级时间戳并让 ASR承担真实核验，避免伪造。
- 施工拆为四个可独立验证提交：issue-11、issue-12、issue-13、Gemini routing；符合串行文件冲突约束。
