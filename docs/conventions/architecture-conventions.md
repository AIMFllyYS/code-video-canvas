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
| 运行时启动 | `src/instrumentation.ts` | Next Node runtime 的幂等注册/启动钩子 | 领域业务与请求逻辑 |

## 2. 依赖方向（单向，禁反向）

```
app  →  features  →  lib
                     ↑
     components/ui ──┘（仅被引用，不引用业务）
```

- `src/app` 只编排，不承载业务；业务下沉 `features`。
- 跨域共享逻辑提升到 `lib`，普通领域模块不在 features 之间横向 import。
- 显式应用编排器是唯一例外：当前仅 `features/director/stage-runner.ts` 可通过其他领域的**公开入口**组合状态机、会话与产物；不得 import 对方内部文件或直接操作其数据库细节。
- `src/app/_dev/` → 正式代码单向；**正式代码禁止引用 `_dev/`**。

## 3. 领域模块结构

每个 `features/<域>/` 内部按需组织：`actions.ts`（写）、`queries.ts`（只读）、`schemas.ts`（Zod）、`types.ts`、`components/`。

- **canvas**：节点图、节点类型、画布状态。
- **director**：video-director 六阶段编排 + Pi agent（服务端）；节点输入存于 `canvas_nodes.data.directorInput`，`stage-prompt.ts` 做类型化路由，`runtime-repository.ts` 封装持久化。
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
- 新产物按“复验同一内容 → StorageAdapter → SQLite 索引”提交；索引失败必须补偿删除文件。不得相信调用方传入的“已校验”布尔值。
- Agent Tool 不得接收并决定 artifact 的 `projectId` / `nodeId` / `key`；这些授权字段只能由 stage runner 的持久执行上下文提供给可信写服务。
- 每镜以 shot 契约（HTML + `data-*` + token）为唯一视觉合同，可从上游重建。
- shot HTML 必须暴露 `window.__CVC_RENDER__ = { version: 1, seek(frame, fps) }`；
  同一页面只允许串行 seek。帧序列落隔离临时目录并显式 cleanup，禁止用
  `Buffer[]` 常驻整段 1080p 视频。
- Render/API 遵循与 Director 相同的信任边界：路由只调用领域 enqueue/export
  service，项目归属、artifact 路径与稳定顺序由 repository/可信服务决定。

## 6. 演进策略

- Demo：标准全栈 Next.js 单应用。
- 规模化 / 多团队：再拆多包 Monorepo（apps/packages）与独立服务；因此现在就把领域逻辑收敛在 `features/*`、`lib/*`，保证"抽包 = 搬运"。
- 分发：Electron 薄壳包裹同一应用（Phase 2）。

### 6.1 后台执行与状态机

- 入队入口先验证 project/node/stage/状态组合，再合法推进 `idle|failed|stale → pending`；runner 只执行 `pending → running → success|failed`。禁止为了省步骤直接写状态或让无效作业先入队后失败。
- 当前 enqueue 与节点状态不是同一事务；enqueue 失败必须把已 pending 节点补偿到 failed 并记录错误。未来替换事务 outbox 时保持 `enqueueDirectorStage()` 领域 API 不变。
- Director 作业统一由 `enqueueDirectorStage()` 创建；Next 应用在根 `src/instrumentation.ts` 的 Node runtime 中幂等注册 handler 并启动队列。
- 阶段 prompt 必须从持久输入经原生 builder 构建；恢复执行不得依赖请求内临时对象或 Pi JSONL 反推业务输入。

## 7. 组件复用与 SSOT（/playbook 组件手册）

> 视觉权威源：[设计系统清单](../designs/2026-07-23-design-system-inventory.md)（Token / 颜色 / 图标 / 组件 / 布局）+ [`canvas.pen`](../designs/canvas.pen)（视觉源稿）。

- **单一真源（SSOT）**：每个前端 UI 组件只有一份权威实现，集中在 `src/components/*`；其他页面 / 功能一律 `import` 复用，**禁止复制粘贴或重复实现视觉原语**。
- **设计 Token 强制**：颜色 / 阴影 / 圆角 / 间距必须引用设计系统变量，**禁止硬编码 hex / rgba**。关键约束：
  - 暗色背景 `bg` = `#0F0F0F`、`canvas-bg` = `#0A0A0A`（非纯黑）。
  - 已删除通用色 `pink`、`indigo` 不得使用。
  - 阴影统一：卡片/节点 `$shadow-card`，浮层/弹窗 `$shadow-float`。
  - 阶段色按流水线语义归类（teal / purple / accent / warning / success），不再用彩虹板。
- **图标体系**：统一 Lucide（`lucide-react`），白名单制（见设计系统 §6.2），禁 emoji；命名用 v0.400+ 标准名（如 `circle-plus`、`loader-circle`、`triangle-alert`）。
- **组件分层（原子化）**：
  - `components/ui/`：纯展示原语（Button / Card / Input …），无业务逻辑。
  - `components/icons/`：Lucide 图标组件（多源自 Pencil 稿件）。
  - `components/motion/`（可选）：应用内交互动效原语。
  - `features/*/components/`：功能内组件，只能**组合** `components/ui`，不得重定义视觉原语（依赖方向单向：`features/*/components → components/ui`）。
- **/playbook 组件手册**：应用内「活文档 / 组件画廊」（应用内版 Storybook，零额外构建工具）。新增组件时在 `src/app/playbook/registry.ts` 登记并新建 `*.demo.tsx`；`/playbook` 按分类实时渲染展示。
- **确定性边界**：`components/*` 与 `/playbook` 属**应用 UI**，允许 hover / CSS transition / 交互动画；确定性红线（禁 rAF / 墙钟 / CSS 动画）**只约束视频 shot 渲染**（见 §5）。
- **Pencil → 组件工作流**：Pencil 稿（`.pen`）设计 → Pencil MCP（`export_html` / `export_nodes`）取标记 / SVG → 落为 `components/ui|icons/*` 的类型化命名导出组件 → `/playbook` 注册示例 → 各页 `import` 复用。颜色/间距/圆角均引用 `.pen` 中定义的 Design Token（见设计系统 §3）。
- **双主题**：所有颜色变量均为 `light | dark` 双值；页面根节点通过 `theme.mode` 切换，组件实现必须同时支持两主题。
