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
| Agent | Pi(TS) harness（OpenClaw 内核） | — |
| AI | StepFun（阶跃星辰，OpenAI 兼容） | 用户自带 Key |
| 存储 | SQLite（Drizzle）+ 本地文件系统 | — |
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

所有前端 UI 组件遵循单一真源（SSOT）：在 `src/components/*` 定义一份，其他页面 `import` 复用、不重复实现。运行后访问 [/playbook](http://localhost:3000/playbook) 查看组件手册（应用内「活文档 / 组件画廊」）；新增组件在 `src/app/playbook/registry.ts` 登记并加 `*.demo.tsx`。详见 [架构规范](./docs/conventions/architecture-conventions.md)。

## 文档

- [产品需求 PRD](./docs/specs/2026-07-23-prd-code-video-canvas.md)
- [平台架构设计](./docs/designs/2026-07-23-platform-architecture-design.md)
- [规范体系 docs/conventions/](./docs/conventions/)
- [AGENTS.md](./AGENTS.md) — AI 编码代理操作策略

## 路线图

| 阶段 | 范围 |
|---|---|
| **Phase 0（当前 Demo）** | 本地跑通：导入 → 分镜 → 单镜渲染 → 合成导出 |
| Phase 1 | 音频 / 字幕 / 配乐 / 转场完善 + QA 抽帧 |
| Phase 2 | Electron 桌面打包分发 |
| Phase 3 | 规模化：Monorepo / 服务器或云版 |

## License

MIT
