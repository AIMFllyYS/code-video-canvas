# 架构规范（Architecture Conventions）

> 目录分层、模块边界、依赖方向与演进策略。全局架构见 [平台架构设计](../designs/2026-07-23-platform-architecture-design.md)。

## 1. 分层

| 层 | 目录 | 职责 | 不做 |
|---|---|---|---|
| 路由 / API | `src/app` | 路由入口、route handlers、server actions 入口 | 业务逻辑 |
| 领域 | `src/features/*` | 按域聚合业务（canvas / director / render / ai / audio） | 跨域耦合 |
| 通用 / 适配 | `src/lib` | db / storage / queue / gsap / determinism 等 | 领域业务 |
| UI | `src/components/ui` | 纯展示组件 | 任何业务逻辑 |
| server-only | `src/server` | 仅服务端工具（`import 'server-only'`） | 被客户端 import |

## 2. 依赖方向（单向，禁反向）

```
app  →  features  →  lib
                     ↑
     components/ui ──┘（仅被引用，不引用业务）
```

- `src/app` 只编排，不承载业务；业务下沉 `features`。
- 跨域共享逻辑提升到 `lib`，不在 features 之间横向 import。
- `src/app/_dev/` → 正式代码单向；**正式代码禁止引用 `_dev/`**。

## 3. 领域模块结构

每个 `features/<域>/` 内部按需组织：`actions.ts`（写）、`queries.ts`（只读）、`schemas.ts`（Zod）、`types.ts`、`components/`。

- **canvas**：节点图、节点类型、画布状态。
- **director**：video-director 八阶段编排 + Pi agent（服务端）。
- **render**：HyperFrames 截帧循环、ffmpeg 封装、作业运行器。
- **ai**：StepFun `LlmAdapter`。
- **audio**：配音 / SFX / BGM / 字幕。

## 4. 适配器抽象（面向未来演进）

用接口隔离"可替换的基础设施"，Demo 用本地实现，未来换云 / 服务器只换实现：

- `LlmAdapter`：LLM 提供方（当前 StepFun）。
- `StorageAdapter`：对象存储（当前本地 FS，未来 S3 / COS / MinIO）。
- `DbAdapter` / `QueueAdapter`：当前 SQLite / 进程内，未来 PG / Redis。

## 5. 确定性与真源边界

- 渲染发生在**服务端**（Playwright/Chromium），不在浏览器。
- **音频是唯一时间地基**；锁定帧只来自音频实测，业务不得手改。
- 结构化数据以 Drizzle+SQLite 为单一真源；二进制产物经 `StorageAdapter`。
- 每镜以 shot 契约（HTML + `data-*` + token）为唯一视觉合同，可从上游重建。

## 6. 演进策略

- Demo：标准全栈 Next.js 单应用。
- 规模化 / 多团队：再拆多包 Monorepo（apps/packages）与独立服务；因此现在就把领域逻辑收敛在 `features/*`、`lib/*`，保证"抽包 = 搬运"。
- 分发：Electron 薄壳包裹同一应用（Phase 2）。

## 7. 组件复用与 SSOT（/playbook 组件手册）

- **单一真源（SSOT）**：每个前端 UI 组件只有一份权威实现，集中在 `src/components/*`；其他页面 / 功能一律 `import` 复用，**禁止复制粘贴或重复实现视觉原语**。
- **组件分层（原子化）**：
  - `components/ui/`：纯展示原语（Button / Card / Input …），无业务逻辑。
  - `components/icons/`：SVG 图标组件（多源自 Pencil 稿件）。
  - `components/motion/`（可选）：应用内交互动效原语。
  - `features/*/components/`：功能内组件，只能**组合** `components/ui`，不得重定义视觉原语（依赖方向单向：`features/*/components → components/ui`）。
- **/playbook 组件手册**：应用内「活文档 / 组件画廊」（应用内版 Storybook，零额外构建工具）。新增组件时在 `src/app/playbook/registry.ts` 登记并新建 `*.demo.tsx`；`/playbook` 按分类实时渲染展示。
- **确定性边界**：`components/*` 与 `/playbook` 属**应用 UI**，允许 hover / CSS transition / 交互动画；确定性红线（禁 rAF / 墙钟 / CSS 动画）**只约束视频 shot 渲染**（见 §5）。
- **Pencil → 组件工作流**：Pencil 稿（`.pen`）设计 → Pencil MCP（`export_html` / `export_nodes`）取标记 / SVG → 落为 `components/ui|icons/*` 的类型化命名导出组件 → `/playbook` 注册示例 → 各页 `import` 复用。
