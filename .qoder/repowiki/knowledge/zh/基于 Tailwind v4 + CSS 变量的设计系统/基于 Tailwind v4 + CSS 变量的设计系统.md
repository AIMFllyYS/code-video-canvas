---
kind: frontend_style
name: 基于 Tailwind v4 + CSS 变量的设计系统
category: frontend_style
scope:
    - '**'
source_files:
    - src/app/globals.css
    - postcss.config.mjs
    - src/app/layout.tsx
    - docs/designs/2026-07-23-design-system-inventory.md
    - src/lib/motion/config.tsx
    - src/components/ui/button.tsx
    - next.config.ts
    - package.json
---

## 1. 体系概览

CodeVideoCanvas 的前端样式采用 **Tailwind CSS v4 + CSS 自定义属性（CSS Variables）+ Framer Motion** 的混合方案：
- 视觉 token（颜色、圆角、阴影、字体、动效时长/缓动）以 `:root` / `.dark` 下的 CSS 变量集中声明，作为单一事实来源；
- 通过 `@theme inline` 将 CSS 变量映射到 Tailwind 工具类名，使组件层仅使用语义化 class（如 `bg-accent`、`text-label`、`rounded-md`）；
- 暗色模式通过根节点 `<html>` 上的 `class="dark"` 切换，由根布局在首屏注入脚本同步 `localStorage('theme-mode')` 与系统偏好；
- 应用 UI 动画统一经 `src/lib/motion/config.tsx` 的 `AppMotionConfig` 挂载，遵循「减弱动态效果」降级策略。

该体系的设计规范权威文档位于 `docs/designs/2026-07-23-design-system-inventory.md`，并与 Pencil 源稿 `canvas.pen` 双向对齐。

## 2. 关键文件与包

| 角色 | 路径 |
|---|---|
| 全局样式与 Token 真源 | `src/app/globals.css` |
| Tailwind v4 PostCSS 插件 | `postcss.config.mjs` |
| 根布局（主题注入 + Motion 配置） | `src/app/layout.tsx` |
| 设计系统清单（权威文档） | `docs/designs/2026-07-23-design-system-inventory.md` |
| 全站 Motion 上下文 | `src/lib/motion/config.tsx` |
| 基础按钮原语（示例） | `src/components/ui/button.tsx` |
| Next 配置（排除原生依赖） | `next.config.ts` |
| 依赖声明（tailwindcss 4、motion/react、lucide-react、clsx/tailwind-merge） | `package.json` |

## 3. 架构与约定

### 3.1 Token 分层

- **CSS 变量层**（`globals.css`）：定义 `--color-*`、`--radius-*`、`--shadow-*`、`--font-*`、`--duration-*`、`--ease-*`、`--animate-shimmer` 等变量，并分别给出 `:root`（浅色）与 `.dark`（深色）两套值。
- **Tailwind 映射层**（`@theme inline`）：把上述变量暴露为 Tailwind 工具类，例如 `bg-accent`、`text-label-secondary`、`rounded-lg`、`ease-emphasized`、`animate-shimmer`。
- **组件层**：所有 `src/components/ui/*` 组件只引用 Tailwind 工具类，禁止直接写 hex 色值或硬编码尺寸。

### 3.2 暗色模式

- 根布局 `layout.tsx` 在 `<head>` 中执行内联脚本，根据 `localStorage('theme-mode')` 与 `prefers-color-scheme` 给 `<html>` 添加 `class="dark"`，避免 SSR 闪烁。
- `globals.css` 中同一组变量在 `.dark` 下覆写，实现一键换肤。

### 3.3 动效体系

- 应用 UI 动画统一走 `motion/react` 的 `MotionConfig`，由 `AppMotionConfig` 在根布局挂入，默认 `reducedMotion="user"`。
- `globals.css` 同时提供 `prefers-reduced-motion: reduce` 的全局规则，对 CSS 过渡/动画做兜底降级，形成 JS + CSS 双保险。
- 骨架 shimmer 通过 `--animate-shimmer` keyframes 生成 `animate-shimmer` 工具类，仅在真实异步等待时出现。

### 3.4 画布光标覆盖

针对 React Flow 画布在白色系统指针下的不可见问题，`globals.css` 用 data URI 内嵌 SVG 手型光标覆盖 `.react-flow__pane.draggable` 等选择器，属于受控例外（data URI 无法引用 CSS 变量）。

### 3.5 图标与字号

- 图标统一使用 `lucide-react`，白名单与命名规范见设计系统清单 §6。
- 字体族通过 `--font-sans` / `--font-sc` / `--font-mono` 暴露，中文文本强制使用 `font-sc`（Noto Sans SC）。

## 4. 约束与约定

- **禁止硬编码颜色**：除色板展示区外，所有 fill/stroke/shadow 必须引用 `$变量`（设计系统清单 §2 原则 1）。
- **阶段色按流水线语义归类**：输入/媒体→teal，AI→purple，镜头生成→accent，组装→warning，完成→success，不再使用彩虹板。
- **阴影分层**：卡片/节点用 `--shadow-card`，浮层/Dialog/Toast/Toggle 用 `--shadow-float`。
- **功能填充**：状态胶囊底用 `*-fill`，彩色背景上文字用 `--color-on-accent`，透明占位用 `--transparent`。
- **暗色背景非纯黑**：`bg` → `#0F0F0F`，`canvas-bg` → `#0A0A0A`，与 surface/fill 形成层级。
- **动效一致性**：应用 UI 过渡/动画统一使用 `--duration-*` / `--ease-*` 与 `AppMotionConfig` 默认 transition；视频 shot 渲染不受此约束（自包含 artifact）。
- **无障碍**：所有动效在 `prefers-reduced-motion` 下自动降级为静态。
