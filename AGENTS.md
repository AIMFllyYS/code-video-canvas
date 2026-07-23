# AGENTS.md — code-video-canvas

本文件是 AI 编码代理的操作策略。与 `docs/conventions/` 中面向人的完整规范保持一致；冲突时以本文件为操作准绳。

## Project Overview

基于自然语言的**节点式 AIGC 短剧视频创作引擎**：把文字稿按语义拆分镜，每个分镜对应画布上一个可独立生成、独立渲染、独立修改的节点；AI 把语义翻译成**确定性**的 HTML+GSAP 代码视频，再叠加音效/字幕/配音/配乐/转场，最终在本机渲染导出成片。

- **本地优先 / 无服务器**：全部在运行者本机运行，AI 用用户自带 StepFun Key 直连。
- **Demo 阶段**：标准全栈 Next.js 单应用，快速跑通最小闭环。不做登录/远程存储/限流/安全加固/Electron 打包（均后置，见 PRD §9）。
- 完整需求见 [PRD](./docs/specs/2026-07-23-prd-code-video-canvas.md)，架构见 [平台架构设计](./docs/designs/2026-07-23-platform-architecture-design.md)。

## Tech Stack

- **Framework**: Next.js ≥16.2.0（App Router，**全栈：真实 Node server，非静态导出**）
- **React**: ≥19.2 · **TypeScript**: strict mode（禁 `any`）
- **Package Manager**: pnpm · **Node**: 22.11.0
- **Styling**: Tailwind CSS · **画布**: React Flow（`@xyflow/react`）
- **渲染**: HyperFrames 思想 — Playwright（自带 Chromium）逐帧 `seek` + CDP 截帧 → `ffmpeg-static`
- **动画**: GSAP（`paused` timeline + 每帧 `seek`，确定性）
- **Agent**: Pi(TS) harness（OpenClaw 内核）编码 video-director 八阶段
- **AI**: StepFun（阶跃星辰，OpenAI 兼容端点，用户自带 Key）
- **存储**: SQLite（Drizzle ORM）+ 本地文件系统（经 StorageAdapter）
- **队列**: 进程内持久队列（状态落 SQLite，可恢复）
- **校验**: Zod（由 video-director schema 派生）

> ⚠️ 迁移中：当前脚手架仍是 EdgeOne 静态导出遗留（`next.config.ts` 含 `output:'export'`、根目录有 `edgeone.json`）。迁移到全栈配置、删除 EdgeOne 残留是**待执行的实现任务**（见架构文档「现有脚手架需调整项」）。

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
    (canvas)/          画布编辑器
    projects/          项目管理
    settings/          StepFun Key 等本地设置
    api/               route handlers（渲染触发、作业状态、AI 代理如需）
    layout.tsx  globals.css  loading.tsx  error.tsx  not-found.tsx
  features/            业务领域（按域聚合）
    canvas/            React Flow 节点图 + 节点类型
    director/          video-director 八阶段编排 + Pi agent（服务端）
    render/            HyperFrames 截帧循环 + ffmpeg 封装 + 作业运行器
    ai/                StepFun LlmAdapter（服务端）
    audio/             配音 / SFX / BGM / 字幕
  lib/
    db/                Drizzle + SQLite
    storage/           StorageAdapter（本地 FS）
    queue/             进程内持久队列
    gsap/              GSAP↔seek 确定性桥
    determinism/       确定性 lint / 守卫
  components/ui/       纯展示组件
  server/              server-only 工具（import 'server-only'）
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

### Next.js 16.2+

- 用 `proxy.ts`（导出 `proxy`），不用 `middleware.ts`（已废弃）。
- `params` / `searchParams` / `cookies()` / `headers()` **必须 `await`**。
- Turbopack 默认；自定义 webpack 会导致构建失败。
- `error.tsx` 必须 `'use client'`；`route.ts` 与 `page.tsx` 不能同目录共存。

### StepFun / Key

- 所有 LLM 调用走 `features/ai` 的 `LlmAdapter`（base_url `https://api.stepfun.com/v1`）。
- Key 仅存服务端本地配置；**永不**进客户端 bundle，**永不**用 `NEXT_PUBLIC_` 前缀。

### 存储

- 结构化数据走 Drizzle+SQLite；二进制产物走 `StorageAdapter`；不要在业务里散落裸 `fs` 调用（便于未来换对象存储）。

## When Writing Code

- `page.tsx` ≤ 200 行（硬上限 300），超出拆到 `features/`；单函数 ≤ 50 行。
- 默认 Server Component；`'use client'` 尽量放叶子；`next/dynamic` 懒加载重客户端组件。
- 命名导出优先（page/layout 除外）；strict 模式禁 `any`，用 `unknown` + 收窄。
- Tailwind 处理样式，`clsx`/`cn()` 处理条件 className。
- 新功能必须写测试；改动后跑 `pnpm lint`。
- 调试/原型放 `src/app/_dev/`，完成后迁回正式路由并清理。

## When Reviewing Code

- **确定性违规**：rAF / ticker / 墙钟 / 无种子随机 / CSS 动画。
- **Key 泄露**：Key 是否进了客户端组件、`NEXT_PUBLIC_`、或提交到仓库。
- `params`/`searchParams` 是否 `await`；渲染是否被误放到浏览器端。
- 是否绕过 `StorageAdapter` 直接读写文件系统。
- `page.tsx` 行数是否超限；`'use client'` 是否过度上浮到页面级。
- 是否有 `middleware.ts` 残留、`pages/` 目录、正式代码反向引用 `_dev/`。

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

- 安装/删除依赖（`pnpm add` / `remove`）。
- 删除文件。
- 改 `next.config.ts` / `tsconfig.json` / ESLint 配置。
- 改 Drizzle schema 或数据库迁移。
- Push 到 Git 或创建 PR。

### 🚫 Never

- 提交 `.env*` 或任何 Key / 凭据；把 Key 放进客户端或 `NEXT_PUBLIC_`。
- 引入非确定性渲染（rAF / 墙钟 / 无种子随机）。
- Force push 到 `main`；手改 `pnpm-lock.yaml`；改构建产物。
- 用 `middleware.ts`（用 `proxy.ts`）或 Pages Router（`pages/`）。
- 让正式代码引用 `src/app/_dev/`（单向引用）。

## Key Files

- `AGENTS.md` — 本文件（AI 操作策略）
- `docs/specs/2026-07-23-prd-code-video-canvas.md` — 产品需求
- `docs/designs/2026-07-23-platform-architecture-design.md` — 平台架构
- `docs/conventions/` — 编码 / 架构 / Git 完整规范
- `next.config.ts` — Next.js 配置（迁移中）
- `src/lib/db/` — Drizzle + SQLite
- `src/lib/determinism/` — 确定性守卫
