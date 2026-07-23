# AI 开发 Harness —— 系统架构与协作规范总纲

> Created: 2026-07-23
> Updated: 2026-07-23
> Status: approved（作为 Demo 阶段实施的操作准绳；随执行推进持续修订）

## 0. 本文档的定位

本文档是 **CodeVideoCanvas 应用本身的开发方法论**，回答"我们怎么把这个软件系统造出来"。

它与 [`docs/video-director/`](../video-director/) 是两件完全不同的事，请勿混淆：

| | `docs/video-director/`（**参考语料库，非运行时依赖**） | 本 Harness（本文档 + task-breakdown） |
|---|---|---|
| 回答的问题 | 一段文字稿怎么变成一支短剧的方法论原型 | CodeVideoCanvas 这个 Next.js 应用怎么被造出来 |
| 消费者 | **开发期**的人类/AI，作为编写 CVC 原生代码时的参照文本；**应用运行时不读取此目录** | Codex / 人类工程师，在开发期执行 |
| 产出物 | 方法论文本 + schema 原型，供移植 | src/ 下的源代码、迁移、测试 |
| 已有成熟度 | v5.0，44 schema + 22 测试，独立版本化 | 本次新建 |

**关键纠正**：video-director **不作为 Pi Skill 在运行时挂载**。它的方法论（8 阶段流程、视觉法则、QA 闸门、能力适配器模式）被**移植（port）为 CVC 自己的原生 TypeScript 代码**（prompt 模板、Zod schema、Tool 实现、画布节点逻辑），成为我们工作流引擎自身的 Harness Engineering，不依赖任何外部技能包在运行时被解析加载。移植映射表见 §3.1。

配套文档：[任务拆解与验收清单](./2026-07-23-harness-task-breakdown.md)（Track/Task 卡片，含 Codex Goal 模式提示词模板）。

---

## 1. 背景

- PRD（[`2026-07-23-prd-code-video-canvas.md`](./2026-07-23-prd-code-video-canvas.md)）与架构设计（[`2026-07-23-platform-architecture-design.md`](../designs/2026-07-23-platform-architecture-design.md)）已确定产品范围与技术选型，但两者都停在"设计"层面，没有回答"施工顺序"和"每一步怎么判定做对了"。
- 项目引入 Codex 的 Goal 模式作为主力施工方式。Goal 模式的真实机制是：**一个 thread 一次只能挂一个持久目标（objective），Codex 在该目标下可以长时间自主运行、自己把工作拆解成一系列 Task 并逐一执行，全部完成后自己判断"目标达成"并调用 `update_goal(complete)`**；续接是一次性的（某轮没有工具调用就不会再自动触发）。这意味着：**Goal 的颗粒度应该对应一个 Track（一批相关 Task 的集合）**，而不是单个 Task；单个 Task 的颗粒度则要卡在"边界清晰、允许改动范围明确、完成条件可机器判定"，方便 Codex 在会话内部自主排序执行、不越界。详见 §9。
- 项目采用 **Pi Agent 架构**（`@earendil-works/pi-agent-core` + `pi-ai`）作为 `features/director` 的运行时底座，而不是自造一套 Agent 编排框架。这是本次规划中最大的架构决定，详见 §3。
- 产品的画布本质是一个**运行时动态生成拓扑的 DAG**，不是 Dify/Coze 那种人工手动拖拽连线的静态工作流。这个特性直接决定了 `features/canvas` 的数据模型和模块拆分方式，详见 §4。

## 2. 目标

1. 建立一套**三层节点体系**的清晰认知，防止"画布节点""技能内部步骤""开发任务卡"三个概念被混用（§4）。
2. 确定 Pi Agent 在本项目的落地方式：依赖哪个包、怎么挂 video-director 技能、怎么对接 StepFun、状态归属怎么划分（§3）。
3. 给出模块职责地图：每个 `features/*` 子域下该有哪些文件、每个文件的单一职责、对应哪些 API 路由（§5）。
4. 给出数据库现状核查结论与演进方案（§6）。
5. 给出环境变量契约与密钥使用边界（§7）。
6. 建立两级验收框架（Tier A 任务级 / Tier B 里程碑级），并定义"端到端"验收的责任边界（§8）。
7. 定义 Codex Goal 模式下任务卡的标准形态与协作协议（§9），具体卡片见配套的 task-breakdown 文档。

## 3. Harness Engineering —— 把 video-director 方法论编译成原生工作流节点

### 3.0 核心纠正：不加载 Skills，彻底移植

**上一版本的设计有原则性错误，此处纠正**：Pi 的 Skills 机制（`SKILL.md` + `--skill`/`SessionManager` 动态挂载）是为"通用交互式编码助手临时具备某个领域能力"设计的，服务对象是人类开发者在终端里跟一个通用 agent 对话。**我们不是在造这种通用 agent，我们是在造一个专用的工作流产品**。

因此本项目**不使用 Pi 的 Skills 加载机制，不在运行时挂载 `docs/video-director/` 作为 Skill 源**。正确做法是：把 video-director 的方法论（8 阶段流程、视觉法则、QA 三级闸门、能力适配器模式、shot-plan 合同）**移植（port）为我们自己的原生代码**——变成我们自己的 prompt 模板文件、我们自己的 Zod schema、我们自己的 Tool 实现、我们自己画布上的一等公民节点。

`docs/video-director/` 在移植完成后的角色是**参考语料库**（人类/AI 在编写 Track D 任务卡时对照阅读的方法论源文本与 44 个 schema 原型），**不是运行时依赖**。应用启动、运行、渲染的任何路径都不应该去读取或解析这个目录下的文件。

