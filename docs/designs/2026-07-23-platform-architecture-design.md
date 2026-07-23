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
- 视频渲染沿用 **HyperFrames 思想**：单文件 HTML + `data-*` 时序 + Chromium 逐帧 seek 截图 → FFmpeg。

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

### 渲染执行（本机、服务端）

- 服务端用 Playwright（自带 Chromium）加载 shot HTML，逐帧 `seek` 暂停时间线 → CDP 截帧 → `ffmpeg-static` 编码。
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
- `enqueueDirectorStage()` 先把节点合法推进到 `pending` 再入队，`runStage()` 只执行 `pending → running → success|failed`；应用在 Next.js 根 `instrumentation.ts` 的 Node runtime 注册并启动进程内队列。
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
