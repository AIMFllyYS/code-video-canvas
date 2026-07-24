# AGENTS.md — code-video-canvas

本文件是 AI 编码代理的操作策略。与 `docs/conventions/` 中面向人的完整规范保持一致；冲突时以本文件为操作准绳。

**本项目采用 Spec 驱动 + Codex Goal 模式施工**：所有实施任务已在 [AI 开发 Harness 总纲](./docs/specs/2026-07-23-ai-development-harness.md)、[任务拆解清单](./docs/specs/2026-07-23-harness-task-breakdown.md) 与 [Implementation Plan](./docs/designs/tasks.md)（Kiro Spec 格式，按 PRD 功能编号追溯）中拆解为可执行的 Task。**一次 Codex `/goal` 会话对应一个 Track，Track 内的 Task 由 Codex 自主顺序执行**（不是一张任务卡对应一次 `/goal`）。**开始任何实现工作前，先确认该工作是否已有对应 Task；若有，严格按该 Task 的「允许改动范围」「禁止改动」「完成条件」执行，不要绕开 harness 文档凭感觉施工。**

## Project Overview

基于自然语言的**节点式 AIGC 短剧视频创作引擎**：把文字稿按语义拆分镜，每个分镜对应画布上一个可独立生成、独立渲染、独立修改的节点；AI 把语义翻译成**确定性**的 HTML+GSAP 代码视频，再叠加音效/字幕/配音/配乐/转场，最终在本机渲染导出成片。