这样做的必然结果是：我们的实现是**强类型、可单测、与画布 DAG 深度耦合**的一等代码，而不是"运行时才解析一段 Markdown 提示词"——这就是"做出远超 Skills 版本的东西"的具体路径，不是一句口号。

### 3.1 移植映射表（video-director 语料 → CVC 原生代码）

| video-director 概念/工件 | 移植去向（CVC 原生代码） | 备注 |
|---|---|---|
| SKILL.md 的 8 阶段流程 | `features/director/pipeline.ts`（已按 PRD 6 阶段口径收敛，见 §6.5） | INIT 并入 INGEST 的会话初始化步骤；CALIBRATE 并入验收通道节点逻辑 |
| `master-plan.md` / `style-bible.md` 产出提示词 | `features/director/prompts/direct.ts`（新增，纯 TS 字符串模板 + 类型化插槽参数，不是运行时读取的 `.md` 文件） | DIRECT 阶段 Tool 的输入组装逻辑 |
| `shot-plan.json` schema（`docs/video-director/schemas/shot-plan.schema.json`） | `features/director/schemas/shot-plan.ts`（新增，手写 Zod schema，字段对照原 JSON Schema 逐一核对） | SHOT-SPEC 阶段 Tool 的输出校验；这是 fan-out 物化（Track C）的直接输入源 |
| `script-units.json` / `audio-manifest.json` / `audio-allocation.json` schema | `features/director/schemas/ingest.ts`（新增） | INGEST 阶段 Tool 输出校验 |
| 10 条正向视觉法则 + 11 种构图模式 enum | `features/director/schemas/shot-plan.ts` 内的 `composition.mode` enum 约束 + `features/render` 的能力适配器选型逻辑 | 视觉法则本身不是可校验的 schema 字段，作为 DIRECT/FABRICATE 阶段 prompt 模板里的固定指令文本移植，不是留在 `docs/` 里等运行时读取 |
| QA 三级闸门（Calibration/Block/Final） | **直接对应画布上的 `shot-qa` 通道节点**（§4.1 L1 层已定义）的原生校验逻辑：`features/render/qa-check.ts`（新增，几何/像素规则）+ 可选视觉模型调用 | 这是移植映射里最关键的一条：QA 闸门不是"技能包里的一个阶段"，它本身就是我们画布节点体系的一等成员 |
| 能力适配器模式（npm 包许可证/版本锁 + Remotion still 冒烟测试） | `features/render` 的能力适配器注册表模式（具体任务卡见 Track R），精神移植而非逐字照搬（我们用 Playwright+HTML 不用 Remotion，冒烟测试形式相应调整） | — |
| `capabilities.lock.json` | 精神对应：`features/render` 若引入新渲染能力包，需在对应任务卡的完成条件中显式核验许可证/版本锁，但不强制产出同名文件 | 按需在具体任务卡决定是否需要落一个实际的锁文件 |
| 不可绕过红线第 1 条（确定性 `f(frame)`） | `lib/determinism`（已有实现），已是我们自己的原生代码，无需移植，只需强化调用点（见 3.2） | — |

### 3.2 依赖选型（修正：仅作裸 tool-calling 循环引擎）

仍使用 **`@earendil-works/pi-agent-core`**（Agent runtime，tool calling + state management）+ **`pi-ai`**（底层多 Provider LLM 客户端），**但用途收窄**：只借用它的会话生命周期管理与工具调用循环机制，**不使用其 Skills/Extensions 加载体系**。`createAgentSession()` 拿到的会话只挂载 §3.1 表格中列出的、我们自己实现的 Tool（对应 Track D 的 `tools/` 目录），不传入任何 `--skill`/`skills` 相关配置。

仍不用 `@earendil-works/pi-coding-agent`（面向人类终端编码场景，默认工具集 `read/write/edit/bash` 与本项目场景不符）。

### 3.3 StepFun 接入方式（含未验证项）

`pi-ai` 支持注册自定义 OpenAI 兼容 Provider。StepFun 是 OpenAI 兼容端点，**理论上**可以直接注册为 `pi-ai` 的自定义 Provider，从而让 `pi-agent-core` 的 Agent runtime 直接调用 StepFun，不需要我们再写一层 `LlmAdapter` 转发。真实的密钥/Base URL/模型 ID 见根目录 `.env` 文件（AI 代理有权限查看，且在端到端测试期间被授权直接写入该文件的真实测试值，见 §7.4）。

**这一点尚未实测**，必须作为 Foundation Track 的第一张任务卡（Spike）验证。若验证失败（比如 `pi-ai` 的自定义 Provider 接口对接不上 StepFun 的某些非标准字段），退回方案是：保留现有 `features/ai/stepfun-adapter.ts` 作为独立的 `LlmAdapter`，`features/director` 内的非 Pi 部分（比如触发渲染、写产物）继续用现有适配器，只把"需要多轮工具调用的生成类任务"（分镜拆分、详细脚本撰写、HTML 代码生成）交给 Pi Agent 的 tool-calling 循环。

### 3.4 确定性红线的强制位置（不依赖模型自觉遵守）

`lib/determinism` 的 lint 守卫必须挂在"HTML 生成 Tool 返回结果之后、进入渲染队列之前"这个必经关卡上——这是我们自己的 Tool 实现内部的强制调用，不是靠 Skill 里的一句"不可绕过"文字指令约束模型。任何违规直接判定该次生成失败，Tool 返回结构化错误，让 Pi Agent 的 tool-calling 循环收到失败反馈后自行重试或升级为人工介入。

### 3.5 会话状态归属（已决策，不变）

Pi Agent 的会话是 JSONL 树文件格式，与项目现有"SQLite 为结构化数据唯一权威源"的原则不冲突，划分如下：

