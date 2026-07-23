# CodeVideoCanvas 平台架构设计

> Created: 2026-07-23
> Updated: 2026-07-23
> Status: accepted（demo 基线，已批准）

## 问题陈述

将 `docs/video-director/` 中的确定性视频编译方法论（语义分镜 → 分镜合同 → 逐镜代码视频 → 音画字幕 → 配乐转场 → 渲染导出）**移植为项目原生 TypeScript 能力**，形成类 AI 工作流的节点式 AIGC 短剧创作平台。该目录只在开发期作为参考语料，不作为运行时 Skill 或文件依赖；用户以自然语言驱动，画布上每个分镜对应一条可独立生成、渲染和修改的节点通道。

关键约束（来自需求讨论）：

- **无高配服务器**：渲染与处理放到运行者本机，不依赖服务器 CPU/内存。
- **Demo 优先、快速跑通**：先做能跑的最小闭环，不做登录、限流、安全加固、远程存储。
- **AI 统一走 StepFun（阶跃星辰）**：OpenAI 兼容端点，**用户自带 API Key**。
- **数据本地存储**。
- 视频渲染沿用 **HyperFrames 思想**：可搬运、自包含、位置无关的单文件 HTML 暴露 `window.__CVC_RENDER__@v1` 的 frame/fps seek 合同，不依赖工作区相对 `node_modules`/`docs` 资源；Chromium 页面池逐帧截图到磁盘序列 → FFmpeg 流式编码。

## 方案对比（浓缩关键决策）

| 决策点 | 候选 | 结论 | 理由 |
|---|---|---|---|
| 渲染基座 | Remotion / HyperFrames | **HyperFrames 特化** | 单文件/镜天然隔离、可定向重渲；配方级复用 |
| 语言栈 | Python / Go / Node | **全 Node/TS** | 与 Pi(TS)、Chromium 渲染同栈，零跨语言桥 |
| Agent | Pi / 自研 / Python 框架 | **`pi-agent-core Agent + JsonlSessionRepo + pi-ai`** | 只复用 tool-calling 与会话树；项目原生 `DirectorSession` 隔离 Pi 类型 |
| 运行位置 | 服务器 / 本机 | **本机** | 解决"无好服务器"，用运行者算力 |
| AI Key | 内置 / 代理 / 用户自带 | **用户自带** | 零服务器、不泄露、各付各费 |
| 存储 | Postgres+MinIO / SQLite+FS | **SQLite + 本地 FS** | 单机本地、零外部服务 |
| 工程结构 | 多包 Monorepo / 单应用 | **标准全栈 Next.js 单应用**（本次调整） | 取消团队分工，最快出 demo |

## 最终架构（Demo 基线）

### 形态

**Demo = 一个标准全栈 Next.js 应用，本地运行（`next dev` / `next start`）。** 服务端逻辑（AI 调用、编排、渲染）跑在运行者本机的 Next Node 进程里 → 直接用本机算力，无需任何服务器。

> **Electron 桌面打包推迟到分发阶段（Phase 2）**：它只是把同一个 Next 应用薄薄包一层壳对外分发；现在做 demo 不引入 Electron，以最快跑通。（若需 demo 从第一天就在 Electron 内运行，可随时调整。）

### 目录结构（标准全栈 Next.js）

```
src/
  app/
    (canvas)/            画布编辑器页面
    projects/            项目管理
    settings/            StepFun Key 等本地设置
    api/                 route handlers（渲染触发、作业状态、AI 代理如需）
    layout.tsx / globals.css
  features/
    canvas/              React Flow 节点图 + 节点类型
    director/            六阶段原生 prompt/schema/tool + DirectorSession（服务端）
    render/              HyperFrames 截帧循环 + ffmpeg 封装 + 作业运行器
    ai/                  StepFun LlmAdapter（服务端）
    audio/               配音 / SFX / BGM / 字幕（后续）
  lib/
    db/                  Drizzle + SQLite
    storage/             StorageAdapter（本地 FS）
    queue/               进程内持久队列（SQLite 支撑，可恢复）
    gsap/                GSAP↔seek 确定性桥
    determinism/         确定性 lint / 守卫
  components/ui/         纯展示组件
  server/                server-only 工具
```

- `src/app/` 只放路由与 API 入口；业务逻辑下沉 `src/features/`。
- 领域逻辑集中在 `features/*` 与 `lib/*`，未来抽包/上云是"搬运 + 加壳"，非重写。

### 数据流（运行时动态物化的三层 DAG）

```
[脚本导入] → [语义拆分]
                 ├─ 分镜 1：[脚本]→[代码]→[音效]→[字幕]→[验收] ─┐
                 ├─ 分镜 2：[脚本]→[代码]→[音效]→[字幕]→[验收] ─┼→ [配乐] → [合并导出]
                 └─ 分镜 N：[脚本]→[代码]→[音效]→[字幕]→[验收] ─┘
```

