# CodeVideoCanvas 重构蓝图 v3 · 第一册：现状分析与方案裁定

> 状态：Accepted
> 核验日期：2026-07-24
> 核验对象：本地 CodeVideoCanvas、PurpleInk `penguin`/`firenze` 分支、
> Trigger.dev、Pi Agent、HyperFrames 当前机制
> 关键修订：保留 Pi Agent；旧 v2 的 Agents SDK 迁移结论作废

---

## 1. 执行摘要：五问五答

### Q1：为什么不能只修几个 Bug？

当前最明显的问题虽然表现为 Tool 产物丢失、渲染合同检查太晚、UI 状态不真实，
但根因是同一条管线里同时混入了四种职责：

1. Canvas DAG 既描述产品流程，又被当成调度器；
2. Director 既调用模型，又执行服务任务和写业务状态；
3. Render 既负责像素渲染，又反向决定 Director 的阶段成功；
4. 进程内 queue/SSE 既承担调度，又承担实时状态和恢复。

继续在现有结构上补丁式修复，会让 Postgres、Trigger 和 HyperFrames 接入时保留
旧抽象，再叠一层新抽象。全量重构是必要的，但必须采用“替换旧职责”而非“增加
新职责”的方式。

### Q2：保留 Pi Agent 是否会阻碍未来合并？

不会。真正需要跨项目统一的是：

- 输入/输出 DTO；
- 模型任务分类；
- provider/model 选择规则；
- fingerprint、attempt 与 artifact 协议；
- compiler、bundle 和 render receipt。

Pi Agent 只存在于 `PiStructuredRunner` 内部。PurpleInk 未来即使采用其他 Agent
Runtime，也可以实现同一个 `StructuredModelPort`。因此“技术栈统一”修订为：

> **业务合同统一，Agent Runtime 允许实现差异。**

这比为了名称一致而迁移 SDK 更稳定，也更符合 PurpleInk 当前源码实际情况——其
Agents SDK 仍主要存在于设计文档，不是可直接复用的生产实现。

### Q3：Trigger.dev 会不会把工作流弄得更复杂？

只要不按 Canvas 节点一一创建 task，就不会。目标仅保留七类稳定任务：

1. `pipeline-run`
2. `project-plan`
3. `shot-generate`
4. `shot-media`
5. `shot-render`
6. `shot-qa`
7. `project-compose`

normalize、gate、compile、artifact commit 是 task 内函数。Trigger 替换自建 queue、
retry、并发、取消与 Realtime，不再复制一套调度基础设施。

### Q4：如何同时支持完整 HTML、分段代码和前端可视化？

把“模型原始回复”和“可执行产物”分开：

```text
原始回复 / 导入文本
  → browser-safe extractor（前端预览）
  → authoritative normalizer（服务端复验）
  → ShotSourcePackageV1
  → 安全/确定性门禁
  → video-compiler
  → CvcCompositionBundleV1
  → RenderableBundleDescriptorV1
```

完整 HTML、单个 code fence、四段 legacy fence 都只是 compatibility input。
Canonical 结构始终是显式字段。前端允许用户看见提取结果并修正映射，但不能跳过
服务端复验。

### Q5：未来与 PurpleInk 合并，究竟合并什么？

第一阶段不合并应用、数据库全集、Agent Runtime 或两个项目各自的 compiler bundle，
只对齐稳定的跨项目合同：

- `DirectorInputV1` / `LaunchVideoPlanV1` 适配；
- `RenderableBundleDescriptorV1`；
- `RenderTaskV1` / `RenderReceiptV1`；
- artifact provenance、hash、attempt fencing；
- HyperFrames 质量门序列。

`ShotSourcePackageV1` 与 `CvcCompositionBundleV1` 是 CVC 本地合同；
PurpleInk 的本地 bundle 命名为 `PurpleInkCompositionBundleV1`。二者不得因字段相似而
复用同一个类型名。