- Pi 会话 JSONL 文件 → 视为**二进制产物**，走 `StorageAdapter` 存本地文件系统（与 mp4/frames/audio 同等对待）。
- SQLite 只存**指向会话文件的指针 + 阶段/节点的状态枚举**（`artifacts` 表新增一种 `kind: 'pi-session'`，`canvas_nodes` 表记录该节点当前状态），不解析、不镜像会话内容到关系表。
- 任何"业务真相"（分镜内容、渲染产物路径、节点状态）必须落在 SQLite / StorageAdapter，Pi 会话文件只是可追溯的执行留痕，重放/调试用，绝不作为业务查询的数据源。

### 3.6 与 `features/director` 现有骨架的关系

现有 `pipeline.ts` 的 `AgentRunner` 接口需要替换为基于 Pi `AgentSession` 的具体实现（不是删除整个文件，是把接口签名对齐 Pi SDK 的 `createAgentSession()` 返回类型）。具体改动在 task-breakdown 的 Director Track 中逐张任务卡给出，且每张卡的 Tool 实现都必须能在 §3.1 移植映射表中找到对应行。

---

## 4. 三层节点体系（核心心智模型）

这是本项目里最容易被混淆的概念，必须先分清楚：

| 层级 | 节点是什么 | 数量级 | 消费者 | 对应代码位置 |
|---|---|---|---|---|
| **L1 画布节点** | 用户在 React Flow 画布上看到的实体：脚本提交、语义拆分、每个分镜的脚本/代码/音效/字幕/验收、配乐、合并导出 | 每项目：4 个全局节点 + N×5 个分镜通道节点（N=分镜数，可达数十） | 最终用户 | `features/canvas`、`src/lib/db/schema.ts` 的 `canvas_nodes`/`canvas_edges` 表 |
| **L2 技能内部节点** | video-director 8 阶段内部的子步骤（语义解读→recipe 选型→……→QA 抽样） | 每阶段 3~8 个子步骤 | Pi AgentSession 内部的 tool calls | `docs/video-director/` 内部（不在 `src/` 中体现） |
| **L3 开发任务节点** | 本 Harness 拆出来的、给 Codex 执行的任务卡 | 预计 40~60 张 | Codex（施工方） | `docs/specs/2026-07-23-harness-task-breakdown.md` |

三层是**同构但独立**的：L3 任务卡的边界应当**对齐** L1 节点边界（比如"实现分镜代码生成节点的渲染联动"天然是一张任务卡），但 L3 本身不产出视频，是在造"产出视频的机器"。

### 4.1 L1 画布拓扑结构（运行时动态生成，非人工手搭）

```
[脚本提交]（全局，单例）
    │
    ▼
[语义拆分分镜]（全局，单例；调用模型产出 N 个分镜）
    │
    │  fan-out：程序化物化 N 条并行"分镜通道"
    │
    ├──────────────┬──────────────┬ ... ┬──────────────┐
    │ 通道 shot-001 │ 通道 shot-002 │      │ 通道 shot-N  │
[分镜脚本]      [分镜脚本]              [分镜脚本]
    │ (依 §3.1 移植出的原生 prompt 模板撰写详细脚本，非运行时读取 skill 文本)
    ▼
[代码生成]  ← 每通道独立可预览 + 独立导出（对应设计稿「分镜详情页」）
    │
    ▼
[音效/配音]
    │
    ▼
[字幕]
    │
    ▼
[验收]（抽帧规则验收 / 视觉模型验收）
    │
    └──────────────┴──────────────┴ ... ┴──────────────┘
                   │ N 条通道全部验收完成后收敛
                   ▼
            [配乐]（全局单例；依赖 DIRECT 阶段产出的风格圣经）
                   │
                   ▼
            [合并导出]（全局单例；按序拼接各通道已渲染 mp4 + 全局音乐/转场）
```

**关键性质**：
1. 拓扑是**语义拆分节点跑完之后被程序化物化**的，用户不手动拖 N 个节点。`features/canvas` 需要一个显式的"fan-out 物化"操作。
2. 节点分两类，数据模型必须区分：**全局单例节点**（脚本提交/语义拆分/配乐/合并导出，每项目各 1 个）与**分镜通道节点**（脚本/代码/音效/字幕/验收，每项目 N×5 个，且互相之间和其余通道解耦，只能通过收敛点交汇）。
3. 每个分镜的"代码生成"节点自带独立预览+独立导出能力，不依赖全局配乐完成——这是 F5 定向重渲染和渲染性能友好的关键：渲染压力被拆成 N 个小任务，可并发、可按内容哈希缓存命中、可只重渲染改动的那一个；"合并导出"只做已渲染产物的顺序拼接（`ffmpeg concat`），不重新过一遍逐帧渲染。
4. 验收节点分两种实现路径：**抽帧规则验收**（几何/像素规则检查，零 token 成本、纯本地计算、确定性可重复）作为 Demo 阶段默认路径；**视觉模型验收**（调多模态模型，有成本、有网络依赖）作为 P1 可选增强。Tier A 任务级验收必须能够在不消耗 AI 配额的前提下重复跑，因此优先使用抽帧规则验收路径。
5. Demo 阶段**不精简**分镜通道节点数量——五个通道节点（脚本/代码/音效/字幕/验收）在数据模型和 UI 组件层面按完整形态设计，但音效/字幕节点的**生成逻辑**本身在 Demo 阶段允许是"节点已建、UI 已画、内部逻辑占位"，实际生成能力在 P1 任务卡中补齐（对齐 PRD 的 F10/F11/F14 优先级）。

### 4.2 画布交互范式：对标 Dify/Coze 的工作流画布，非静态图表

画布是一个**可平移（pan）、可缩放（zoom）、可在多页面间导航**的交互式工作流编辑器，交互体验对标 Dify/Coze 一类工作流平台的画布编辑器（不是 D3 那种静态数据可视化图表）：

