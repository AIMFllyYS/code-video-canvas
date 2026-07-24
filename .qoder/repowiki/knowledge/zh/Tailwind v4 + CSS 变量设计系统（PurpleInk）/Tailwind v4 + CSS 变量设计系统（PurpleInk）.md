---
kind: frontend_style
name: Tailwind v4 + CSS 变量设计系统（PurpleInk）
category: frontend_style
scope:
    - '**'
source_files:
    - src/app/globals.css
    - src/app/layout.tsx
    - src/app/(app)/settings/theme-control.tsx
    - src/lib/motion/config.tsx
    - src/lib/motion/tokens.ts
    - src/lib/utils.ts
    - src/components/ui/button.tsx
    - postcss.config.mjs
    - package.json
---

## 1. 系统与工具链
- 样式框架：Tailwind CSS v4（通过 `@tailwindcss/postcss` 插件集成，无传统 `tailwind.config.js`）。
- 样式入口：`src/app/globals.css`，使用 `@import "tailwindcss"` 引入 Tailwind。
- 构建链路：Next.js → PostCSS (`postcss.config.mjs`) → Tailwind v4。
- 动画库：`motion/react`（Framer Motion），通过全局 `<AppMotionConfig>` 提供统一过渡上下文。
- 图标：`lucide-react`。
- 类名合并：`clsx` + `tailwind-merge`，封装为 `cn()` 工具函数（`src/lib/utils.ts`）。

## 2. 核心文件与包
- 设计令牌与主题：`src/app/globals.css`（`:root` / `.dark` 双主题 CSS 变量 + `@theme inline` 映射到 Tailwind）。
- 主题切换：`src/app/layout.tsx`（SSR 阶段注入脚本设置初始 `dark` class）、`src/app/(app)/settings/theme-control.tsx`（客户端切换逻辑）。
- 动效 token：`src/lib/motion/tokens.ts`（JS 侧 duration/ease/transition 常量，与 CSS 变量一一对应）。
- 动效上下文：`src/lib/motion/config.tsx`（`AppMotionConfig` 包裹应用，启用 `reducedMotion="user"`）。
- UI 组件原子：`src/components/ui/*`（Button、Card、Dialog、Sidebar、TimelineTrack 等，全部基于 Tailwind 类名 + 设计令牌）。
- 依赖声明：`package.json` 中锁定 `tailwindcss ^4.0.0`、`@tailwindcss/postcss ^4.0.0`、`motion ^12.42.2`、`lucide-react ^1.26.0`、`clsx`、`tailwind-merge`。

## 3. 架构与设计约定
- **设计令牌优先**：所有颜色、圆角、阴影、字体、动效时长均通过 CSS 自定义属性（`--color-*`、`--radius-*`、`--shadow-*`、`--duration-*`、`--ease-*`）集中定义，再经 `@theme inline` 暴露给 Tailwind 工具类。组件只引用 Tailwind 语义化类名（如 `bg-accent`、`text-label`、`rounded-md`），不直接写色值。
- **双主题（Light/Dark）**：`globals.css` 同时定义 `:root` 与 `.dark` 两套变量；`layout.tsx` 在 SSR 阶段根据 `localStorage('theme-mode')` 与 `prefers-color-scheme` 决定是否添加 `dark` class；`theme-control.tsx` 提供 light/dark/system 三态切换。
- **无障碍动效降级**：`globals.css` 中 `@media (prefers-reduced-motion: reduce)` 强制所有动画/过渡归零；`AppMotionConfig` 同步设置 `reducedMotion="user"`，形成 CSS + JS 双重保险。
- **画布光标定制**：针对 React Flow 的 grab/grabbing 光标，使用内联 SVG data-URI 覆盖，确保浅色/深色画布下可见性一致。
- **骨架屏微光**：通过 `@keyframes shimmer` 与 `--animate-shimmer` 生成 `animate-shimmer` 工具类，供 Skeleton 组件复用。
- **组件原子化**：UI 组件位于 `src/components/ui`，每个组件独立 `.tsx` 文件，通过 `cn()` 合并 props.className，并暴露 variant/size 等枚举变体（如 Button 的 primary/tinted/gray/destructive）。

## 4. 约定与约束
- **禁止硬编码色值**：组件样式必须通过 Tailwind 语义化类名引用 CSS 变量（如 `bg-accent`、`text-on-accent`），不得直接使用十六进制色值。
- **主题开关仅操作 `document.documentElement.classList`**：切换逻辑集中在 `theme-control.tsx` 的 `applyTheme`，其他组件不应直接修改 dark class。
- **动效统一由 `AppMotionConfig` 管理**：所有 motion 动画应继承默认 transition，避免在各处散落 duration/ease 配置。
- **响应式策略**：未使用媒体查询断点，依赖 Tailwind v4 的响应式前缀（如 `sm:`、`md:`）与容器查询；全局样式以 CSS 变量为主，保持跨设备一致性。
- **视频渲染与 UI 样式解耦**：注释明确说明「视频 shot 渲染是自包含 artifact，不引入本样式表」，保证播放器输出不受 UI 主题影响。
- **权威源文档**：设计令牌来源标注为 `docs/designs/2026-07-23-design-system-inventory.md`，动效 token 对应 §3.8，按钮变体对应 §4 B1，形成文档-代码双向追溯。