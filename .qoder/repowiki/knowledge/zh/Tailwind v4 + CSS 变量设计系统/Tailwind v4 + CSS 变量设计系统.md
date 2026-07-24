---
kind: frontend_style
name: Tailwind v4 + CSS 变量设计系统
category: frontend_style
scope:
    - '**'
source_files:
    - src/app/globals.css
    - postcss.config.mjs
    - src/app/layout.tsx
    - src/lib/motion/config.tsx
    - src/lib/motion/tokens.ts
    - docs/designs/2026-07-23-design-system-inventory.md
---

## 1. 体系概览
本项目采用 Tailwind CSS v4（通过 `@tailwindcss/postcss` 插件）作为样式框架，配合 CSS 自定义属性（CSS Variables）构建完整的设计系统。所有视觉 token 集中在 `src/app/globals.css` 中定义，并通过 `@theme inline` 暴露给 Tailwind 使用。

## 2. 核心文件与依赖
- **样式入口**：`src/app/globals.css` — 定义全部设计 token、主题切换、动画关键帧
- **PostCSS 配置**：`postcss.config.mjs` — 仅启用 `@tailwindcss/postcss` 插件
- **根布局**：`src/app/layout.tsx` — 注入暗色模式初始化脚本，挂载 `AppMotionConfig`
- **动效配置**：`src/lib/motion/config.tsx` + `src/lib/motion/tokens.ts` — motion/react 的 JS 镜像 token
- **设计系统文档**：`docs/designs/2026-07-23-design-system-inventory.md` — 权威规范文档

## 3. 架构与约定

### 设计 Token 分层
- **CSS 变量层**（`globals.css` :root/.dark）：颜色、字体、圆角、阴影、时长、缓动曲线等全部以 `--color-*`、`--duration-*`、`--ease-*` 前缀定义
- **Tailwind 映射层**（`@theme inline`）：将 CSS 变量映射为 Tailwind 工具类，如 `bg-surface`、`text-label`、`rounded-md`、`shadow-card`
- **JS 镜像层**（`motion/tokens.ts`）：与 CSS 完全同步的 duration/ease 值，供 motion/react 使用

### 双主题策略
- 使用 class-based 暗色模式（`.dark` 类），通过 `<html>` 上的 class 切换
- 根布局在 hydration 前执行内联脚本，根据 `localStorage` 或系统偏好设置初始主题
- 所有 token 均提供 light/dark 两套值，无硬编码颜色

### 组件库组织
- 基础 UI 组件位于 `src/components/ui/`，每个组件独立 `.tsx` 文件
- 业务节点组件位于 `src/components/ui/node/`，按功能域划分
- 组件统一使用 Tailwind 类名 + CSS 变量，不直接写颜色值

### 画布特殊处理
- React Flow 画布光标通过 SVG data URI 覆盖，确保浅色/深色背景下的可见性
- 画布网格、节点拖拽等交互样式通过高特异度选择器覆盖第三方库默认样式

## 4. 约束与规范
- **禁止硬编码颜色**：除色板展示区外，所有 fill/stroke/text/shadow 必须引用 CSS 变量
- **阶段色语义化**：流水线各阶段（ingest/direct/shot/audio/assemble/finalize）使用专用 token（`--color-stage-*`）
- **动效一致性**：UI 动画统一使用 `AppMotionConfig` 提供的 transition，遵循 `--duration-*` / `--ease-*` 规范
- **无障碍支持**：全局 `prefers-reduced-motion` 规则自动降级动画，motion 配置 `reducedMotion="user"` 双重保障
- **图标白名单**：仅允许 Lucide 图标，禁止 emoji，尺寸规范见设计系统文档
- **字体规范**：英文用 Inter，中文用 Noto Sans SC，代码用 JetBrains Mono

## 5. 构建与集成
- Next.js App Router 直接 import `globals.css` 作为全局样式
- PostCSS 仅配置 Tailwind v4 插件，无其他预处理步骤
- 通过 `@import "tailwindcss"` 引入 Tailwind，利用其内置的 CSS 变量解析能力