- 平移/缩放：React Flow 原生支持，需保留默认的鼠标滚轮缩放 + 拖拽平移，不禁用。
- 多页面导航：画布本身是 `/canvas` 路由下的核心视图，但节点详情（分镜详情页 S4）、导出汇总（S5）是独立路由页面，用户从画布节点点击跳转，与 Dify/Coze"画布画大图、点节点看详情面板或跳转详情页"的模式一致。
- 节点选中态需要驱动右侧 Inspector 面板（S3 设计稿已定义），不是画布内联编辑所有字段。

### 4.3 画布性能约束

50 个分镜 × 5 个通道节点 = 250+ 节点同屏渲染是常见规模。React Flow 默认不做视口裁剪优化，必须显式处理：
- 开启 React Flow 的可视区域裁剪相关选项，避免离屏节点消耗渲染开销。
- 引入轻量自动布局算法计算通道节点的默认坐标，不能让用户对几十条通道手动摆位（依赖选型见 §5.7）。
- 通道分组需要在 UI 层可折叠/可批量操作（比如"重跑分镜 23 的全部通道"），这依赖 §6 中新增的 `laneKey` 字段。

---

## 5. 模块职责地图

延续 `docs/conventions/architecture-conventions.md` 的分层原则（`app → features → lib ← components/ui`），本节把该原则具体落到"每个文件该放什么、多大、暴露哪个 API 路由"上，这是本次规划里对"防止后期维护混乱"的核心回应。

### 5.1 总体规则（对齐 `coding-standards.md`，此处进一步收紧）

- 每个文件**只负责一件事**。一个文件里出现"既做数据校验又做业务编排又做 IO"是拆分信号。
- 单函数 ≤ 50 行（硬约束，来自现有规范）；单文件建议 ≤ 150 行（比 `page.tsx` 的 200/300 行上限更严，因为 `features/*` 文件不像页面文件天然有 JSX 撑体量）。
- 每个 `features/<domain>/` 目录下按"读 / 写 / 校验 / 类型 / 编排"拆文件，命名固定为 `queries.ts`（读）、`actions.ts`（写/mutation）、`schemas.ts`（Zod 校验）、`types.ts`（类型），领域特有的编排逻辑独立成具名文件（不要塞进 `actions.ts`），`index.ts` 只做受控的公共 API re-export（禁止 `export *`，防止内部实现细节泄漏给 `app/` 层）。
- **一个 API 路由 = 一个动作，不是一个节点实例**。即不会有 `app/api/nodes/[id]/route.ts` 这种按节点 ID 路由的设计，而是按"动作"归类：`app/api/canvas/fan-out/route.ts`（物化分镜通道）、`app/api/render/route.ts`（触发单镜渲染）、`app/api/director/stage/route.ts`（触发某阶段的 Pi 会话）。路由内部只做「解析请求 → 调用 features 函数 → 序列化响应」，不写业务逻辑，符合现有规范。

### 5.2 `features/canvas/`（画布 DAG 数据模型 + fan-out 物化）

| 文件 | 职责 | 备注 |
|---|---|---|
| `types.ts` | 节点类型taxonomy：全局单例类型（`script-import`/`shot-split`/`score`/`export`）+ 分镜通道类型（`shot-script`/`shot-codegen`/`shot-sfx`/`shot-subtitle`/`shot-qa`） | 替换现有的 `ingest/direct/shot-spec/shot/assemble/finalize`（那是"阶段"不是"节点类型"，命名需要重新设计，见 §6.2） |
| `schemas.ts` | 每种节点 `data` payload 的 Zod schema | 现有仅有 `createProjectSchema`，需要按节点类型逐一补 |
| `queries.ts` | 读：按项目取节点/边、按 `laneKey` 分组取通道 | 现有骨架已存在，扩展查询方法 |
| `actions.ts` | 写：单节点 CRUD、节点状态转移 | 不放 fan-out 批量物化逻辑（那是独立职责） |
| `fan-out.ts`（新增） | 给定语义拆分节点的输出（N 个分镜），批量物化 N×5 个通道节点 + 通道内部串行边 + 与全局收敛节点的边 | 单一职责：只做"拓扑生成"，不做渲染触发 |
| `layout.ts`（新增） | 自动布局：给定节点/边集合，计算默认坐标（dagre 或等价算法） | 独立文件，方便未来替换布局算法而不影响其余模块 |
| `status.ts`（新增） | 节点状态机转移 + 内容哈希比对（判断是否 stale，驱动 F5 定向重渲染） | 依赖 §6 新增的 `contentHash`/`status` 字段 |
| `index.ts` | 受控 re-export | — |

### 5.3 `features/director/`（Pi Agent 编排）

| 文件 | 职责 | 备注 |
|---|---|---|
| `pipeline.ts` | 阶段元数据（已存在，阶段命名对齐 §6.3 决策） | 移除现有空 `AgentRunner` 接口定义，改为从 `pi-session.ts` 导入 |
| `prompts/`（新增子目录） | §3.1 移植映射表中每个阶段的原生 prompt 模板（TS 字符串模板 + 类型化插槽参数），移植自 video-director 的方法论文本 | **不是**运行时读取 `docs/video-director/*.md`；这些文本被移植进代码后独立维护 |
| `schemas/`（新增子目录） | §3.1 移植映射表中每个阶段的输出 Zod schema（`shot-plan.ts`/`ingest.ts` 等），手写对照 `docs/video-director/schemas/*.json` 移植 | 移植完成后与原 JSON Schema 解耦独立演进，不再同步追更 |
| `pi-session.ts`（新增） | Pi `AgentSession` 工厂：接入 `pi-ai` Provider（StepFun）、注册 §3.1 移植出的自定义 Tool 列表 | 单一职责：只管"怎么起一个会话"；**不传入任何 Skills/Extensions 配置** |
| `tools/`（新增子目录） | 每个自定义 Tool 一个文件（`validate-shot-plan.ts`、`write-artifact.ts`、`trigger-render.ts` 等），内部调用 `schemas/` 做校验 | 每个 Tool 文件只做一件事：校验 + 落库/落盘，不做跨阶段编排 |
| `stage-runner.ts`（新增） | 编排一次"阶段运行"：起会话 → 跑到该阶段产出 → 落 SQLite/StorageAdapter → 更新画布节点状态 | 被 queue handler 调用；本文件是 `features/director` 唯一允许"跨模块编排"的地方 |

