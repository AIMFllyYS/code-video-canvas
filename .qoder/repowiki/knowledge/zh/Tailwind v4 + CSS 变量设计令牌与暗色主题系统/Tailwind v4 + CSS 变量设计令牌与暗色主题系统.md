---
kind: frontend_style
name: Tailwind v4 + CSS 变量设计令牌与暗色主题系统
category: frontend_style
scope:
    - '**'
source_files:
    - src/app/globals.css
    - src/app/layout.tsx
    - postcss.config.mjs
    - src/lib/utils.ts
    - src/lib/motion/config.tsx
    - src/lib/motion/tokens.ts
    - src/components/ui/button.tsx
    - src/components/ui/card.tsx
    - package.json
---

本项目采用 **Tailwind CSS v4** 作为样式框架，结合 **CSS 自定义属性（CSS Variables）** 构建统一的设计令牌体系，并通过 class-based 的 `.dark` 模式实现完整的暗色主题。整体风格遵循 Apple 设计语言（Inter/Noto Sans SC/JetBrains Mono 字体、圆角/阴影规范），并针对视频创作场景做了画布光标、骨架屏等专项优化。

### 1. 样式系统与工具链
- **Tailwind v4**：通过 `@tailwindcss/postcss` 插件在 PostCSS 中启用，无传统 `tailwind.config.js`，所有主题配置集中在 `src/app/globals.css` 的 `@theme inline` 块中。
- **CSS 变量令牌**：所有颜色、字体、圆角、阴影、动效时长均定义为 `--color-*` / `--font-*` / `--radius-*` / `--shadow-*` / `--duration-*` / `--ease-*` 变量，集中声明于 `:root` 和 `.dark` 两个作用域。
- **类名合并策略**：组件统一通过 `cn()`（封装 `clsx` + `tailwind-merge`）合并 className，避免冲突。

### 2. 设计令牌体系（Design Tokens）
令牌按语义分层组织，权威来源为 `docs/designs/2026-07-23-design-system-inventory.md`：
- **品牌与语义色**：`--color-accent`（主色）、`--color-success`、`--color-warning`、`--color-danger`、`--color-purple`、`--color-teal`
- **流水线阶段色**：`--color-stage-ingest/direct/shotspec/shot/audio/assemble/finalize` 对应 Director 管线各阶段
- **中性色与表面**：`--color-bg` / `--color-bg-secondary` / `--color-surface` / `--color-fill` / `--color-separator` 等
- **文字层级**：`--color-label` / `--color-label-secondary` / `--color-label-tertiary` / `--color-text-inverse`
- **功能填充**：`--color-accent-fill` / `--color-success-fill` 等半透明变体
- **特效**：`--color-glass` / `--color-tooltip-bg` / `--color-player-bg` / `--color-knob`
- **字体族**：`--font-sans`（Inter + Noto Sans SC）、`--font-sc`（中文优先）、`--font-mono`（JetBrains Mono）
- **圆角**：`--radius-sm/md/lg/xl/pill`
- **阴影**：`--shadow-card` / `--shadow-float`
- **动效**：`--duration-fast/base/slow` + `--ease-standard/emphasized/exit`

### 3. 暗色主题机制
- 使用 Tailwind v4 的 `@custom-variant dark (&:where(.dark, .dark *));` 定义暗色选择器
- 根布局 `src/app/layout.tsx` 通过内联脚本在 hydration 前读取 `localStorage('theme-mode')` 或系统偏好设置，动态添加/移除 `document.documentElement.classList.add('dark')`
- 所有 CSS 变量在 `:root` 和 `.dark` 中成对定义，确保明暗切换无缝

### 4. 组件库约定
- 原子组件位于 `src/components/ui/*.tsx`，每个组件提供 `.demo.tsx` 示例文件
- 组件内部通过 `cn()` 组合基础样式与变体，如 Button 的 `primary/tinted/gray/destructive` 四种变体
- 卡片组件 Card 直接映射 token：`bg-surface border-separator shadow-card rounded-lg`
- 图标统一使用 `lucide-react`，通过 `className="h-4 w-4"` 控制尺寸

### 5. 动效系统（Motion）
- 使用 `motion/react`（Framer Motion 新包名）作为统一动效基座
- `src/lib/motion/config.tsx` 提供全局 `AppMotionConfig`，注入默认 transition 和 `reducedMotion="user"`
- `src/lib/motion/tokens.ts` 提供 JS 侧的 DURATION/EASE 常量，与 CSS 变量一一对应（秒为单位）
- 骨架屏动画 `animate-shimmer` 通过 `@keyframes shimmer` 定义，并在 reduced-motion 下自动降级

### 6. 无障碍与可访问性
- `prefers-reduced-motion: reduce` 媒体查询全局禁用动画/过渡，与 motion 的 `reducedMotion="user"` 形成双保险
- 画布光标使用 SVG data-URI 覆盖 React Flow 的 grab/grabbing 状态，确保浅色/深色背景均可见
- 颜色对比度遵循 Apple 设计规范，支持系统级高对比度模式

### 7. 关键约束与约定
- **SSOT 原则**：所有 UI 组件必须从 `@/components/ui/*` 导入，禁止在业务组件中重复定义样式
- **Token 优先**：禁止直接使用十六进制颜色值，必须引用 `--color-*` 变量对应的 Tailwind 类（如 `bg-accent`）
- **响应式策略**：基于 Tailwind v4 的断点系统，未定义自定义断点
- **视频渲染隔离**：shot 渲染产物为自包含 artifact，不引入应用样式表，避免样式污染