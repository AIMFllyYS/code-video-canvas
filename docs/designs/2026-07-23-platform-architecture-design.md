# CodeVideoCanvas 平台架构设计

> Created: 2026-07-23
> Updated: 2026-07-23
> Status: accepted（demo 基线，已批准）

## 问题陈述

将 `video-director` skill（一套确定性视频编译方法论：语义分镜 → 分镜合同 → 逐镜代码视频 → 音画字幕 → 配乐转场 → 渲染导出）产品化为**类 AI 工作流的节点式 AIGC 短剧创作平台**。用户以自然语言驱动，画布上每个分镜对应一个可独立渲染的节点。

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
| Agent | Pi / 自研 / Python 框架 | **Pi(TS) harness** | OpenClaw 内核，StepFun 官方兼容 |
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
    director/            video-director 八阶段编排 + Pi agent 集成（服务端）
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

### 数据流（节点图 = video-director DAG）

```
文字稿 →[Ingest]script-units+audio →[Direct]master-plan+style-bible
      →[Shot-Spec]shot-plan →[Shot 节点×N]AI 生成 HTML → 本机渲染（哈希缓存）
      →[Audio]SFX/字幕/配音 →[Assemble]BGM+转场+拼接 →[Finalize]QA → 终渲 mp4
```

画布上每个节点是该 DAG 的可视化投影；每个 Shot 节点单向对应一份可独立渲染的 HTML。

### 渲染执行（本机、服务端）

- 服务端用 Playwright（自带 Chromium）加载 shot HTML，逐帧 `seek` 暂停时间线 → CDP 截帧 → `ffmpeg-static` 编码。
- 渲染作业走**进程内队列**（状态持久化到 SQLite，崩溃可恢复），有界并发（≈本机核数），内容哈希缓存 → 只重渲变化节点。

### 存储

- **SQLite（Drizzle）**：项目 / 画布图 / 节点参数 / 作业 / 产物索引。
- **本地文件系统**：mp4 / 帧 / 音频（经 StorageAdapter，未来可换对象存储）。

### AI（StepFun）

- 服务端 `LlmAdapter` 指向 `https://api.stepfun.com/v1`（OpenAI 兼容）。
- **用户在设置页填自己的 Key**，存本地配置；永不进前端 bundle。

## 满足核心技术诉求

- **并发 / 容灾 / 性能**：进程内持久队列 + 有界并发 + 幂等重试 + 哈希缓存；单镜失败不阻塞全片；首轮全渲较慢、改单镜秒级。
- **复用 + 定向重渲**：配方（G01–G50）+ token 注入层复用；每镜单 HTML 隔离，哈希决定重渲。
- **HyperFrames 特化**：保留 video-director 协议 / Schema / QA / 自成长，只把实现层特化为 HyperFrames；确定性 lint 守卫（禁 rAF / `Date.now` / 无种子随机）。

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
- Pi 八阶段 skill 细分与角色化。
- （规模化 / 多团队时）拆多包 Monorepo、引入 adapters（Db/Queue/Storage/Llm）以支持"服务器 / 云版"。

## 决策理由

- **快**：单应用全栈 Next.js 是最短出 demo 路径；Monorepo / Electron / adapters 的价值在规模化与分发阶段才显现，故推迟。
- **稳**：HyperFrames + 确定性 lint 保住"同帧同画面"；本机渲染避开服务器瓶颈。
- **省**：用户自带 Key + 本地存储 = 零服务器成本、零凭据泄露。
- **可演进**：领域逻辑集中，未来抽包 / 上云低成本。