等两个项目都完成真实生产验证后，再决定共享 package 或仓库结构。

---

## 2. 事实核验表

| # | 已核验事实 | 对 v3 的影响 |
|---:|---|---|
| F01 | 当前主链路仍使用 SQLite/Drizzle | N1 必须是真正 async Postgres cutover |
| F02 | 当前 queue/stream 是进程内可变单例 | N2 完成后必须删除，不保留双调度 |
| F03 | Pi 包已在仓库，运行时代码真实 import | Pi 应移入 production dependencies |
| F04 | `DirectorSession.run()` 只返回 assistant 文本 | N0 先修 Tool 参数丢失 |
| F05 | `lastAssistantText()` 丢弃 `toolCall` block | 结构化提交不能依赖最终文本 |
| F06 | Provider/model 构造与节点类型耦合 | N3 改为 `AiTaskKind → ModelPolicy` |
| F07 | Vision QA 直接构造 OpenAI-compatible client | N3 统一到 Pi/provider registry |
| F08 | 当前 Zod 已为 4.x | 删除“Zod 3→4”迁移任务 |
| F09 | 当前 DB 只有项目/节点/边/作业/产物/设置六类核心表 | PG schema 应保持最小，不复制 PurpleInk 全域 |
| F10 | 本地 SQLite 存在历史项目和产物指针 | 必须备份并提供显式 importer |
| F11 | 多个 repository 使用同步 `.get/.all/.run` | PG 工期不能按简单驱动替换估算 |
| F12 | FABRICATE 静态门禁早于 renderer，但运行时合同仍检查过晚 | N0/N4 分层补齐 |
| F13 | render 反向调用 director，director 又调用 render QA | N4/N5 必须切断循环依赖 |
| F14 | concat 在无 BGM 时会使用 `-an` | N5 必须做真实音轨验收 |
| F15 | UI 有固定缓存/进度或丢弃 API 结果 | N6 必须由 Snapshot/Realtime 驱动 |
| F16 | 非测试源码已有多个 300–500 行热点 | N6 必须包含文件拆分与边界检查 |
| F17 | `/playbook` 已登记现有视觉原语 | 新可视化组件必须先进入 Pencil |
| F18 | 当前 Pencil MCP 未打开文件时无法读取真源 | N6 开始前设置显式设计门禁 |
| F19 | Trigger `dev` 在本机运行 task 代码，但依赖 Cloud 控制面 | PRD 应写“本地开发优先”，不是完全离线 |
| F20 | Trigger 已提供 queue/retry/cancel/realtime | 删除自建 scheduler/SSE 计划 |
| F21 | Trigger raw idempotency key 默认是 run scope | 全局键必须显式创建并含 workflowVersion |
| F22 | Trigger tags 不自动继承 | 每个子任务显式携带 workspace/project/run/shot tags |
| F23 | Pi 0.81 已支持 Tool 参数验证、事件订阅和 `terminate` | 可用单一 terminal submit Tool |
| F24 | Pi 没有 provider-neutral 的最终 `outputType` | 应用层 Zod/语义门禁仍是权威 |
| F25 | HyperFrames 要求固定 root、声明式 timing、同步 paused timeline | compiler 必须拥有 shell 和时钟 |
| F26 | HyperFrames 管理逐帧 seek 和媒体播放 | 不长期保留第二套 `__CVC_RENDER__` 时钟 |
| F27 | PurpleInk `penguin` 已含 server/capture/render 原型 | 不能再称为纯 landing |
| F28 | PurpleInk `firenze` 已有 Postgres 复合键、receipt、版本化合同 | 可复用数据库约定 |
| F29 | Firenze 的 Trigger/Agents SDK 尚未真正落入主源码 | 不能把文档愿景当现成实现 |
| F30 | Firenze compiler 接受 schema plan，禁止任意 HTML/JS | 与 CVC compiler 只能共享 bundle/render 层 |
| F31 | Firenze 使用 npm workspace，CVC 使用 pnpm | 包管理器不是本轮合并前提 |
| F32 | Firenze 也存在超大 schema/service 文件 | 只迁合同，不复制文件组织 |

