# code-video-canvas

> 基于自然语言的节点式 AIGC 短剧视频创作引擎 · 本地优先

## 项目简介

把一段文字稿，通过"语义分镜 → 节点式画布 → 逐镜代码视频 → 音画合成 → 一键导出"，变成一支高完成度短视频。每个分镜是一个可**独立生成、独立渲染、独立修改**的节点；AI 把语义翻译成**确定性**的 HTML+GSAP 代码动画，最终在你自己的电脑上渲染导出成片。

### 核心能力

- **语义分镜**：稿子按语义拆成有序的分镜节点
- **节点式画布**：每个分镜一个节点，可独立生成 / 渲染 / 修改
- **确定性代码视频**：AI 生成 HTML+GSAP，`f(frame)` 完全可复现
- **定向重渲**：改单个节点只重渲该节点（内容哈希缓存）
- **音画合成**：音效 / 字幕 / 配音 / 配乐 / 转场 → 一键导出 MP4
- **本地优先**：全部本机运行，AI 用你自己的 StepFun Key，零服务器

## 技术栈

| 类别 | 技术 | 版本 / 说明 |
|---|---|---|
| 框架 | Next.js（App Router，全栈） | ≥16.2.0 |
| UI 库 | React | ≥19.2 |
| 语言 | TypeScript | strict mode |
| 画布 | React Flow（`@xyflow/react`） | — |
| 渲染 | HyperFrames 思想（Playwright/Chromium 逐帧 seek → `ffmpeg-static`） | — |
| 动画 | GSAP | paused + frame seek（确定性） |
| Agent | Pi Agent（`@earendil-works/pi-agent-core` + `pi-ai`） | 裸 tool-calling 引擎；video-director 方法论已移植为原生代码，不挂载 Skill |
| AI | StepFun（阶跃星辰，OpenAI 兼容） | 用户自带 Key |
| 存储 | SQLite（Drizzle）+ 本地文件系统 | — |
| 样式 | Tailwind CSS + Design Token 体系 | 禁硬编码颜色 |
| 图标 | `lucide-react`（白名单制） | 禁 emoji |
| 画布布局 | `@dagrejs/dagre` | 分镜通道自动布局 |
| 包管理 | pnpm | — |
| 运行时 | Node.js | 22.11.0 |

## 快速开始

### 环境要求

- Node.js 22.11.0 + pnpm
- 一个 StepFun（阶跃星辰）API Key

### 安装与运行

```bash
pnpm install
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)，在**设置页**填入你的 StepFun Key 即可使用 AI 功能。

### 构建

```bash
pnpm build
pnpm start
```

## 项目结构

```
src/
  app/              路由与 API 入口
  features/         业务领域：canvas / director / render / ai / audio
  lib/              db(SQLite) / storage / queue / gsap / determinism
  components/       ui 原语 / icons（SSOT，见 /playbook）
  server/           server-only 工具
docs/               PRD / 架构 / 规范 / 计划 等
scripts/            辅助脚本
```

详细结构与规则见 [AGENTS.md](./AGENTS.md)。

## 组件复用（/playbook）

所有前端 UI 组件遵循单一真源（SSOT）：在 `src/components/*` 定义一份，其他页面 `import` 复用、不重复实现。运行后访问 [/playbook](http://localhost:3000/playbook) 查看组件手册（应用内「活文档 / 组件画廊」）；新增组件在 `src/app/playbook/registry.ts` 登记并加 `*.demo.tsx`。

视觉语言以 [设计系统清单](./docs/designs/2026-07-23-design-system-inventory.md) 为权威：颜色/阴影/圆角/间距均引用 Design Token，图标统一 Lucide 白名单，禁止硬编码 hex。详见 [架构规范](./docs/conventions/architecture-conventions.md)。

## 文档

- [产品需求 PRD](./docs/specs/2026-07-23-prd-code-video-canvas.md)
- [平台架构设计](./docs/designs/2026-07-23-platform-architecture-design.md)
- [设计系统清单](./docs/designs/2026-07-23-design-system-inventory.md)（Token / 颜色 / 图标 / 组件 / 布局）
- [UI 设计交接](./docs/designs/2026-07-23-ui-design-handoff.md)
- [规范体系 docs/conventions/](./docs/conventions/)
- [AI 开发 Harness 总纲](./docs/specs/2026-07-23-ai-development-harness.md) — 三层节点体系 / Harness Engineering（video-director 方法论原生移植）/ 模块职责地图 / 验收框架
- [任务拆解与 Goal 模式执行清单](./docs/specs/2026-07-23-harness-task-breakdown.md) — 按 Track 分组的 Task 规格 + 每个 Track 的 Goal 启动提示词
- [Implementation Plan（Kiro Spec 格式）](./docs/designs/tasks.md) — 按 PRD 功能编号（F1~F14）追溯的任务清单与依赖图
- [AGENTS.md](./AGENTS.md) — AI 编码代理操作策略

## 开发方式：Spec 驱动 + Codex Goal 模式

本项目采用 **Spec 驱动开发**：所有实施工作先在 `docs/specs/` 中拆解为结构化任务，再交给 AI（Codex Goal 模式或人类工程师）执行。核心原则：

- **一次 Codex `/goal` 会话对应一个 Track**（如 Foundation/Canvas/Director/Render/Pencil组件港口/Audio/UI），Codex 在该会话内部自主拆解、按序执行 Track 下的多个 Task，全部完成后才判定 Goal 达成。
- 每个 Task 有明确的允许/禁止改动范围 + 机器可判定的完成条件；Track 之间尽量解耦以支持并行启动多个 Goal 会话。
- 验收分两级：Tier A（单 Task 级，lint/tsc/单测/确定性扫描）与 Tier B（Track 完成后的里程碑级，全量 build + 功能性端到端集成测试）；视觉/内容质量层面的端到端验收始终由人工完成，不自动化。
- `docs/designs/tasks.md` 是按 Kiro Spec 格式呈现的任务路线图，按 PRD 功能编号（F1~F14）追溯覆盖情况；执行细节以 `docs/specs/2026-07-23-harness-task-breakdown.md` 为权威来源。

详见 [AI 开发 Harness 总纲](./docs/specs/2026-07-23-ai-development-harness.md)。

## 路线图

| 阶段 | 范围 |
|---|---|
| **Phase 0（当前 Demo）** | 本地跑通：导入 → 分镜 → 单镜渲染 → 合成导出 |
| Phase 1 | 音频 / 字幕 / 配乐 / 转场完善 + QA 抽帧 |
| Phase 2 | Electron 桌面打包分发 |
| Phase 3 | 规模化：Monorepo / 服务器或云版 |

## License

MIT