### 5.4 `features/render/`（渲染管线）

| 文件 | 职责 | 备注 |
|---|---|---|
| `renderer.ts` | 顶层接口（已存在，当前是 throw NotImplemented） | 改为编排 `frame-capture.ts`+`encode.ts`+`cache.ts`，本身不直接操作 Playwright/ffmpeg |
| `frame-capture.ts`（新增） | 单帧截图：加载 shot HTML → GSAP `seek(frame/fps)` → CDP 截图 | 最小可测试单元，Tier A 验收锚点 |
| `encode.ts`（新增） | 帧序列 → ffmpeg 编码 mp4 | 独立于截图逻辑，方便未来替换编码参数 |
| `cache.ts`（新增） | 内容哈希 → 渲染缓存查找/写入 | 依赖 §6 的 `contentHash` 字段，是 F5 的核心 |
| `concat.ts`（新增） | 终局合并导出：多个已渲染 mp4 按序 + 全局音乐/转场 → 终片 | 只做拼接，不重新逐帧渲染（对齐 §4.1 性能设计） |

### 5.5 `features/audio/`（字幕/配音/音效/配乐）

| 文件 | 职责 |
|---|---|
| `subtitle.ts` | 字幕生成/对齐 |
| `voiceover.ts` | 配音/声音克隆（对接 `STEPFUN_TTS_MODEL`） |
| `sfx.ts` | 音效生成 |
| `score.ts` | 配乐选型（全局节点，依赖风格圣经） |

每个文件只做"调 AI/合成 + 存产物"，不做画布状态更新（画布状态更新统一走 `features/canvas/status.ts`，避免状态写入点分散到到处都是）。

### 5.6 `components/ui/`、`components/icons/` 与 `/playbook`（唯一组件来源，强制约束）

这是本次修正新增的**强制约束**，直接回应"不要重复撰写冗余代码"的要求：

- **`docs/designs/canvas.pen` 是唯一的视觉真源**。该设计稿共 52 个顶层节点、其中 **30 个标记为 `reusable:true` 的可复用组件**（Button 系列/IconButton/SegmentedControl/TextField/TextArea/SearchField/Toggle/ProgressBar/StatusPill/Tooltip/Toast/Dialog/EmptyState/NavItem/TopBar/ProjectCard/ArtifactChip/Node 系列四种/QueueStatusBar/TimelineTrack/ContactSheetThumb/SettingsRow/SettingsGroup/Sidebar）。这 30 个组件**必须逐一通过 Pencil MCP 工具链（`mcp_pencil_*`）读取其结构与样式，一比一还原为 `src/components/ui/*.tsx` 或 `src/components/icons/*.tsx` 下的真实 React 组件**，禁止凭记忆/凭空实现替代读取。
- **`/playbook` 是唯一的组件登记处**。这 30 个组件港口完成后必须**逐一**在 `src/app/playbook/registry.ts` 登记 + 配 `*.demo.tsx`，作为"活文档"。
- **所有页面（S1~S6 及暗色镜像）实现时只能 `import` 这些已登记组件，禁止在页面文件内重复实现同类视觉原语**（比如 S3 画布页需要 StatusPill，就必须 `import` 已登记的 `StatusPill`，不能在画布组件文件内再手写一个视觉相同的 div 结构）。任务卡执行中若发现所需组件尚未移植，必须先补移植该组件到 `components/*` + 登记 `/playbook`，再在页面中 `import` 使用，不允许"页面里先临时糊一个、以后再抽取"。
- 这一约束新增独立 Track（见 task-breakdown 的 **Track P — Pencil 组件港口**），且**排在 Track U（页面实装）之前**，因为 U 的每张任务卡都依赖 P 已完成的组件。

### 5.7 依赖补全（新增第三方库）

现状核查（`package.json`）：设计稿全文规定图标统一用 `lucide-react`（见 `docs/designs/2026-07-23-design-system-inventory.md` §6），但该依赖当前**未安装**；画布自动布局所需的图布局库同样**未安装**。本次决策：

| 依赖 | 用途 | 归属 |
|---|---|---|
| `lucide-react` | 全部图标（Track P 组件港口 + 所有页面），白名单命名见设计系统清单 §6.3 | dependencies |
| `@dagrejs/dagre` | 画布自动布局（§4.3），选用 DagreJS 组织下持续维护的包名，而非已停止更新的旧 `dagre` 包 | dependencies |
| `@earendil-works/pi-agent-core` | Pi Agent runtime（§3.2） | dependencies（F0.1 验证后转正，若验证期先作 devDependency） |
| `@earendil-works/pi-ai` | Pi 底层 LLM 客户端（§3.2） | 同上 |
| `playwright` | 渲染管线（已在原 Track F0.6 规划） | dependencies |
| `ffmpeg-static` | 渲染编码（已在原 Track F0.6 规划） | dependencies |

安装动作归入 task-breakdown 对应任务卡的「允许改动范围」，本文档只定选型结论，不在此处直接改 `package.json`。

