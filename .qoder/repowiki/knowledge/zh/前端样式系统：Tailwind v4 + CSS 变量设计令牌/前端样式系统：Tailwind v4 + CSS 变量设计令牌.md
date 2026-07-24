---
kind: frontend_style
name: 前端样式系统：Tailwind v4 + CSS 变量设计令牌
category: frontend_style
scope:
    - '**'
source_files:
    - src/app/globals.css
    - src/lib/utils.ts
    - postcss.config.mjs
    - package.json
    - src/components/ui/button.tsx
    - src/app/(app)/settings/theme-control.tsx
---

本项目采用 **Next.js App Router + Tailwind CSS v4** 作为前端样式体系，通过 CSS 自定义属性（CSS Variables）集中管理设计令牌（Design Tokens），并以组件化 UI 原子库实现视觉一致性。

### 1. 技术栈与工具链
- **框架**: Next.js 16+（全栈模式，非静态导出）
- **样式引擎**: Tailwind CSS v4，通过 `@tailwindcss/postcss` 在 PostCSS 中集成
- **类名合并**: `clsx` + `tailwind-merge` 封装为 `cn()` 工具函数（`src/lib/utils.ts`），全项目统一使用
- **图标**: `lucide-react`
- **动画**: `gsap`（视频渲染管线）+ `motion`（UI 动效）
- **画布**: `@xyflow/react`（React Flow）用于节点式编辑器

### 2. 设计令牌体系（Design Tokens）
所有视觉常量集中在 `src/app/globals.css` 的 `:root` 和 `.dark` 块中定义，涵盖：
- **品牌与语义色**: `--color-accent`, `--color-success`, `--color-warning`, `--color-danger`, `--color-purple`, `--color-teal`
- **流水线阶段色**: `--color-stage-ingest/direct/shotspec/shot/audio/assemble/finalize` 对应导演工作流各阶段
- **中性色与表面**: `--color-bg/bg-secondary/surface/surface-raised/fill/fill-strong/separator/canvas-bg/scrim`
- **文字色**: `--color-label/label-secondary/label-tertiary/text-inverse`
- **功能填充与效果**: `--color-accent-fill/success-fill/teal-fill/danger-fill/warning-fill/overlay/canvas-grid/on-accent/glass/glass-sidebar/tooltip-bg/player-bg/knob`
- **字体**: `--font-sans` (Inter/Noto Sans SC), `--font-sc` (Noto Sans SC/微软雅黑), `--font-mono` (JetBrains Mono)
- **圆角**: `--radius-sm/md/lg/xl/pill`
- **阴影**: `--shadow-card`, `--shadow-float`
- **动效缓动**: `--duration-fast/base/slow`, `--ease-standard/emphasized/exit`

这些令牌通过 Tailwind v4 的 `@theme inline` 指令映射到 Tailwind 主题变量，使组件可通过 `bg-accent`, `text-label`, `rounded-md` 等语义化工具类引用。

### 3. 暗色模式策略
- 基于 class 切换：通过 `<html class="dark">` 控制主题
- 主题控制组件 `ThemeControl`（`src/app/(app)/settings/theme-control.tsx`）支持 light/dark/system 三种模式，状态持久化至 `localStorage('theme-mode')`
- 深色模式下所有 CSS 变量重新赋值，确保对比度与可读性

### 4. 组件库架构（`src/components/ui/`）
- **原子组件**: button, card, dialog, toast, tooltip, progress-bar, search-field, text-field, text-area, toggle, segmented-control, sidebar, top-bar, nav-item, settings-group, settings-row, empty-state, skeleton, status-pill, contact-sheet-thumb, artifact-chip, icon-button, resize-handle, timeline-track, queue-status-bar 等
- **节点组件**: `node/` 子目录包含 audio-node, export-node, shot-node, stage-node 等 React Flow 专用节点
- 每个组件遵循 **variant + size** 模式（如 Button 的 primary/tinted/gray/destructive 变体与 sm/md/lg 尺寸）
- 所有组件通过 `cn()` 合并 className，避免样式冲突

### 5. 特殊样式处理
- **React Flow 光标覆盖**: 通过 data URI SVG 自定义 grab/grabbing 光标，解决浅色画布上系统白色指针不可见问题（注释明确说明这是受控例外）
- **无障碍**: `prefers-reduced-motion: reduce` 媒体查询强制禁用所有动画过渡，仅约束应用 UI（视频渲染产物不受此限制）
- **骨架屏微光动画**: `animate-shimmer` 通过 `@keyframes shimmer` 定义，配合 `--animate-shimmer` 暴露为 Tailwind 工具类

### 6. 约定与约束
- **SSOT 原则**: 按钮等基础组件是单一真实来源，全应用统一从 `@/components/ui/*` 导入，禁止直接写样式
- **设计令牌权威源**: `docs/designs/2026-07-23-design-system-inventory.md` 被 globals.css 注释引用为权威来源
- **视频确定性红线**: 组件注释明确区分「应用 UI」（允许交互动效）与「视频 shot 渲染」（自包含 artifact，不引入本样式表，保持确定性）
- **类名合并规范**: 所有组件必须通过 `cn()` 合并 className，确保 Tailwind 类优先级正确
- **无 tailwind.config.js**: Tailwind v4 采用 CSS-first 配置，所有主题定义集中在 `globals.css` 的 `@theme inline` 块中