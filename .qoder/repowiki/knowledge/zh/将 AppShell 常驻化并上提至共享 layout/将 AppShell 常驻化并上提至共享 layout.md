---
kind: design
name: 将 AppShell 常驻化并上提至共享 layout
source: session
category: adr
---

# 将 AppShell 常驻化并上提至共享 layout

_来源：1c2efd8 → a42ca39 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
AppShell 被包裹在每个 page.tsx/客户端组件内，导致路由切换时侧栏整体卸载重挂；同时 usePersistentToggle/useResizablePanel/useMediaQuery 先渲染默认值再读 localStorage，造成每次切页左侧栏展开到收起的闪烁。

## 决策驱动
- 消除切页闪烁（DOM 不重挂）
- 统一侧栏状态源（单一 Provider）
- 保持 URL 不变与 playbook 独立

## 备选方案
- **在每页各自渲染 AppShell（现状）** _（已否决）_ — 优点：改动最小；缺点：切页卸载重挂、localStorage 读取时序导致闪烁、状态分散
- **把 AppShell 提升到 (app)/layout.tsx 作为唯一渲染点 + NavContextProvider 发布上下文** — 优点：侧栏常驻不重挂、状态集中、页面只负责发布可信 projectId/rendererNodeId；缺点：需要把现有 6 个页面移入路由组、新增 nav-context 模块
- **用 CSS sticky/fixed 固定侧栏但保留每页 AppShell** — 优点：无需路由结构变更；缺点：无法解决 localStorage 读取时序导致的初始闪烁，且状态仍分散在各页

## 决策
新建 src/app/(app)/layout.tsx 作为唯一 AppShell 渲染位置，把首页/projects/settings/canvas/playbook 外的页面移入该路由组；新增 features/navigation/nav-context.tsx 提供 NavContextProvider/useNavContext/usePublishNavContext，页面通过 effect 发布可信上下文，侧栏由壳消费。

## 影响
侧栏 DOM 不再随路由切换重挂，彻底消除闪烁；页面与侧栏解耦为发布-订阅模式，后续新增侧栏功能只需订阅 context。playbook 保持在组外维持独立入口。需确保根级 error/not-found/global-error 仍在 src/app/ 以不被路由组吞掉。