### 5.8 API 路由映射（`app/api/`）

| 路由 | 动作 | 调用的 features 函数 |
|---|---|---|
| `api/canvas/fan-out` | 物化分镜通道 | `features/canvas/fan-out.ts` |
| `api/canvas/nodes/[id]/status` | 查询/推进节点状态 | `features/canvas/status.ts` |
| `api/director/stage` | 触发一次阶段运行 | `features/director/stage-runner.ts` |
| `api/render` | 触发单镜渲染 | `features/render/renderer.ts` |
| `api/render/export` | 触发合并导出 | `features/render/concat.ts` |
| `api/projects` | 项目 CRUD（已存在） | `features/canvas/actions.ts`/`queries.ts` |
| `api/settings` | StepFun Key 等设置（已存在） | `features/ai/stepfun-adapter.ts` |

---

## 6. 数据库现状核查与演进方案

现状（已读取 `src/lib/db/schema.ts`）：`projects`/`canvas_nodes`/`canvas_edges`/`jobs`/`artifacts`/`settings` 六表已存在，基础骨架可用，但不足以支撑 §4 的 fan-out 通道模型。缺口与方案：

### 6.1 `canvas_nodes` 缺状态字段

新增 `status`（text，枚举 `idle|pending|running|success|failed|stale`，默认 `idle`）。用途：定向重渲染判断、UI 状态徽章。目前只能塞进 `data` JSON blob，查询效率差且无法索引，需提升为一等字段。

### 6.2 `canvas_nodes` 缺内容哈希

新增 `contentHash`（text，nullable）：节点自身输入内容的哈希（比如某分镜脚本文本的哈希）。用于判断"这个节点的输入变了没有"，是 F5 定向重渲染缓存命中率的前提。**注意**与 `artifacts.contentHash` 是两个不同的哈希：`artifacts.contentHash` 是产物内容的哈希，`canvas_nodes.contentHash` 是输入内容的哈希，二者对比才能判断"输入变了但产物还没更新"。

### 6.3 `canvas_nodes` 缺通道分组字段

新增 `laneKey`（text，nullable，如 `"S007"`）和 `laneRole`（text，nullable，如 `"shot-script"`/`"shot-codegen"`）。用途：UI 按分镜分组折叠展示、批量操作某个分镜的全部通道节点。全局单例节点这两个字段留空。

### 6.4 节点类型 taxonomy 重新设计

现有 `CanvasNodeType`（`ingest/direct/shot-spec/shot/assemble/finalize`）把"阶段"和"节点类型"混为一谈，需替换为 §5.2 定义的类型集合。这是一次破坏性变更，需要同步更新 `types.ts`/`schemas.ts` 及所有引用点，作为单独任务卡执行，不能和字段新增混在一次迁移里（保持每次 migration 单一职责，方便回滚定位）。

### 6.5 阶段命名统一（PRD vs video-director SKILL.md 的不一致）

- PRD §8：6 阶段（INGEST→DIRECT→SHOT-SPEC→FABRICATE→ASSEMBLE→FINALIZE）
- video-director SKILL.md v5.0：8 阶段（多了 INIT、CALIBRATE）
- 设计系统 token：7 个 `stage-*` 颜色

**决策**：CVC 应用层（`features/director/pipeline.ts` 的 `PipelineStage` 类型、UI 阶段徽章）统一采用 **PRD 的 6 阶段**口径。video-director 的 INIT 并入 INGEST 阶段的会话初始化步骤，CALIBRATE 并入 FABRICATE 阶段内部的一个 QA 检查点（对应 L2 层的子步骤，不在 L1/L3 单独建节点）。设计系统里多出的第 7 个 `stage-*` token，在 UI 实装任务卡中核查后删除或重新映射，不新增第 7 个阶段。

---

## 7. 环境变量契约

### 7.1 现状核查结论

当前 `.env` 文件内所有行均以 `#` 起始，**没有任何一行是生效的 `KEY=VALUE`**，因此 `process.env.STEPFUN_API_KEY` 等目前读不到任何值。此外，代码中 `stepfun-adapter.ts` 的默认模型 `step-2-mini` 不在账号可用模型列表内，默认 base URL 是否需要 `step_plan` 变体路径存疑。这两点作为 Foundation Track 的验证任务处理，本文档不擅自改代码，只定契约。

### 7.2 两条密钥路径（不冲突，服务不同场景）

- **生产行为**（面向最终用户）：用户在「设置」页填入自己的 StepFun Key → 写入本地 SQLite `settings` 表 → 服务端读取。这是产品既定设计，不变。
- **开发/测试行为**（面向本项目开发期）：`.env.local` 提供一份种子 Key，`LlmAdapter`（以及未来 Pi Provider 配置）读取优先级为 **SQLite `settings` 表 > 环境变量**，即用户一旦在 UI 里配置过 Key，环境变量种子值自动失效。这样开发时不必每次都走 UI 填key，Tier B 里程碑验收时也可以直接做真实 AI 调用的端到端烟测。

### 7.3 变量清单（已通过 Foundation Spike 验证）

```
STEPFUN_API_KEY=            # 开发期种子 Key；生产路径走设置页写 SQLite，不用此变量
STEPFUN_BASE_URL=https://api.stepfun.com/v1 # 默认 API 基础端点（已验证，非 step_plan 变体）
STEPFUN_CHAT_MODEL=step-3.5-flash # 文本生成模型（已验证，可选择 step-3.5-flash / step-3.7-flash）
STEPFUN_TTS_MODEL=stepaudio-2.5-tts # 配音/声音克隆模型
STEPFUN_ASR_MODEL=stepaudio-2.5-asr # 语音转写模型
STEPFUN_VISION_MODEL=step-1.5v    # 视觉模型验收节点（多模态，P1 可选增强）
```

