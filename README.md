# CodeVideoCanvas

基于自然语言的节点式 AIGC 短视频创作引擎：把文字稿拆成可独立生成、修改、渲染和
验收的 Shot，通过确定性代码视频、音频、字幕与合成产出 MP4。

## 当前状态

仓库已完成 **v3 重构文档基线**，代码实施尚未开始。现有 Demo v1 代码仍可能运行在
SQLite、进程内队列和 legacy renderer 上；后续由一个 Codex Goal 按 N0–N7 阶段逐步
迁移，不能把目标架构误报为当前已落地功能。

v3 目标栈：

```text
Next.js + Postgres + Trigger.dev + Pi Agent
        + video-compiler + HyperFrames
```

关键决策：

- Pi Agent 继续作为 CVC 唯一 Agent Runtime，不迁移 OpenAI Agents SDK；
- Postgres 是唯一活动结构化数据源，本地用 Docker 启动；
- Trigger.dev 负责异步编排、重试、并发、取消与 Realtime；
- AI/LLM 模型选择只在 `ModelPolicy`，业务只调用统一 `AiTaskRuntime`；
- TTS/ASR 等媒体 provider/model 只由独立 `MediaProviderPolicy` 选择，不进入 Agent；
- AI 产物先归一为 `ShotSourcePackageV1`，再通过十级门禁和 compiler；
- HyperFrames 是终态唯一帧时钟；
- UI 字段必须来自真实 Snapshot、artifact 或 API；
- PurpleInk 未来通过合同适配合并，不强制两个项目共享 Agent Runtime 或数据库全集。

## 核心能力

- 稿件语义拆分与结构化计划；
- 动态物化 Shot 通道的节点画布；
- 单镜 ShotSpec、代码生成、独立重试与只重渲；
- 完整 HTML、JSON 与分段代码的确定性提取；
- 安全、语法、确定性、seek、像素与媒体门禁；
- 配音、音效、字幕、配乐、混音与最终合成；
- Run 取消、重试、刷新恢复与真实状态追踪；
- Pencil → Playbook → 页面的一致 UI 组件体系。

## 快速开始

当前 Demo 基线：

```powershell
pnpm install
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。开发要求 Node.js ≥22.19.0 与
pnpm。Postgres/Trigger/HyperFrames 的 v3 本地命令将在对应 N1/N2/N4 Track 落地后
成为正式入口。

基础检查：

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## v3 架构边界

```text
Browser
  → Next.js app/API
      → Postgres                    业务真源
      → Trigger.dev                 执行编排
          → application services
              → Pi AiTaskRuntime    四类模型任务
              → SourceNormalizer
              → video-compiler
              → HyperFrames
              → media/compose
              → ArtifactStore
```

Trigger task 总数固定为七类：

```text
cvc.pipeline.run
cvc.project.plan
cvc.shot.generate
cvc.shot.media
cvc.shot.render
cvc.shot.qa
cvc.project.compose
```

`cvc.shot.generate` 先独立执行 `shot-spec`，提交 checkpoint 后再用新的 Pi invocation
执行 `fabricate`。生成完成后 media 与 render 并行，最终在 QA/media 都满足 readiness
后 compose。

## 文档入口

活动权威文档：

1. [v3 Master Index](./docs/plans/2026-07-24-refactor-blueprint-00-master-index.md)
2. [Product Spec v3](./docs/specs/2026-07-24-refactor-v3-product-spec.md)
3. [Architecture & Execution Spec v3](./docs/specs/2026-07-24-refactor-v3-architecture-spec.md)
4. [Codex Goal Harness v3.1](./docs/specs/2026-07-24-refactor-v3-codex-harness.md)
5. [v3.1 Task Breakdown](./docs/specs/2026-07-24-refactor-v3-task-breakdown.md)
6. [N0–N7 Track Plans](./docs/issues/refactor-v3/)
7. [Architecture Decisions](./docs/adr/)
8. [Architecture Conventions](./docs/conventions/architecture-conventions.md)

视觉权威仍是：

- [Design System Inventory](./docs/designs/2026-07-23-design-system-inventory.md)
- `docs/designs/canvas.pen`（只能通过 Pencil MCP 访问）
- `/playbook` 组件登记

日期为 2026-07-23 的 PRD、Harness、Task Breakdown、平台架构与
`docs/designs/tasks.md` 已冻结为 Demo v1 历史证据。`.qoder/repowiki` 是自动生成
知识库，不是 v3 规范来源。

## Codex Goal 路线

| Track | 结果 |
|---|---|
| N0 | 基线封账、核心止血、架构守卫 |
| N1 | SQLite 一致性备份、Postgres 地基与 Spike |
| N2 | Trigger.dev 唯一编排、幂等、取消与 Realtime |
| N3 | Pi Agent 四类结构化模型任务与统一模型策略 |
| N4 | SourceNormalizer、十级门禁、video-compiler、HyperFrames |
| N5 | 音频、字幕、混音、拼接与终片验证 |
| N6 | Pencil/Playbook、真实 Run UI、Inspector 与文件治理 |
| N7 | workflowVersion、全链路 E2E、恢复验收与旧路径清退 |

一次 Codex Goal 覆盖完整 N0–N7。Track 是该 Goal 内部的阶段、依赖门禁、验证边界与
恢复 checkpoint，不是独立 Goal；每个 Track 收口后在同一 Goal 内继续，只有 N7 Tier C
和 A01–A30 全部完成才能结束。状态只在 v3 Task Breakdown 维护，详细步骤由对应 Track
Plan 定义。

## 工程治理摘要

- 每个 feature/package 只通过 `index.ts`、包根导出或明确 application service 暴露
  公共能力；跨域禁止 deep import repository、schema、infrastructure 或私有文件。
- 新建代码前先搜索并复用已有 contract、service、hook、组件与动效原语，遵循
  DRY/YAGNI，禁止为同一职责建立第二套抽象。
- 产品页面统一由 `src/app/(app)/layout.tsx` 挂载一次 AppShell；页面发布路由上下文并
  只替换内容区，不复制 AppShell、Sidebar 或 TopNav。
- 新视觉组件严格遵循 Pencil reusable symbol → 可复用组件/demo → `/playbook`
  登记 → 页面通过公共导出复用；`/playbook` 是组件登记与展示路由，不是业务实现目录。
- UI 动效统一复用 `motion/react`、`src/lib/motion` token、
  `collapsible-panel`/variants 与根级 `AppMotionConfig`；禁止页面硬编码动效参数或另造
  平行原语，且 motion 不进入视频渲染。
- `page.tsx` 目标/硬上限为 200/300 行，一般生产文件为 250/350 行，
  schema/repository 硬上限 400 行，单函数硬上限 50 行。超限或职责混杂必须在当前
  Task 按职责真实拆分，不能用 re-export 壳或循环依赖规避。
- 用户可见状态必须来自 Snapshot、artifact 或 API；未实现能力明确显示 empty、
  disabled 或 placeholder，不用固定假值伪装成功。

## 贡献与安全

- 开工先读 [AGENTS.md](./AGENTS.md)；
- 中文文件保持 UTF-8，不得引入 U+FFFD；
- 不提交 `.env*`、Key、`.data/`、`.trigger/`、`output/` 或构建物；
- 用户凭据只在服务端读取，不得使用 `NEXT_PUBLIC_*`；
- 视频是 `f(frame)`，禁止墙钟、rAF、ticker、timer 和无种子随机；
- 每个 Task/文档阶段本地 Conventional Commit；未经授权不 push。

## License

MIT
