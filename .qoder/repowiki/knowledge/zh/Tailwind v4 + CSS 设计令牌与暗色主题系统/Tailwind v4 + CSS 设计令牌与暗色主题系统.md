---
kind: frontend_style
name: Tailwind v4 + CSS 设计令牌与暗色主题系统
category: frontend_style
scope:
    - '**'
source_files:
    - src/app/globals.css
    - src/app/layout.tsx
    - src/app/(app)/settings/theme-control.tsx
    - src/lib/utils.ts
    - postcss.config.mjs
---

## 1. 体系概览

- **样式框架**：Tailwind CSS v4（通过 `@tailwindcss/postcss` 插件），在 `src/app/globals.css` 中以 `@import "tailwindcss"` 引入。
- **CSS 令牌优先**：所有颜色、圆角、阴影、字体、缓动曲线等视觉变量均先在 `:root` / `.dark` 下以原生 CSS 自定义属性定义，再通过 Tailwind v4 的 `@theme inline` 映射到 Tailwind 命名空间，形成「CSS 变量 → Tailwind 工具类」的单源权威。
- **暗色模式**：基于 class-based 的 `dark` 变体，配合 `@custom-variant dark (&:where(.dark, .dark *));` 实现；根 `<html>` 由首屏内联脚本与客户端 `ThemeControl` 共同维护 `document.documentElement.classList.toggle('dark', ...)`。
- **组件样式策略**：应用级 UI 组件位于 `src/components/ui/*`，全部使用 `cn(...)`（`clsx` + `tailwind-merge`）拼接 Tailwind 工具类；不写独立 CSS 模块或 SCSS。

## 2. 关键文件与包

- `src/app/globals.css` — 全局设计令牌、暗色主题、`@theme inline` 映射、`prefers-reduced-motion` 无障碍规则、骨架 shimmer 动画。
- `src/app/layout.tsx` — 首屏同步注入 `dark` class，避免闪烁。
- `src/app/(app)/settings/theme-control.tsx` — 浅色/深色/跟随系统的三段式切换，状态持久化至 `localStorage`。
- `src/lib/utils.ts` — 导出 `cn(...)` 合并函数（clsx + tailwind-merge）。
- `postcss.config.mjs` — 仅启用 `@tailwindcss/postcss`。
- `package.json` — 依赖 `tailwindcss@^4`、`@tailwindcss/postcss@^4`、`tailwind-merge@^3`。

## 3. 架构与约定

### 设计令牌分层
| 层级 | 位置 | 说明 |
|---|---|---|
| 语义层 | `:root` / `.dark` 下的 `--color-*`、`--radius-*`、`--shadow-*`、`--ease-*`、`--font-*` | 业务语义（accent/success/danger）、流水线阶段色（`--color-stage-*`）、中性表面、功能填充等 |
| 映射层 | `@theme inline { --color-accent: var(--color-accent); ... }` | 将 CSS 变量暴露为 Tailwind 工具类（如 `bg-accent`、`text-label-secondary`、`rounded-lg`、`shadow-card`、`ease-emphasized`） |
| 使用层 | 组件 `className={cn(...)}` 中直接调用 Tailwind 工具类 | 组件不再感知 CSS 变量名 |

### 暗色主题机制
- 根布局首屏执行内联脚本，根据 `localStorage.theme-mode` 与 `prefers-color-scheme` 立即设置 `dark` class，避免 SSR/CSR 闪烁。
- 运行时由 `ThemeControl.applyTheme()` 监听用户选择并更新 `classList`。
- 所有令牌在 `.dark` 块中提供覆盖值，无需额外逻辑。

### 组件样式规范
- 统一通过 `cn(...)` 组合基础样式、变体（variant）、尺寸（size）与外部传入的 `className`。
- 变体与尺寸以常量对象集中声明（见 `Button` 的 `VARIANTS` / `SIZES`），保证全应用一致。
- 视频渲染产物（shot artifact）是独立 HTML+GSAP，不引用本样式表，因此 `prefers-reduced-motion` 仅约束应用 UI。

## 4. 开发者应遵循的规则

1. **新增视觉变量**：一律先写入 `globals.css` 的 `:root` 与 `.dark` 对应块，再在 `@theme inline` 中映射，禁止在组件里硬编码十六进制色值。
2. **使用语义化 Token**：优先用 `bg-accent-fill`、`text-label-secondary`、`shadow-card`、`rounded-md`、`ease-emphasized` 等 Tailwind 工具类，而非直接写 `#007AFF` 或 `cubic-bezier(...)`。
3. **暗色适配**：任何新 token 必须在 `.dark` 块中提供覆盖值，确保明暗双主题可用。
4. **组件 className 合并**：必须通过 `cn(...)` 合并，以便外部覆盖且自动去重冲突。
5. **动效与可访问性**：不要绕过 `prefers-reduced-motion`；如需自定义动画，使用 `--animate-shimmer` 这类已暴露的 token。
6. **主题切换**：修改主题行为时只改 `ThemeControl` 与 `layout.tsx` 的首屏脚本，不要在组件内部自行操作 `documentElement.classList`。