### 7.4 授权与安全边界

用户已明确授权：**允许查看且允许直接写入 `.env`/`.env.local` 等本地环境变量文件，用于本地开发与端到端验证（包括真实调用 StepFun API）**。即 Foundation Track 与 Tier B 里程碑验收执行期间，AI 代理可以把核实过的真实密钥/Base URL/模型 ID **直接写入 `.env`**，不需要每次都停下来找人工代填。此授权范围仅限于：

- 本地开发调试、Tier B 里程碑级端到端验证（含真实调用 StepFun API）
- **不**允许把密钥原文写入任何**会被提交到版本库**的文件、文档、commit message、日志输出、对话回复正文
- 任何时候在回复/文档中引用密钥时，只写变量名（如 `STEPFUN_API_KEY`），不回显原始值
- `.env`/`.env.local` 已在 `.gitignore` 中排除，保持不变；写入 `.env` 后需人工确认该文件确实未被 `git add`/追踪
- 写入前优先核实变量名/取值是否与账号真实可用配置一致（见 §7.1 已发现的默认模型不一致问题），不要臆造占位值当作真实值写入

---

## 8. 两级验收框架

### 8.1 Tier A —— 任务级验收（每张 L3 任务卡自带，轻量、机器可判定）

- `pnpm lint` 与 `pnpm tsc --noEmit` 退出码 0
- 新增/修改逻辑必须有对应单元测试覆盖（不要求全量回归，只覆盖本任务新增面）
- 涉及 shot 渲染代码路径的改动，`lib/determinism` 的规则扫描必须零违规
- 未越界修改任务卡"允许改动范围"之外的文件（`git diff --stat` 核对）
- 若执行中发现现有规范文档（`docs/conventions/*`、`AGENTS.md` 等）有缺口或过时内容，任务卡完成汇报中必须**提出修订建议**，不允许任务执行者自行改动规范文档

### 8.2 Tier B —— 里程碑级验收（若干 Task 组成一个 Track，Track 完成后触发，较重）

- 全量 `pnpm lint && pnpm tsc --noEmit && pnpm build` 三连绿
- Codex 自主执行**功能性端到端集成测试**：验证链路跑通、产物存在、格式正确（例如"提交脚本 → 拆分出分镜 → 单镜渲染出一个真实 mp4 文件"）。涉及真实 AI 调用的验证，使用 §7 的开发期种子 Key，但控制调用频次（每个里程碑跑一次真实调用而非每个任务卡都跑，避免消耗配额、引入不确定性）
- 确定性守卫扫描：对该里程碑新增的全部 shot 渲染相关代码路径做一次完整扫描
- 若里程碑内新增了可复用 UI 组件，核查是否已在 `src/app/playbook/registry.ts` 登记 + 配 `*.demo.tsx`
- 产出一份里程碑报告（追加进 `docs/updates/`），记录本里程碑完成的任务卡范围、发现的规范缺口、遗留问题

### 8.3 人工验收（不自动化，明确排除在 Tier A/B 之外）

**视觉/内容质量层面的端到端验收**——流程跑通之后，产物"好不好看""分镜内容是否贴合原意""转场是否自然"——这类主观判断由人工完成，Harness 不会、也不应该尝试自动化它。Tier A/B 只保证"机器能验证的正确性"（跑得通、格式对、无确定性违规、无回归），不保证"效果好"。

---

## 9. Codex Goal 模式协作协议

### 9.1 任务卡与 Goal 生命周期的对应关系

### 9.0 核心纠正：Goal 是长时会话的持久目标，Task 是会话内部的施工单元

**上一版本把"一张任务卡"等同于"一次 Goal 生命周期"，这是对 Goal 机制粒度的误解，此处纠正**：

- Codex Goal 的真实运作方式是**一个 Goal 对应一段可以长时间自主运行的会话**（可以是几十分钟到数小时，跨越很多次工具调用）。Codex 拿到 Goal 的 objective 后，**自己在会话内部把工作拆解成一系列 Task 并顺序/按需执行**，自己判断每个 Task 是否完成，全部完成、objective 达成后才调用 `update_goal(complete)`。
- 因此**本 Harness 里 Track（或 Track 内的一组任务卡）对应一次 Goal**；Track 内逐张列出的任务卡是**Task**——即 Codex 在这一次 Goal 会话内部要按序处理的施工单元清单，不是分别启动多次 `/goal` 的对象。
- 之前 task-breakdown 文档中每张任务卡下"Goal 提示词"这一标签是**误用**，已更正为「**Task 规格**」：它描述的是一个 Task 的目标、允许改动范围、完成条件，供 Codex 在 Goal 会话内部执行到该 Task 时参照，不是独立的 `/goal` 调用参数。
- 单个 Track 内的 Task 依赖关系仍必须是**单向 DAG**，理由不变：即便同属一个 Goal 会话，Codex 仍需要清楚的执行顺序与边界，防止在会话内部越界或前后矛盾地修改同一文件。

### 9.1 Goal 与 Track 的对应关系

- **一次 Goal = 一个 Track（或一个 Track 内经人工分割的一段）**。启动 Goal 时给 Codex 的 objective 是"完成 Track X 的全部/某几个 Task"，而不是单个 Task 的目标。
- Track 内的**每张任务卡是一个 Task**：Task 之间的顺序、允许改动范围、完成条件仍按原有卡片格式逐一列出（task-breakdown 文档保持现有卡片结构，只是标签从"Goal 提示词"改为"Task 规格"）。
- Codex 在 Goal 会话执行期间，应当依次处理该 Track 下的 Task 列表，每完成一个 Task 就在 task-breakdown 文档中就地勾选状态（`☐→☑`），全部 Task 完成后再判定该 Goal 是否达成 objective、是否可以 `update_goal(complete)`。
- 若某个 Track 的 Task 数量过多、预计单次会话跨度过长（比如 Track U 的 8 个 Task），允许人工把该 Track 拆成多个 Goal 顺序启动（如"Goal 1：完成 U1.1~U1.4"、"Goal 2：完成 U1.5~U1.8"），拆分方式记录在该 Track 的 Goal 启动提示词中（§9.3）。