语义拆分完成后程序化 fan-out 出 N×5 个通道节点，用户不手工连线。应用层 Agent 阶段统一为 INGEST/DIRECT/SHOT-SPEC/FABRICATE/ASSEMBLE/FINALIZE；video-director 的 INIT 并入 INGEST，CALIBRATE 并入 FABRICATE 内部 QA。每个 `shot-codegen` 节点单向对应一份可独立渲染的 HTML。

- **项目创建边界**：项目记录与 `script-import → shot-split`、`score → export`
  四个全局节点必须在同一 SQLite 事务创建。projects API 返回服务端确认的
  `ingestNodeId`，客户端不得猜测节点 ID，也不得留下只有 project、没有执行
  入口的半成品画布。

- **Node UI 合同**：`features/canvas/types.ts` 是客户端与服务端共享的唯一
  节点类型来源，统一导出九种 `CanvasNodeType` 与六态 `NodeStatus`
  （`idle|pending|running|success|failed|stale`）。UI 不复制状态枚举，也不把
  Agent 的 `PipelineStage` 当作画布节点类型；视觉阶段色由 `CanvasNodeType`
  显式映射。
- **执行阶段合同**：节点类型与 Director stage 分字段保存；fan-out 在创建
  `shot-script/codegen/sfx/subtitle/qa` 时分别写入
  `SHOT_SPEC/FABRICATE/ASSEMBLE/ASSEMBLE/FINALIZE`。画布 Inspector 只消费
  服务端读模型中的 stage，不在浏览器推导。

### 渲染执行（本机、服务端）

- 服务端用 Playwright（自带 Chromium）加载 shot HTML；每个 page 串行 seek、有限 page 池有界并发，PNG 落隔离临时目录后由 `ffmpeg-static` 流式编码，避免全片帧 Buffer 常驻内存。
- Render repository 负责持久输入与 artifact 顺序；renderer/export service 是可信编排层。API 不拼路径、不查 artifact 表，Director/Render handler 由同一 `instrumentation.ts` 注册后启动单例队列。queue/runner 模块导入保持无 SQLite 副作用，默认 repository 只在真实 enqueue/handler 执行时延迟创建。
- 渲染作业走**进程内队列**（状态持久化到 SQLite，崩溃可恢复），有界并发（≈本机核数），内容哈希缓存 → 只重渲变化节点。

### 存储

- **SQLite（Drizzle）**：项目 / 画布图 / 节点参数 / 作业 / 产物索引。
- **本地文件系统**：mp4 / 帧 / 音频（经 StorageAdapter，未来可换对象存储）。
- **Agent 会话 JSONL**：`StorageAdapter.localPath('pi-sessions')` 分配受控根目录，`DirectorSessionStore` 在该根内封装 `JsonlSessionRepo + NodeExecutionEnv`；SQLite 仅保存相对 `storageKey` 指针（`artifacts.kind='pi-session'`）。
- **Director 可恢复输入**：节点的阶段输入持久化在 `canvas_nodes.data.directorInput`，由 `stage-prompt.ts` 路由到六个原生 prompt builder；Director repository 读取上下文与登记 artifact，stage runner 不直接操作 Drizzle。
- **产物提交协议**：Agent 只获得只读诊断 Tool；`write-artifact.ts` 是 stage runner 专用应用服务，归属/路径来自可信上下文。写入端对同一内容复验后按“Storage → SQLite 索引”提交，索引失败补偿删除文件。既有 Pi JSONL 仅登记受控相对指针。

### AI（StepFun）

- 服务端 `LlmAdapter` 指向 `https://api.stepfun.com/v1`（OpenAI 兼容）。
- 需要多轮 Tool 调用的 Director 阶段走 `pi-ai` 原生 StepFun Provider；F0.1 已真实验证 `Agent` 单轮调用与 JSONL 会话创建。
- 项目原生 `createDirectorSession({ projectId, nodeId, stage, resumeSessionKey? })` 负责 Agent 运行、消息事件持久化与恢复；不依赖 `pi-coding-agent`，不加载 Skill/Extension。
- `enqueueDirectorStage()` 先验证 project/node/stage/可入队状态，再把节点合法推进到 `pending` 并入队；`runStage()` 只执行 `pending → running → success|failed`。enqueue 失败时补偿到 failed 并记录错误，避免悬挂 pending。应用在 Next.js 根 `instrumentation.ts` 的 Node runtime 注册并启动进程内队列。
- **用户在设置页填自己的 Key**，存本地配置；永不进前端 bundle。

## 满足核心技术诉求

