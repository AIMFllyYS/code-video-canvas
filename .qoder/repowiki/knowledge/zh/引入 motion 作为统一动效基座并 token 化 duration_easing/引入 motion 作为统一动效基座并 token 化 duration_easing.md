---
kind: design
name: 引入 motion 作为统一动效基座并 token 化 duration/easing
source: session
category: adr
---

# 引入 motion 作为统一动效基座并 token 化 duration/easing

_来源：1c2efd8 → a42ca39 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
应用 UI 无动效体系：globals.css 无 duration/easing token，4 处收起/展开（左侧栏、画布 Inspector、分镜三列面板、导出设置面板）均为瞬时 JSX 切换零过渡；loading.tsx 硬编码 gray-300/900 违反 token 约定。

## 决策驱动
- 统一的缓动语义（duration/easing token）
- React 19 兼容
- 可全局降级到 prefers-reduced-motion

## 备选方案
- **手写 CSS transition + keyframes 控制所有动画** _（已否决）_ — 优点：零依赖；缺点：难以管理 4 处不同交互的复杂组合（宽度+淡入+旋转+拖拽置零），token 复用困难
- **引入 motion（framer-motion 现名）+ tokens.ts/config.tsx/variants.ts 三层抽象** — 优点：声明式 transition、AnimatePresence 管理挂载/卸载序列、reducedMotion 内置支持、与 React 19 兼容；缺点：新增运行时依赖（纯 JS，无需 onlyBuiltDependencies）
- **仅对 4 处交互分别加 CSS transition，不动框架** — 优点：改动面小；缺点：无法统一管理 token，chevron 旋转/抽屉滑入等组合动画实现繁琐且不一致

## 决策
pnpm add motion@^12，在 globals.css 中定义 --duration-fast/base/slow、--ease-standard/emphasized/exit 并通过 @theme inline 暴露，新建 lib/motion/tokens.ts、config.tsx（AppMotionConfig 挂到根 layout）、variants.ts（fadeInUp/slideInLeft/slideInRight/scrimFade/collapseWidth），并在 AppSidebar/canvas-inspector/shot-panels/export-workspace 四处以 collapsible-panel 抽象统一复用。

## 影响
所有收起/展开获得一致的缓动曲线与时长；系统开启减弱动态效果后自动降级为瞬时；新增交互可直接复用 variants 与 tokens。代价是引入 motion 运行时包体积。