---

## 3. 十四域问题树

### 3.1 产品定位

- “本地优先/无服务器”与 Trigger Cloud、未来生产环境冲突；
- 登录虽不在本轮，但数据模型缺少 workspace 边界；
- 画布节点数量被误当成后端 task 数量。

### 3.2 任务权威

- 旧 Harness、Kiro tasks、known-issues 和 milestone 状态互相漂移；
- 完成勾选与真实代码/测试不一致；
- 没有新的唯一重构账本。

### 3.3 数据库

- SQLite 同步 API 深入领域 repository；
- ID、时间、JSON、约束与未来 Postgres 约定不一致；
- 缺少 run/attempt/receipt/workflowVersion。

### 3.4 编排

- queue、状态机、恢复、自动推进分别散落；
- Canvas DAG 与执行 DAG 耦合；
- 单例在 Next dev/build/多进程下有 split-brain 风险。

### 3.5 Agent

- Pi 返回值只暴露文本；
- Tool 的验证参数没有成为产物；
- session、模型路由、stream、provider factory 集中在单个大文件。

### 3.6 模型路由

- 当前按 `CanvasNodeType` 选择模型；
- direct OpenAI-compatible client 与 Pi 并存；
- UI 设置与真实调用 provider 缺少同一证据。

### 3.7 模型输出

- 自由文本、JSON、HTML、Tool args 混成一个通道；
- Markdown fence 与解释文字容易导致猜测式截取；
- partial code 没有基准 artifact 与字段边界。

### 3.8 产物

- 输入 hash、render key、实体 hash 容易混淆；
- artifact 可变性和 supersedes 关系不清；
- session log、业务 JSON、二进制媒体使用同一抽象。

### 3.9 编译

- 当前模型 HTML 直接接近 renderer；
- app-owned fps/duration/seed 仍可能被模型文本影响；
- 没有稳定的 `CvcCompositionBundleV1` 与跨项目
  `RenderableBundleDescriptorV1`。

### 3.10 渲染

- 自建 frame contract 与 HyperFrames 终态冲突；
- Chromium/FFmpeg/temp cleanup 边界分散；
- renderer 与 director 双向依赖。

### 3.11 音画合成

- TTS、字幕、SFX、BGM、concat 和 Final QA 尚未形成真实闭环；
- 无音轨时会输出静音视频；
- 缺少三轨/时长/非空帧统一验收。

### 3.12 UI

- 假进度、假缓存、假检测损害可信度；
- 模型 JSON/代码/Tool 轨迹没有结构化查看器；
- Inspector 业务职责过多且文件超限。

### 3.13 PurpleInk 迁移

- 两分支已经分叉，不能整支复制；
- Agent Runtime、compiler 输入形态并不相同；
- DB 合同有价值，但完整 SaaS 域过重。

### 3.14 工程治理

- 文件长度与职责规则没有自动化报告；
- 架构依赖方向靠文档自觉；
- 真实 AI、浏览器、渲染 E2E 的验证频率缺少分层预算。

---

## 4. 四种方案比较

| 方案 | 描述 | 优点 | 主要问题 | 结论 |
|---|---|---|---|---|
| A | 继续修 SQLite/queue/Pi/renderer | 改动最少 | 与生产和合并方向继续分叉 | 否决 |
| B | 完全照搬 Firenze，包括 Agents SDK 和完整 schema | 名义统一 | 复制未实现愿景和过重业务域；破坏 CVC 核心 | 否决 |
| C | **合同优先重构**：PG/Trigger/HF 对齐，Pi 通过端口保留 | 清晰、渐进、可验证 | 需要认真设计迁移桥 | **采用** |
| D | 直接合并两仓并一次性重写 | 最终目录一次到位 | 风险、回滚和验收不可控 | 否决 |

