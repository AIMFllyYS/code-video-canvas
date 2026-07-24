---
kind: frontend_style
name: 前端样式体系：Tailwind v4 + CSS 变量设计令牌 + 组件原子库
category: frontend_style
scope:
    - '**'
source_files:
    - src/app/globals.css
    - src/lib/utils.ts
    - src/components/ui/button.tsx
    - src/app/layout.tsx
    - postcss.config.mjs
    - package.json
    - src/lib/motion/config.tsx
---

本项目采用 **Tailwind CSS v4** 作为核心样式框架，结合 **CSS 自定义属性（CSS Variables）** 构建统一的设计令牌系统，并通过 `src/components/ui` 下的原子组件库实现跨页面一致的视觉风格。

### 1. 样式系统与工具链
- **Tailwind v4**：通过 `@import "tailwindcss"` 在 `src/app/globals.css` 中引入，使用 `@theme inline` 将 CSS 变量映射为 Tailwind 主题令牌。
- **PostCSS 配置**：仅启用 `@tailwindcss/postcss` 插件，无额外预处理。
- **类名合并**：通过 `src/lib/utils.ts` 中的 `cn()` 函数组合 `clsx` 与 `tailwind-merge`，解决条件类名冲突。

### 2. 设计令牌（Design Tokens）
所有视觉常量集中在 `src/app/globals.css` 的 `:root` 和 `.dark` 伪类中定义，包括：
- **语义色**：`--color-accent`、`--color-success`、`--color-warning`、`--color-danger`、`--color-purple`、`--color-teal`
- **流水线阶段色**：`--color-stage-ingest`、`--color-stage-direct`、`--color-stage-shot` 等，对应导演流水线各阶段
- **中性色与表面**：背景、填充、分隔线、画布背景等层级化表面系统
- **字体**：`--font-sans`（Inter）、`--font-sc`（Noto Sans SC）、`--font-mono`（JetBrains Mono）
- **圆角**：`--radius-sm/md/lg/xl/pill` 五级圆角体系
- **动效**：`--duration-fast/base/slow` 时长与 `--ease-standard/emphasized/exit` 缓动曲线

深色模式通过 `.dark` 类切换，由 `src/app/layout.tsx` 中的内联脚本根据 `localStorage` 或系统偏好初始化。

### 3. 组件库架构
`src/components/ui/` 提供原子级 UI 组件，每个组件遵循统一模式：
- **Button**：支持 `primary/tinted/gray/destructive` 四种变体与 `sm/md/lg` 三种尺寸
- **Card、Dialog、Toast、Tooltip、ProgressBar、Skeleton** 等基础控件
- **业务组件**：`ArtifactChip`、`ProjectCard`、`QueueStatusBar`、`TimelineTrack` 等
- 每个组件附带对应的 `.demo.tsx` 文件用于文档展示
- 组件内部通过 `cn()` 合并类名，严格使用设计令牌而非硬编码颜色值

### 4. 响应式与无障碍
- **暗色模式**：基于 class 的 dark mode，通过 `@custom-variant dark` 扩展 Tailwind
- **减少动态效果**：`globals.css` 中 `@media (prefers-reduced-motion: reduce)` 全局禁用动画，与 `motion/react` 的 `reducedMotion="user"` 配置形成双重保障
- **光标定制**：为 React Flow 画布提供 SVG 数据 URI 光标，确保浅色/深色背景下可见性
- **骨架屏动画**：内置 `shimmer` 关键帧动画，受 reduced-motion 规则自动降级

### 5. 设计系统参考
项目包含完整的 PurpleInk 设计系统文档（`docs/designs/purpleink-new-design-package/`），其中 `source-reference/globals.css` 提供了更丰富的设计令牌定义，包括品牌色板、阴影系统、渐变等高级样式能力，作为未来扩展的权威参考。