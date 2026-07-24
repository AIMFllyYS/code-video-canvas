# 编码规范（Coding Standards）

> 面向人的完整编码规范；操作要点的精简版见 [AGENTS.md](../../AGENTS.md)。
> v3 架构边界以
> [Architecture & Execution Spec](../specs/2026-07-24-refactor-v3-architecture-spec.md)
> 为准。

## 1. TypeScript

- 全项目 `strict`；**禁用 `any`**，用 `unknown` + 类型收窄替代。
- 优先**命名导出**（`page.tsx` / `layout.tsx` 等 Next.js 约定文件除外）。
- 领域私有类型靠近使用处；跨域、browser/server-safe 且需要版本化的合同放
  `packages/contracts`，只从包公开入口导入，禁止 deep import。
- feature/package 通过 `index.ts`、包根导出或 application service 暴露公共能力；
  跨域禁止 deep import repository、schema、infrastructure 或私有文件。
- 外部输入（AI 返回、文件、请求体）一律先过 **Zod** 校验再进业务。
- 新建 contract、service、hook 或组件前先搜索并复用，遵循 DRY/YAGNI；没有多个真实
  消费者或实现时，不预建抽象层。

## 2. React / Next.js

- 默认 **Server Component**；仅在需要交互 / 浏览器 API 时加 `'use client'`，且尽量放**叶子组件**。
- `page.tsx` 目标/硬上限 200/300 行；一般生产文件 250/350；schema/repository
  硬上限 400；单函数 ≤50 行。超限或职责混杂按职责真实拆分，禁止用 re-export 壳或
  循环依赖规避。
- 重客户端组件用 `next/dynamic` 懒加载。
- `params` / `searchParams` / `cookies()` / `headers()` **必须 `await`**（Next 16）。
- `error.tsx` 必须 `'use client'`；同目录不能同时有 `route.ts` 与 `page.tsx`。
- 产品页面统一置于 `src/app/(app)`，由共享 layout 只挂一次 AppShell；页面通过
  `nav-context` 发布可信上下文，不复制 AppShell、Sidebar 或 TopNav。`/playbook`
  保持在路由组外。

## 3. 确定性渲染规则（本项目核心红线）

视频必须是 `f(frame)`——同一帧永远产出同一画面。

- **禁止**：`requestAnimationFrame`、GSAP `ticker`、`Date.now()` / `performance.now()`、无种子 `Math.random()`、CSS `animation` / `transition`、`setTimeout` / `setInterval` 驱动动画。
- **GSAP/HyperFrames**：`timelineJs` 只能向 compiler-owned 的唯一 paused timeline
  注册动画；generated source 不创建第二 timeline 或自驱动时钟。终态逐帧
  seek/playback 只由 HyperFrames 驱动。
- **随机**：必须由 `seed`（可加索引）派生。
- **循环感**：用 `Math.floor(frame / N) % k` 等帧取模表达，不用真实定时器。

## 4. 命名

- 文件 / 目录：kebab-case（`shot-node.tsx`）。
- 组件：PascalCase；变量 / 函数：camelCase；常量：UPPER_SNAKE_CASE。
- 分镜相关 ID / data 属性用稳定命名（如 `data-qa-id`、`s001-char`）。

## 5. 样式

- 一律 Tailwind CSS；条件 className 用 `clsx` / `cn()`。
- 不用 CSS Modules（除非覆盖第三方组件）。
- **应用 UI 动效**：走 `motion/react` + `src/lib/motion` token（`--duration-*` /
  `--ease-*`），根 layout 只挂一次 `AppMotionConfig`，复用 `collapsible-panel` /
  `variants`，禁硬编码时长 / 贝塞尔 / timer，跟随 `prefers-reduced-motion` 降级（详见
  [架构规范 §10](./architecture-conventions.md#ui-design-ssot)）。注意：§3 禁
  CSS `animation`/`transition` 只约束**视频 shot 渲染**，应用 UI 不受此限。
- 新视觉组件严格按 Pencil reusable symbol → Pencil layout/screenshot 验证 → 可复用组件与 demo → `/playbook` 登记 → 页面通过公共导出复用；`/playbook` 不是业务组件实现目录。
- Canonical UI 只映射 `canvas.pen` 的 `ds-*` token 与 `mode: light | dark`，不得从 R2 的 `--*` source-kit token 建立产品依赖，也不得在页面硬编码 hex/rgba。

## 6. 密钥与安全边界

- StepFun Key 等敏感信息**仅服务端**；**永不** `NEXT_PUBLIC_`、**永不**进客户端 bundle、**永不**提交仓库。
- 持久产物走 workspace-scoped `ArtifactStore`；CLI/FFmpeg 临时文件只通过
  attempt-scoped `RenderWorkspace`。业务代码不得接收 raw key、绝对路径或散落裸
  `fs`；旧 `StorageAdapter` 只允许出现在迁移期删除清单与只读 migration 工具。

## 7. 注释与测试

- 注释解释**为什么**，不复述代码；中文注释保持 UTF-8。
- 新功能 / 修 bug 必须带测试；确定性相关逻辑优先 golden-frame / 帧哈希测试。
- 改动后跑 `pnpm lint` 与 `pnpm typecheck`。