方案 C 的关键不是“折中”，而是把不需要统一的实现差异隔离在 adapter 后，把真正
影响长期迁移的合同提前统一。

---

## 5. AI 调用真值表

| `AiTaskKind` | 是否 Pi | 输入 | 唯一结构化输出 | 内容修复 | 服务端后置处理 |
|---|---:|---|---|---:|---|
| `project-plan` | 是 | 原始剧本、项目配置 | `ProjectPlanV1` | ≤2 | 稳定 shot ID、fan-out |
| `shot-spec` | 是 | shot 文本、全局方向 | `ShotSpecV1` | ≤2 | 时长/画幅/seed 补全 |
| `fabricate` | 是 | shot spec、资产清单 | `ShotSourcePackageV1` | ≤2 | normalize、gate、compile |
| `vision-qa` | 是 | contact sheet、合同 | `VisionQaReportV1` | ≤1 | 规则 QA 合并 |
| TTS/ASR | 否 | 文字/音频 | provider DTO | provider retry | manifest、时轴 |
| subtitle | 否 | 文字/时间码 | subtitle artifact | 无 | 格式/边界校验 |
| compile | 否 | source + render spec | bundle | 无 | hash/provenance |
| render | 否 | bundle | MP4/frames | transport retry | ffprobe/hash |
| compose | 否 | media manifests | final MP4 | transport retry | 三轨/时长验收 |

如果一个新模型需求无法归入四类，必须先证明它无法由确定性代码完成，再通过 ADR
扩展枚举；不得直接新建第五种调用路径。

---

## 6. 延迟与重试预算

预算用于发现异常，不是 SLA 承诺：

| 阶段 | 单项目标 | 并发 | 重试责任 |
|---|---:|---:|---|
| project-plan | 120s 内 | 1 | Trigger transport ≤3；内容修复 ≤2 |
| shot-generate | 180s/shot | AI queue 2 | spec/fabricate 分步 checkpoint |
| shot-media | 120s/shot | audio 2 | provider/Trigger transport |
| shot-render | 300s/shot | render 1→实测 2 | worker/CLI transport |
| shot-qa | 120s/shot | AI queue 2 | transport ≤3；内容修复 ≤1 |
| project-compose | 300s/project | compose 1 | FFmpeg/IO transport |

不得通过在多个层同时重试制造指数级费用。Trigger 只重试 transport/worker failure；
schema、门禁、语义错误在同一 task 内修复。

---

## 7. 主要风险与缓解

| 风险 | 缓解 |
|---|---|
| PG cutover 改动面大 | repository 逐域迁移；禁止 SQLite/PG 双写长期存在 |
| Trigger Cloud 无法访问本机数据 | dev 阶段本机执行；生产部署前必须外置 PG/ArtifactStore |
| Pi Tool 在不同 provider 上表现不一致 | N1 Spike；单 Tool；Zod 权威；无 Tool 时明确失败 |
| AI 生成代码存在执行风险 | 受控 fragments、静态安全门、CSP、断网 sandbox、编译器拥有 shell |
| HyperFrames 升级产生像素差异 | 精确 pin；bundle/compiler/workflowVersion 入 hash；golden frame |
| 旧项目丢失 | 备份、manifest、显式 importer、导入计数对账 |
| UI 再次出现假状态 | 每个字段写出 DTO 来源；无来源就显示未实现 |
| 文档再次漂移 | 新 Task Breakdown 唯一状态；旧账本冻结 |

---

## 8. 结论

v3 不是把现有系统“云化”，而是把当前混合职责拆成少数稳定边界：

- Postgres 管业务事实；
- Trigger 管执行；
- Pi 管四类模型判断；
- normalizer/compiler 管不可信代码到可信 bundle；
- HyperFrames 管帧；
- UI 只消费真实快照与安全轨迹。

任何后续设计只要破坏上述边界，就应先停下并修改 ADR，而不是继续写实现。
