---
kind: frontend_style
name: Tailwind v4 + CSS 变量设计令牌体系
category: frontend_style
scope:
    - '**'
source_files:
    - src/app/globals.css
    - postcss.config.mjs
    - src/app/layout.tsx
    - src/lib/utils.ts
    - docs/designs/2026-07-23-design-system-inventory.md
---

## 1. 技术栈与工具链
- **CSS 框架**：Tailwind CSS v4（通过 `@import "tailwindcss"` 引入，PostCSS 插件为 `@tailwindcss/postcss`）
- **样式合并策略**：组件统一使用 `cn()` 工具函数（基于 `clsx` + `tailwind-merge`），集中定义于 `src/lib/utils.ts`
- **主题模式**：基于 class 的 dark mode，根布局在 `<head>` 中注入脚本检测 `localStorage('theme-mode')` 和系统偏好，向 `document.documentElement` 添加/移除 `.dark` 类
- **字体加载**：Inter / Noto Sans SC / JetBrains Mono 通过 CSS 变量声明，无外部 font-loading 库

## 2. 设计令牌（Design Tokens）架构
令牌采用 **CSS 自定义属性 + Tailwind v4 `@theme inline` 映射** 的双层结构，权威源位于 `docs/designs/2026-07-23-design-system-inventory.md`。

- **CSS 变量层**（`src/app/globals.css`）：按语义分组定义 `--color-*`、`--shadow-*`、`--radius-*`、`--font-*`，并在 `:root` 与 `.dark` 两套上下文下分别赋值
- **Tailwind 映射层**：通过 `@theme inline { --color-accent: var(--color-accent); ... }` 将 CSS 变量暴露为 Tailwind utility 可用 token
- **分类维度**：
  - 品牌与语义色：`accent` / `success` / `warning` / `danger` / `purple` / `teal`
  - 流水线阶段色：`stage-ingest` / `stage-direct` / `stage-shot` / `stage-audio` / `stage-assemble` / `stage-finalize`
  - 中性色与表面：`bg` / `surface` / `fill` / `separator` / `canvas-bg` / `scrim`
  - 功能填充：`*-fill` 系列用于状态胶囊底、`overlay`、`canvas-grid`、`transparent`
  - 效果：`glass` / `glass-sidebar` / `tooltip-bg` / `player-bg` / `knob` / `shadow-card` / `shadow-float`

## 3. 组件库组织与约定
- 基础 UI 组件集中在 `src/components/ui/`，每个组件配套 `.demo.tsx` 演示文件
- 业务节点组件位于 `src/components/ui/node/`（StageNode / ShotNode / AudioNode / ExportNode）
- 图标体系统一使用 Lucide React，白名单与命名规范见设计系统文档；禁止 emoji
- 页面布局遵循 Sidebar(240px) + Center + Inspector(320px) 三栏骨架，详见设计文档 Zone C/D

## 4. 开发者应遵守的规则
1. **禁止硬编码颜色**：除色板展示区外，所有 fill/stroke/shadow 必须引用 `$变量`（即 CSS 变量名）
2. **阶段色按流水线语义归类**：输入/媒体用 teal，AI 编排用 purple，镜头生成用 accent 蓝，组装用 warning 橙，完成导出用 success 绿
3. **阴影分层**：卡片/节点用 `shadow-card`，浮层/弹窗/Toast 用 `shadow-float`
4. **暗色背景非纯黑**：`bg=#0F0F0F`，`canvas-bg=#0A0A0A`，与 surface/fill 形成层级
5. **功能 Token 必须落地**：状态胶囊底用 `*-fill`，彩色背景文字用 `text-inverse`，画布网格用 `canvas-grid`，透明占位用 `transparent`
6. **图标统一**：仅使用白名单中的 Lucide 图标，尺寸规范 14/16/20/24/48
7. **中文文本强制使用 `font-sc`**（Noto Sans SC）
8. **圆角取值**：`radius-sm/md/lg/xl/pill`，对应 6/10/14/20/999px