- **并发 / 容灾 / 性能**：进程内持久队列 + 有界并发 + 幂等重试 + 哈希缓存；单镜失败不阻塞全片；首轮全渲较慢、改单镜秒级。
- **复用 + 定向重渲**：配方（G01–G50）+ token 注入层复用；每镜单 HTML 隔离，哈希决定重渲。
- **HyperFrames 特化**：把 video-director 的 schema / prompt / QA 方法论移植成本项目原生代码，再把实现层特化为 HyperFrames；确定性 lint 守卫（禁 rAF / `Date.now` / 无种子随机）在模型产出进入渲染队列前强制执行。

## Git / 协作规范

- **分支**：`main`（生产 / 主分支）· `dev`（开发 / 测试）· `feature/<分类>-<描述>`（新功能；`fix/`、`chore/` 同理）。
- **流程**：`feature/*` → PR → `dev` 测试 → PR → `main`。
- **提交**：Conventional Commits（`type(scope): description`）。
- **当前**：先用自建本地 git 仓库做 demo；**后续切换到团队 GitHub 云端仓库**，届时启用分支保护、PR 审查与 CI。

## 现有脚手架需调整项

- `next.config.ts`：移除 EdgeOne 专用的 `output:'export'` / `images.unoptimized` / `trailingSlash`，改为标准全栈 Next（跑真实 Node server）。
- 删除 `edgeone.json`。
- 重写 `AGENTS.md`：从 EdgeOne 静态站规范 → 全栈 Next.js + 本机渲染 + 全 Node/TS + 上述 Git 规范。
- 新增依赖（待实现阶段确认后 `pnpm add`）：drizzle + better-sqlite3、playwright、ffmpeg-static、@xyflow/react、gsap、zod、StepFun/OpenAI SDK、Pi。

## 后续阶段（非 demo）

- Electron 打包（electron-builder）+ 代码签名 + 自动更新。
- 本机渲染性能压测；GPU 加速评估。
- DirectorSession 会话分支/重放、视觉模型 QA 与更细粒度角色协作。
- （规模化 / 多团队时）拆多包 Monorepo、引入 adapters（Db/Queue/Storage/Llm）以支持"服务器 / 云版"。

## 决策理由

- **快**：单应用全栈 Next.js 是最短出 demo 路径；Monorepo / Electron / adapters 的价值在规模化与分发阶段才显现，故推迟。
- **稳**：HyperFrames + 确定性 lint 保住"同帧同画面"；本机渲染避开服务器瓶颈。
- **省**：用户自带 Key + 本地存储 = 零服务器成本、零凭据泄露。
- **可演进**：领域逻辑集中，未来抽包 / 上云低成本。

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-07-23 | Demo 基线发布。 |
| 2026-07-23（修订） | 对齐 Harness：video-director 改为原生移植；画布改为动态 fan-out；Agent 改为 `Agent + JsonlSessionRepo + DirectorSessionStore`，明确 JSONL/SQLite/StorageAdapter 边界并排除 coding-agent/Skills/Extensions。 |
| 2026-07-23（修订二） | 补齐 Director 执行契约：节点持久化 `directorInput`，新增类型化 prompt 路由与 repository 端口，状态机由 enqueue/runner 分工，队列通过 Next `instrumentation.ts` 启动。 |
| 2026-07-23（修订三） | 收紧 Agent 权限：校验 Tool 只读诊断，artifact 提交由 stage runner 专用服务执行，模型不控制项目归属与路径。 |
| 2026-07-23（修订四） | 明确 Demo 队列非原子入库的失败补偿：pending 后 enqueue 失败必须转 failed 并记录错误；未来可替换事务 outbox。 |
| 2026-07-24（修订五） | 收口服务端启动副作用：Director/Render queue 与 runner 模块导入不得打开 SQLite，持久依赖延迟到作业入口执行。 |
| 2026-07-23（修订五） | 领域 enqueue 增加 project/node/stage/状态前置校验，阻止无效异步作业被 API 当作成功接受。 |
| 2026-07-23（修订六） | 重构 Render：显式 shot runtime、磁盘帧序列与 session 池、内容寻址 cache、可信 repository/export service 和统一后台启动。 |
| 2026-07-24（修订七） | 收口 Node UI 领域合同：九种节点类型与六态状态统一由客户端安全的 canvas types 导出，禁止 UI 复制枚举或混用 Agent 阶段。 |
| 2026-07-24（修订八） | 项目创建与四个全局 DAG 节点改为单事务；API 返回可信 INGEST 节点 ID，消除无入口半成品项目和客户端猜 ID。 |
| 2026-07-24（修订九） | 分镜通道节点在 fan-out 时持久化 Director stage，画布读模型与 Inspector 直接消费该字段。 |