- **本地优先 / 无服务器**：全部在运行者本机运行，AI 用用户自带 StepFun Key 直连。
- **Demo 阶段**：标准全栈 Next.js 单应用，快速跑通最小闭环。不做登录/远程存储/限流/安全加固/Electron 打包（均后置，见 PRD §9）。
- 画布是**运行时动态生成拓扑的 DAG**，交互对标 Dify/Coze 一类工作流平台（可平移/缩放/多页面导航），不是人工手动拖拽连线的静态工作流：语义拆分节点跑完后，程序化物化出 N 条并行"分镜通道"（每通道 5 个节点：脚本/代码/音效/字幕/验收），最终收敛到配乐 + 合并导出。详见 [Harness 总纲 §4](./docs/specs/2026-07-23-ai-development-harness.md#4-三层节点体系核心心智模型)。
- `docs/video-director/` 是**参考语料库，不是运行时依赖**：其方法论已/正被移植为本项目原生代码（`features/director/prompts/`+`schemas/`），应用运行时不读取该目录。**不使用 Pi 的 Skills 机制**挂载它。
- 所有 UI 视觉组件的唯一来源是 `docs/designs/canvas.pen`（通过 Pencil MCP 一比一移植），唯一登记处是 `/playbook`（`src/app/playbook/registry.ts`）；页面代码只允许 `import` 已登记组件，禁止重复实现视觉原语。
- 最新 `canvas.pen` 中 S1–S6（含 S2 背景和暗色镜像）统一采用常驻
  `Sidebar(240) | Main(1200)`。常驻侧栏由**共享路由组 layout**
  `src/app/(app)/layout.tsx` → `src/features/navigation/app-shell.tsx` 挂载
  **一次**，跨路由不重挂、切页仅右侧变；页面不再各自渲染 AppShell，而是通过
  `nav-context` 的 `usePublishNavContext()` / `<PublishNavContext>` 发布服务端
  可信的 `{ projectId, rendererNodeId }`，侧栏 active 由 `usePathname()` 推导。
  禁止各页再建 TopNav、复制 Sidebar 或生成会 404 的无 projectId 导出链接，
  禁止客户端猜节点 ID（仍由页面发布可信上下文）。AppShell / AppSidebarShell /
  collapsible-panel 只是已登记视觉原语的业务组合，不作为新的 `/playbook` 组件登记；
  `/playbook` 在路由组之外，不带壳。
- 完整需求见 [PRD](./docs/specs/2026-07-23-prd-code-video-canvas.md)，架构见 [平台架构设计](./docs/designs/2026-07-23-platform-architecture-design.md)，施工方法见 [Harness 总纲](./docs/specs/2026-07-23-ai-development-harness.md) 与 [任务拆解清单](./docs/specs/2026-07-23-harness-task-breakdown.md)。

## Tech Stack

- **Framework**: Next.js ≥16.2.0（App Router，**全栈：真实 Node server，非静态导出**）
- **React**: ≥19.2 · **TypeScript**: strict mode（禁 `any`）
- **Package Manager**: pnpm · **Node**: ≥22.19.0（`pi-agent-core@0.81.x` 的最低运行时要求）
- **Styling**: Tailwind CSS + Design Token 体系（见 [设计系统清单](./docs/designs/2026-07-23-design-system-inventory.md)）
- **图标**: `lucide-react`（白名单制，禁 emoji，见设计系统 §6）
- **画布**: React Flow（`@xyflow/react`）+ `@dagrejs/dagre`（自动布局）
- **设计源**: `docs/designs/canvas.pen`，经 Pencil MCP 工具链一比一移植为 `src/components/*`（见 Harness 总纲 §5.6，Track P）
- **渲染**: HyperFrames 思想 — Playwright（自带 Chromium）逐帧 `seek` + CDP 截帧 → `ffmpeg-static`
- **动画**: GSAP（`paused` timeline + 每帧 `seek`，确定性）
- **应用 UI 动效**: `motion`（framer-motion 现名，`motion/react`）+ 设计 token（`--duration-*` / `--ease-*`，见设计系统清单 §3.8）；统一收起/展开缓动、抽屉、骨架、页面进入。**仅用于应用 UI，绝不进入 shot 渲染**；跟随 `prefers-reduced-motion` 降级。动效原语在 `src/lib/motion/` 与 `features/navigation/collapsible-panel.tsx`。
- **Agent**: Pi Agent（`@earendil-works/pi-agent-core` 的 `Agent + JsonlSessionRepo` + `pi-ai`）仅作裸 tool-calling 循环引擎，由项目原生 `createDirectorSession()` 封装；**不依赖 `pi-coding-agent`，不使用 Skills/Extensions 加载机制**；`docs/video-director/` 的方法论已移植为 `features/director/prompts/`+`schemas/` 原生代码（见 Harness 总纲 §3），编码 video-director 六阶段（应用层统一口径，见 Harness 总纲 §6.5）
- **AI**: StepFun（阶跃星辰，OpenAI 兼容端点，用户自带 Key）
- **存储**: SQLite（Drizzle ORM）+ 本地文件系统（经 StorageAdapter）
- **队列**: 进程内持久队列（状态落 SQLite，可恢复）
- **校验**: Zod（由 video-director schema 派生）

## Key Commands

- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Start: `pnpm start`
- Typecheck: `pnpm tsc --noEmit`
- Lint / fix: `pnpm lint` / `pnpm lint --fix`
- Test: `pnpm test`

## Definition of Done

1. `pnpm lint` 退出 0
2. `pnpm tsc --noEmit` 退出 0
3. `pnpm build` 退出 0
4. 新功能/改动关键路径有测试且通过
5. 无确定性违规（见下）与 Key 泄露
6. 变更已 stage；Commit 遵循 Conventional Commits（`type(scope): description`）

## Project Structure

```
src/
  app/                 路由与 API 入口（不放业务逻辑）
    canvas/            画布编辑器（占位，React Flow 后置）
    projects/          项目管理
    settings/          StepFun Key 等本地设置
    playbook/          组件手册（活文档 / 组件画廊）
    api/               route handlers（渲染触发、作业状态、AI 代理如需）
    layout.tsx  globals.css  loading.tsx  error.tsx  not-found.tsx
  features/            业务领域（按域聚合）
    canvas/            画布 DAG 数据模型 + 分镜通道 fan-out 物化 + 自动布局
    director/          video-director 六阶段编排 + Pi Agent 会话/工具（服务端）
    render/            HyperFrames 截帧循环 + ffmpeg 封装 + 作业运行器
    ai/                StepFun LlmAdapter（服务端）
    audio/             配音 / SFX / BGM / 字幕（Demo 阶段占位，P1 补齐真实实现）
    navigation/        常驻 Pencil Sidebar 应用壳 + 项目上下文导航
  lib/
    db/                Drizzle + SQLite
    storage/           StorageAdapter（本地 FS）
    queue/             进程内持久队列
    gsap/              GSAP↔seek 确定性桥
    determinism/       确定性 lint / 守卫
  components/
    ui/                纯展示原语（Button / Card …）
    icons/             Lucide 图标组件（白名单制，源自 Pencil）
  server/              server-only 工具（import 'server-only'）
  instrumentation.ts  Next Node runtime 启动钩子（队列注册/启动）
docs/  scripts/  public/
```

- `src/app/` 只放路由/API 入口，业务逻辑下沉 `src/features/`。
- 跨域共享逻辑提升到 `src/lib/`；`src/components/ui/` 只放无业务的纯 UI。
- `src/app/_dev/` 是隔离调试区，顶部必须有 `if (process.env.NODE_ENV === 'production') notFound()`；正式代码**不得**引用 `_dev/`（单向）。

## Non-Obvious Patterns

### 确定性渲染是硬约束（本项目核心）

- 视频是 `f(frame)`：**禁** `requestAnimationFrame`、GSAP ticker、`Date.now()`/`performance.now()`、无种子 `Math.random()`、CSS `animation`/`transition`。
- GSAP：`gsap.timeline({ paused: true })` + 每帧 `seek(frame / fps)`。
- 随机必须由 `seed`（+ 索引）派生；同帧永远同画面。
- 渲染发生在**服务端**（route handler / 后台作业中的 Playwright），**不在用户浏览器**。
- 边界：确定性红线**只约束视频 shot 渲染**；应用 UI（`components/*`、`/playbook`、编辑器）允许 hover / CSS transition / 交互动画。
- shot HTML 必须是可搬运的自包含 artifact，不得依赖工作区相对路径或运行时读取 `docs/`/`node_modules/`；唯一 seek 接口是 `window.__CVC_RENDER__@v1`。同一 Playwright page 串行 seek，允许有限 page 池并发。
- PNG 帧必须写入可显式 cleanup 的隔离临时目录，由 ffmpeg 从 pattern 流式读取；禁止以 `Buffer[]` 常驻完整帧序列。
- Render 缓存键由 HTML + 帧规格 + seed 派生并只用于寻址；`artifacts.contentHash` 必须是最终 MP4 实体 SHA-256，禁止把输入 renderKey 冒充产物哈希。
- Render 路由不得自行查表/拼 artifact 路径，只调用可信 enqueue/export service；Director/Render 共用根 `instrumentation.ts` 启动的单例队列。
- UI 作业轮询必须按 projectId 隔离；浏览器只使用 artifact id 下载 URL，不得
  暴露 StorageAdapter key、本机绝对路径或让页面自行拼 artifact 路径。

### Next.js 16.2+

- 用 `proxy.ts`（导出 `proxy`），不用 `middleware.ts`（已废弃）。
- `params` / `searchParams` / `cookies()` / `headers()` **必须 `await`**。
- Turbopack 默认；自定义 webpack 会导致构建失败。
- `error.tsx` 必须 `'use client'`；`route.ts` 与 `page.tsx` 不能同目录共存。

### StepFun / Key

- 所有 LLM 调用走 `features/ai` 的 `LlmAdapter`（base_url `https://api.stepfun.com/v1`），或 Track D 中 Pi Agent 挂载的 StepFun Provider。
- **生产路径**：用户在「设置」页填 Key → 写本地 SQLite `settings` 表 → 服务端读取。
- **开发/测试路径**：`.env`/`.env.local` 提供开发期种子 Key（`STEPFUN_API_KEY` 等，见 [Harness 总纲 §7](./docs/specs/2026-07-23-ai-development-harness.md#7-环境变量契约)），读取优先级为 SQLite 设置 > 环境变量。**用户已明确授权 AI 代理查看 `.env`/`.env.local` 内容用于本地开发验证与真实 API 端到端测试**；引用时只写变量名，任何情况下不将密钥原文写入代码、commit、日志或对话输出。
- Key 仅存服务端本地配置；**永不**进客户端 bundle，**永不**用 `NEXT_PUBLIC_` 前缀。
- 设置 API 必须先 `validateKey`，成功后才 `saveApiKey`；校验失败不得覆盖已保存 Key。

### 存储

- 结构化数据走 Drizzle+SQLite；二进制产物走 `StorageAdapter`；不要在业务里散落裸 `fs` 调用（便于未来换对象存储）。
- Pi JSONL 是特殊的追加式文件产物：只能由 `DirectorSessionStore` 在 `StorageAdapter.localPath('pi-sessions')` 分配的根目录内操作；业务层只持有相对 `storageKey`，SQLite 只登记指针。

### Director 执行边界

- 项目创建必须与 script-import/shot-split/score/export 四个全局节点在同一事务
  完成；API 只向客户端返回服务端确认的 ingestNodeId，禁止客户端猜节点 ID。
- 分镜通道 fan-out 时必须持久化节点对应的 Director stage；Inspector 只使用
  服务端读模型返回值，禁止按 CanvasNodeType 在客户端猜 stage。
- 节点阶段输入持久化在 `canvas_nodes.data.directorInput`；`stage-prompt.ts` 只调用六阶段原生 prompt builder，禁止临时拼无类型 prompt。
- `enqueueDirectorStage()` 先验证 project/node/stage/可入队状态，再把节点推进到 `pending` 并入队；`runStage()` 只接受 pending 节点，执行 `pending → running → success|failed`。
- enqueue 持久化失败时必须补偿为 `pending → running → failed` 并记录错误，禁止留下悬挂 pending 节点。
- `stage-runner.ts` 是显式应用编排器，可通过各领域公开入口组合 canvas/AI/storage；Drizzle 细节收口在 `runtime-repository.ts`，不得散落到 runner。
- 模型回复必须按“类型化归一 → artifact 门禁 → 应用副作用提交 → success”处理。Demo INGEST 只接受 `{scriptUnits}`，音频 manifest/allocation 禁止由模型猜测；成功后由应用生成稳定 shot ID 并事务性 fan-out。
- FABRICATE 的 HTML 由确定性门禁校验；`renderSpec` 必须由可信的 audio allocation + 固定 Demo 画幅 + 上下文派生 seed 生成，禁止采信模型自报的 fps/帧数/seed。
- Pi Agent 只挂只读诊断 Tool；artifact 的 project/node/path 必须由 stage runner 的可信上下文交给 `write-artifact.ts`，禁止让模型自行选择归属或路径。
- 进程内队列通过根 `src/instrumentation.ts` 在 Node runtime 幂等注册和启动，不假设 `src/server/` 文件会被 Next.js 自动执行。queue/runner 模块导入不得打开 SQLite；默认 repository 必须延迟到 enqueue 或 handler 真正执行时创建。

## When Writing Code

- `page.tsx` ≤ 200 行（硬上限 300），超出拆到 `features/`；单函数 ≤ 50 行。
- 默认 Server Component；`'use client'` 尽量放叶子；`next/dynamic` 懒加载重客户端组件。
- 命名导出优先（page/layout 除外）；strict 模式禁 `any`，用 `unknown` + 收窄。
- Tailwind 处理样式，`clsx`/`cn()` 处理条件 className。
- **设计 Token 强制**：颜色/阴影/圆角/间距必须引用设计系统变量（见 [设计系统清单](./docs/designs/2026-07-23-design-system-inventory.md)），**禁止硬编码 hex / rgba**；暗色背景 `#0F0F0F`（非纯黑）；已删除色 `pink`/`indigo` 不得使用。
- **图标**：统一使用 Lucide 白名单内图标（`lucide-react`），禁 emoji；命名以设计系统 §6.3 标准名为准（如 `circle-plus` 而非 `plus-circle`）。
- 新功能必须写测试；改动后跑 `pnpm lint`。
- 调试/原型放 `src/app/_dev/`，完成后迁回正式路由并清理。
- UI 组件复用（SSOT）：视觉原语只在 `components/*` 定义一份，页面 `import` 复用、禁重复实现；新组件在 `src/app/playbook/registry.ts` 登记并加 `*.demo.tsx`。
- Node/* UI 组件直接复用客户端安全的 `features/canvas/types.ts` 中
  `CanvasNodeType`/`NodeStatus`；禁止在 UI 内复制状态枚举，禁止用 PipelineStage
  代替节点类型，视觉阶段色由 CanvasNodeType 显式映射。

## When Reviewing Code

- **确定性违规**：rAF / ticker / 墙钟 / 无种子随机 / CSS 动画。
- **Key 泄露**：Key 是否进了客户端组件、`NEXT_PUBLIC_`、或提交到仓库。
- `params`/`searchParams` 是否 `await`；渲染是否被误放到浏览器端。
- 是否绕过 `StorageAdapter` 直接读写文件系统。
- `page.tsx` 行数是否超限；`'use client'` 是否过度上浮到页面级。
- 是否有 `middleware.ts` 残留、`pages/` 目录、正式代码反向引用 `_dev/`。
- 组件复用：是否重复实现了 `components/ui` 已有的视觉原语；新组件是否登记 `/playbook`。
- **设计 Token 违规**：是否散落硬编码 hex/rgba 颜色（应引用 token）；是否使用了已删除色（pink/indigo）；阴影是否统一用 `shadow-card`/`shadow-float`。
- **图标违规**：是否使用了 Lucide 白名单外图标或 emoji；图标名是否用旧名（如 `plus-circle` 应为 `circle-plus`）。

## Git Workflow

- 分支：`main`（生产/主分支）· `dev`（开发/测试）· `feature/<分类>-<描述>`（`fix/`、`chore/` 同理）。
- 流程：`feature/*` → PR → `dev` 测试 → PR → `main`。
- Commit：Conventional Commits（`feat(canvas): add shot node`）。
- 当前用自建本地 git 仓；后续切团队 GitHub 云端（届时启用分支保护 + PR 审查 + CI）。
- 未经用户明确授权**不得**推送远程。

## Boundaries

### ✅ Allowed without asking

- 读文件、列目录；跑 `pnpm lint` / `tsc --noEmit` / 单文件测试。
- 改 `src/` 业务代码、`src/app/` 路由、`src/components/ui/`。
- 在 `src/app/_dev/` 建调试页。

### ⚠️ Ask first

- 安装/删除依赖（`pnpm add` / `remove`）——**除非**该依赖已在某张 harness 任务卡的「允许改动范围」中被明确列出（如 Track F 的 F0.1/F0.6）。
- 删除文件。
- 改 `next.config.ts` / `tsconfig.json` / ESLint 配置。
- 改 Drizzle schema 或数据库迁移——**除非**该改动是某张 harness 任务卡的直接目标（如 F0.4/F0.5），此时按该卡的完成条件执行即视为已获授权，不必逐次再问。
- Push 到 Git 或创建 PR。

### 🚫 Never

- **提交**（写入 git / commit）`.env*` 或任何 Key / 凭据；把 Key 放进客户端或 `NEXT_PUBLIC_`。**查看**（读取）`.env`/`.env.local` 用于本地开发验证是被明确授权的，二者不冲突——授权范围是"读取用于验证"，红线是"绝不落盘到会被提交的文件/绝不回显原文"。
- 引入非确定性渲染（rAF / 墙钟 / 无种子随机）。
- Force push 到 `main`；手改 `pnpm-lock.yaml`；改构建产物。
- 用 `middleware.ts`（用 `proxy.ts`）或 Pages Router（`pages/`）。
- 让正式代码引用 `src/app/_dev/`（单向引用）。

## Key Files

- `AGENTS.md` — 本文件（AI 操作策略）
- `docs/specs/2026-07-23-prd-code-video-canvas.md` — 产品需求
- `docs/specs/2026-07-23-ai-development-harness.md` — **AI 开发 Harness 总纲**：三层节点体系、Pi Agent 落地方案、模块职责地图、DB 演进方案、验收框架
- `docs/specs/2026-07-23-harness-task-breakdown.md` — **任务拆解清单**：按 Track 分组的 Task 规格 + 每个 Track 的 Goal 启动提示词，施工前先查此文件
- `docs/designs/tasks.md` — Kiro Spec 格式的 Implementation Plan，按 PRD 功能编号（F1~F14）追溯任务覆盖情况与依赖图
- `docs/designs/2026-07-23-platform-architecture-design.md` — 平台架构
- `docs/designs/2026-07-23-ui-design-handoff.md` — UI 设计交接（逐页规格 + 文案复用库）
- `docs/conventions/` — 编码 / 架构 / Git 完整规范
- `docs/designs/2026-07-23-design-system-inventory.md` — 设计系统清单（Token / 颜色 / 图标 / 组件 / 布局）
- `next.config.ts` — Next.js 配置（全栈；原生 SQLite 与 `ffmpeg-static` 平台二进制保持 server external）
- `src/lib/db/` — Drizzle + SQLite
- `src/lib/determinism/` — 确定性守卫