### 9.2 严格范围限制（防止越界施工）

每张任务卡（Task）必须显式声明：

- **前置任务**：本 Task 执行前必须已完成的 Task ID 列表（未完成则 Codex 不应开始）
- **允许改动范围**：具体文件/目录路径清单
- **禁止改动 / 越界红线**：不能碰的目录（尤其是别的 Track 正在进行中的文件）+ 项目级红线（确定性规则、密钥泄露等）
- **后置任务**：本 Task 产出被哪些后续 Task 消费，帮助 Codex 理解"为什么不能自己顺手把后面的活也干了"

### 9.3 Task 规格标准模板 + Goal 启动提示词模板

具体每个 Task 的规格见 task-breakdown 文档，统一遵循以下结构（这是**会话内部的施工单元说明**，不是独立的 `/goal` 调用）：

```
目标：<一句话，可判定完成>

前置任务（必须已完成）：<Task ID 列表，或"无">

允许改动范围：
- <path>
- <path>

禁止改动：
- <path 或规则>

完成条件（全部满足才视为该 Task 完成）：
- [ ] ...
- [ ] ...

不在本任务范围内（不要做，留给后续 Task）：
- ...
```

每个 **Track** 启动时，人工对 Codex 下达的 **Goal 提示词**统一遵循以下结构（这才是真正交给 `/goal` 的 objective）：

```
Goal：完成 <Track 名> 的全部 Task（<Task ID 范围>），依据
docs/specs/2026-07-23-harness-task-breakdown.md 中 Track <X> 章节逐一执行。

执行要求：
- 严格按 Task 编号顺序执行，每个 Task 完成后在该文档中把状态由 ☐ 改为 ☑
- 每个 Task 的允许改动范围、禁止改动、完成条件以文档中对应 Task 规格为准
- 全部 Task 完成后，运行 Tier A 验收（pnpm lint && pnpm tsc --noEmit，及各 Task
  要求的单测），确认无误后再判定本 Goal 完成
- 若某个 Task 执行中发现前置假设有误（如依赖的前置 Task 产出不符合预期），
  停止并汇报，不要跳过验证强行继续

完成条件（达成后才可 update_goal(complete)）：
- [ ] Track 内全部 Task 状态已勾选为 ☑
- [ ] pnpm lint / pnpm tsc --noEmit 通过
- [ ] 本 Track 要求的 Tier B 里程碑验收项（见 §8.2）已完成
```

### 9.4 Track 完成后的衔接方式

一次 Goal（对应一个 Track 或其中一段）被 Codex 判定 complete 后，人工确认 Tier A/Tier B 验收通过，再对下一个 Track 启动新的 Goal。Track 之间若无交叉依赖，可以对不同 Track 同时启动多个独立的 Goal 会话并行推进（不同 thread）。

---

## 10. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| Pi Agent 与 StepFun 的自定义 Provider 对接方式未经实测 | 整个 Director Track 的地基不稳 | Foundation Track 第一张任务卡即为该 Spike，若不通过启用退回方案（§3.3） |
| `.env` 当前无生效变量、默认模型/base URL 与账号实际可用列表不符 | AI 调用在验证前会直接失败 | Foundation Track 任务卡显式验证并修正；端到端测试期间已授权直接写入真实值（§7.4） |
| video-director 移植映射（§3.1）若有字段遗漏，会导致生成质量低于原技能包水平 | 移植是"做出远超 Skills 版本的东西"的关键前提，遗漏会适得其反 | 每张 Track D 任务卡执行前必须对照 §3.1 表格逐项核对，不得跳过任何一行 |
| 阶段命名三处不一致若不统一，后续 UI/AI prompt/代码会互相打不上 | 返工成本高 | §6.5 已给出统一口径，作为后续所有任务卡的强制前提 |
| 250+ 节点同屏渲染的性能问题若不提前处理，画布 Track 完成后才发现会导致大范围重构 | 返工成本高 | §4.3 已列为独立任务卡，排在画布 Track 早期 |
| Pencil MCP 移植 30 个组件时若跳过而直接手写，会导致视觉与设计稿逐渐漂移、页面间重复实现 | 违反 SSOT，后期返工成本高 | §5.6 强制约束 + Track P 排在 Track U 之前，U 的完成条件显式要求"只 import 不重写" |
| Goal 模式任务卡粒度把握不准（过粗或过细） | 过粗导致模型中途误判完成、过细导致协作效率低 | 按 §9.1 的颗粒度基准执行，执行过程中如发现某张卡明显不合适，允许在该 Track 内临时拆分/合并，但需记录进里程碑报告 |

---

## 11. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-07-23 | 初版发布，与配套的 task-breakdown 文档一并作为 Demo 阶段的操作准绳 |
| 2026-07-23（修订） | **架构纠正**：video-director 不再作为 Pi Skill 运行时挂载，改为移植进原生代码（新增 §3.0/§3.1 移植映射表，§3 全面重写）；新增 §4.2 画布交互范式对标 Dify/Coze；新增 §5.6 Pencil MCP 组件港口强制约束 + `/playbook` 唯一登记处规则；新增 §5.7 依赖补全（`lucide-react`/`@dagrejs/dagre`）；§7.4 授权范围扩大为允许直接写入 `.env` 真实测试值 |
