# 编码规范（Coding Standards）

> 面向人的完整编码规范；操作要点的精简版见 [AGENTS.md](../../AGENTS.md)。

## 1. TypeScript

- 全项目 `strict`；**禁用 `any`**，用 `unknown` + 类型收窄替代。
- 优先**命名导出**（`page.tsx` / `layout.tsx` 等 Next.js 约定文件除外）。
- 类型定义靠近使用处；跨域共享类型放 `src/lib` 或对应 `features/*/types.ts`。
- 外部输入（AI 返回、文件、请求体）一律先过 **Zod** 校验再进业务。

## 2. React / Next.js

- 默认 **Server Component**；仅在需要交互 / 浏览器 API 时加 `'use client'`，且尽量放**叶子组件**。
- `page.tsx` ≤ 200 行（硬上限 300），超出拆到 `features/`；单函数 ≤ 50 行。
- 重客户端组件用 `next/dynamic` 懒加载。
- `params` / `searchParams` / `cookies()` / `headers()` **必须 `await`**（Next 16）。
- `error.tsx` 必须 `'use client'`；同目录不能同时有 `route.ts` 与 `page.tsx`。

## 3. 确定性渲染规则（本项目核心红线）

视频必须是 `f(frame)`——同一帧永远产出同一画面。

- **禁止**：`requestAnimationFrame`、GSAP `ticker`、`Date.now()` / `performance.now()`、无种子 `Math.random()`、CSS `animation` / `transition`、`setTimeout` / `setInterval` 驱动动画。
- **GSAP**：`gsap.timeline({ paused: true })`，由渲染器每帧 `seek(frame / fps)`。
- **随机**：必须由 `seed`（可加索引）派生。
- **循环感**：用 `Math.floor(frame / N) % k` 等帧取模表达，不用真实定时器。

## 4. 命名

- 文件 / 目录：kebab-case（`shot-node.tsx`）。
- 组件：PascalCase；变量 / 函数：camelCase；常量：UPPER_SNAKE_CASE。
- 分镜相关 ID / data 属性用稳定命名（如 `data-qa-id`、`s001-char`）。

## 5. 样式

- 一律 Tailwind CSS；条件 className 用 `clsx` / `cn()`。
- 不用 CSS Modules（除非覆盖第三方组件）。
- **应用 UI 动效**：走 `motion/react` + `src/lib/motion` token（`--duration-*` / `--ease-*`），复用 `collapsible-panel` / `variants`，禁硬编码时长 / 贝塞尔，跟随 `prefers-reduced-motion` 降级（详见[架构规范 §8](./architecture-conventions.md)）。注意：§3 禁 CSS `animation`/`transition` 只约束**视频 shot 渲染**，应用 UI 不受此限。

## 6. 密钥与安全边界

- StepFun Key 等敏感信息**仅服务端**；**永不** `NEXT_PUBLIC_`、**永不**进客户端 bundle、**永不**提交仓库。
- 文件读写走 `StorageAdapter`，不散落裸 `fs`。

## 7. 注释与测试

- 注释解释**为什么**，不复述代码；中文注释保持 UTF-8。
- 新功能 / 修 bug 必须带测试；确定性相关逻辑优先 golden-frame / 帧哈希测试。
- 改动后跑 `pnpm lint` 与 `pnpm tsc --noEmit`。
