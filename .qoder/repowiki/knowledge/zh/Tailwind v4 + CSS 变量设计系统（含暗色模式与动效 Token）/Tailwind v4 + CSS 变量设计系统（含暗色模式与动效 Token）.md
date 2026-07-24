---
kind: frontend_style
name: Tailwind v4 + CSS 变量设计系统（含暗色模式与动效 Token）
category: frontend_style
scope:
    - '**'
source_files:
    - src/app/globals.css
    - src/app/layout.tsx
    - src/lib/motion/config.tsx
    - src/lib/motion/tokens.ts
    - src/lib/utils.ts
    - src/app/playbook/registry.ts
    - postcss.config.mjs
---

## 1. 系统与工具链
- 样式框架：Tailwind CSS v4（通过 `@tailwindcss/postcss` 插件集成），无传统 `tailwind.config.js`，所有主题扩展在 CSS 中以 `@theme inline` 声明。
- CSS 预处理：PostCSS 仅加载 Tailwind 插件，无 Sass/Less。
- 运行时样式合并：`clsx` + `tailwind-merge` 封装为 `cn()`（`src/lib/utils.ts`），用于条件化、去重合并 className。
- 动画库：`motion/react`（Framer Motion 新包名），通过全局 `<MotionConfig>` 统一过渡参数。
- 图标：`lucide-react`，并通过 Playbook 白名单管理可复用图标。
- 画布交互：`@xyflow/react`（React Flow），其光标行为在 `globals.css` 中覆盖。

## 2. 核心文件与位置
- 设计令牌与主题映射：`src/app/globals.css`（CSS 变量 + Tailwind `@theme inline` 映射）
- 根布局与暗色模式初始化：`src/app/layout.tsx`（内联脚本读取 `localStorage('theme-mode')` 并切换 `.dark`）
- 动效 token 与全局 Motion 配置：`src/lib/motion/config.tsx`、`src/lib/motion/tokens.ts`
- 样式工具函数：`src/lib/utils.ts`（`cn`）
- UI 组件库入口与文档注册表：`src/app/playbook/registry.ts`（登记 30+ 个 UI 组件族）
- PostCSS 配置：`postcss.config.mjs`
- Next.js 配置：`next.config.ts`（仅声明 serverExternalPackages，无样式相关 override）

## 3. 架构与设计约定
- **设计令牌权威源**：`docs/designs/2026-07-23-design-system-inventory.md` 是颜色、字体、圆角、动效等 token 的单一来源；CSS 变量与 Tailwind 主题均引用同一组命名（如 `--color-accent`、`--duration-base`、`--ease-standard`）。
- **双主题（Light/Dark）**：通过 CSS 类 `.dark` 切换，`globals.css` 中同时定义 light/dark 两套 CSS 变量，Tailwind `@theme inline` 将变量映射到语义化 token（`--color-*`、`--shadow-*`、`--radius-*`、`--animate-shimmer` 等）。
- **动效一致性**：CSS 中定义 `--duration-fast/base/slow` 与 `--ease-standard/emphasized/exit`；JS 侧 `motion/tokens.ts` 提供对应秒级数值与贝塞尔曲线，由 `AppMotionConfig` 作为默认 transition 注入全应用。
- **无障碍优先**：`prefers-reduced-motion: reduce` 下强制禁用所有动画/过渡；`motion` 的 `reducedMotion="user"` 与 CSS 规则形成双重保障。
- **组件库组织**：`src/components/ui/*` 每个原子组件独立 `.tsx` + 可选 `.demo.tsx`，通过 `playbook/registry.ts` 集中登记，便于视觉审计与 Storybook 式浏览。
- **画布光标定制**：针对 React Flow 的 grab/grabbing 光标使用 data URI SVG 覆盖，确保浅色/深色背景均可见，注释明确说明这是 data URI 限制下的受控例外。

## 4. 约定与约束
- 所有颜色、字体、圆角、阴影、动效必须通过 CSS 变量与 Tailwind `@theme inline` 暴露，禁止在组件中硬编码色值。
- 组件 className 合并统一走 `cn()`，保证 Tailwind 类冲突被正确解决。
- 暗色模式通过给 `<html>` 添加 `.dark` 类控制，初始值由 `layout.tsx` 中的内联脚本根据 `localStorage('theme-mode')` 或系统偏好决定。
- 动画时长与缓动曲线必须在 `lib/motion/tokens.ts` 中统一定义，组件通过 `MotionConfig` 继承默认过渡。
- 新增 UI 组件需在 `playbook/registry.ts` 中登记，保持设计系统清单与代码同步。
- 对第三方库（如 React Flow）样式的覆盖需通过高特异度选择器并在注释中说明原因，避免隐式依赖。